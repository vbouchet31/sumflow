import { BUILDINGS, type BuildingType } from '../config/buildings';
import { CHUNK_SIZE, chunkOf, type Dir, key, type Rot, unkey } from '../core/grid';
import { EventBus } from '../core/events';
import type { DepositMap } from '../world/chunks';
import {
  type Axis,
  type Belt,
  type Bridge,
  type Building,
  dirMask,
  laneNode,
  buildingSize,
  footprintTiles,
  isOperator,
  type PortFace,
  portFaces,
  portKey,
} from './entities';
import { type BuildingSnap, type Change, sameSnap, type TileSnap } from './journal';
import { computeNetwork, type BeltNetwork } from './network';
import type { OutputGroup } from './outputs';
import type { Emit, ProgressionEvents } from './progression';
import type { GameState } from './state';
import { DeliveryStats } from './stats';

export type SimEvents = ProgressionEvents & {
  networkChanged: Record<string, never>;
  /** A belt was added, changed or removed on this tile (for render caches). */
  beltChanged: { x: number; y: number };
  /**
   * A building or bridge appeared or went away over these tiles (inclusive): belts next to
   * them may now be drawn joined to them, or not.
   */
  tilesChanged: { x0: number; y0: number; x1: number; y1: number };
};

export interface PortRef {
  building: Building;
  port: PortFace;
}

const chunkId = (cx: number, cy: number): string => `${cx},${cy}`;

function newBelt(x: number, y: number, outputs: number): Belt {
  return {
    x,
    y,
    outputs,
    item: null,
    rr: 0,
    rrIn: 0,
    priority: null,
    vacatedTick: -1,
    vacatedCarry: 0,
  };
}

/** The only output direction of a belt, or null if it has zero or several. */
export function singleOutput(b: Belt): Dir | null {
  for (let d = 0; d < 4; d++) if (b.outputs === 1 << d) return d as Dir;
  return null;
}

/**
 * Simulation world: the saved `state` plus derived indexes (occupancy, ports, chunk
 * buckets, belt order). All mutations go through this class so indexes stay in sync.
 * No DOM, no rendering (PLAN §13.2).
 */
export class World {
  readonly events = new EventBus<SimEvents>();
  /** Tile key → building id. */
  readonly occupancy = new Map<number, number>();
  /** Port key (tile key × 4 + face) → port. */
  readonly ports = new Map<number, PortRef>();
  /** Port faces per building id, in deterministic order. */
  readonly buildingPorts = new Map<number, PortFace[]>();
  /** Chunk id → belt keys, for culling. */
  readonly beltChunks = new Map<string, Set<number>>();
  /** Chunk id → bridge keys, for culling. */
  readonly bridgeChunks = new Map<string, Set<number>>();
  /** Chunk id (of origin) → building ids, for culling. */
  readonly buildingChunks = new Map<string, Set<number>>();
  /** Port key → tick of the last direct building-to-building transfer (runtime only). */
  readonly directTransfers = new Map<number, number>();
  /** Hub deliveries over the last minute (runtime only). */
  readonly stats = new DeliveryStats();
  /** Output faces and their targets per building and port kind (see `outputGroup`). */
  readonly outputGroups = new Map<number, OutputGroup>();
  private network: BeltNetwork | null = null;
  /** Slots touched by the open change, with their state before it (undo journal). */
  private journal: {
    tiles: Map<number, TileSnap | null>;
    buildings: Map<number, BuildingSnap | null>;
    markers: Map<number, string | null>;
  } | null = null;
  private journalDepth = 0;

  constructor(
    readonly state: GameState,
    readonly deposits: DepositMap,
  ) {
    for (const b of state.buildings.values()) this.indexBuilding(b);
    for (const [k, belt] of state.belts) this.indexTile(this.beltChunks, k, belt.x, belt.y);
    for (const [k, br] of state.bridges) this.indexTile(this.bridgeChunks, k, br.x, br.y);
    this.stats.advance(state.tick);
    this.events.on('delivered', ({ value }) => this.stats.record(value));
  }

  /** Belt order and merge inputs, recomputed lazily after network changes. */
  getNetwork(): BeltNetwork {
    this.network ??= computeNetwork(this);
    return this.network;
  }

  /** Emitter handed to progression code (narrower event set). */
  readonly emit: Emit = (type, payload) =>
    this.events.emit(type, payload as SimEvents[typeof type]);

  private invalidate(): void {
    this.network = null;
    this.outputGroups.clear();
    this.events.emit('networkChanged', {});
  }

  buildingAt(x: number, y: number): Building | null {
    const id = this.occupancy.get(key(x, y));
    return id === undefined ? null : (this.state.buildings.get(id) ?? null);
  }

  /** Plain belt at a tile (not a bridge lane). */
  beltAt(x: number, y: number): Belt | null {
    return this.state.belts.get(key(x, y)) ?? null;
  }

  bridgeAt(x: number, y: number): Bridge | null {
    return this.state.bridges.get(key(x, y)) ?? null;
  }

  /**
   * The belt-like node an item moving along `axis` meets at `(x, y)`: the plain belt there,
   * or the bridge lane of that axis. Returns its network key too.
   */
  laneAt(x: number, y: number, axis: Axis): { belt: Belt; node: number } | null {
    const k = key(x, y);
    const belt = this.state.belts.get(k);
    if (belt) return { belt, node: k };
    const br = this.state.bridges.get(k);
    const lane = br ? (axis === 0 ? br.h : br.v) : null;
    return lane ? { belt: lane, node: laneNode(k, axis) } : null;
  }

  /** Belt (or lane) for a network node key. */
  nodeBelt(node: number): Belt | null {
    if (node >= 0) return this.state.belts.get(node) ?? null;
    const m = -node - 1;
    const br = this.state.bridges.get(Math.floor(m / 2));
    if (!br) return null;
    return m % 2 === 0 ? br.h : br.v;
  }

  /** Every belt and bridge lane with its node key. */
  *nodes(): Generator<[number, Belt]> {
    yield* this.state.belts;
    for (const [k, br] of this.state.bridges) {
      if (br.h) yield [laneNode(k, 0), br.h];
      if (br.v) yield [laneNode(k, 1), br.v];
    }
  }

  portAt(x: number, y: number, face: Dir): PortRef | null {
    return this.ports.get(portKey(key(x, y), face)) ?? null;
  }

  // ---- undo journal ------------------------------------------------------

  /** Start recording structural changes. Nested calls join the outer change. */
  beginChange(): void {
    if (this.journalDepth++ === 0) {
      this.journal = { tiles: new Map(), buildings: new Map(), markers: new Map() };
    }
  }

  /**
   * Stop recording. The outermost call returns the change (null when nothing structural
   * changed, or for a nested call).
   */
  endChange(): Change | null {
    if (this.journalDepth === 0) return null;
    if (--this.journalDepth > 0) return null;
    const j = this.journal;
    this.journal = null;
    if (!j) return null;
    const change: Change = { tiles: new Map(), buildings: new Map(), markers: new Map() };
    for (const [k, before] of j.tiles) {
      const after = this.tileSnap(k);
      if (!sameSnap(before, after)) change.tiles.set(k, { before, after });
    }
    for (const [id, before] of j.buildings) {
      const after = this.buildingSnap(id);
      if (!sameSnap(before, after)) change.buildings.set(id, { before, after });
    }
    for (const [k, before] of j.markers) {
      const after = this.state.markers.get(k)?.text ?? null;
      if (before !== after) change.markers.set(k, { before, after });
    }
    const empty = change.tiles.size + change.buildings.size + change.markers.size === 0;
    return empty ? null : change;
  }

  private noteTile(k: number): void {
    if (this.journal && !this.journal.tiles.has(k)) this.journal.tiles.set(k, this.tileSnap(k));
  }

  private noteBuilding(id: number): void {
    if (this.journal && !this.journal.buildings.has(id)) {
      this.journal.buildings.set(id, this.buildingSnap(id));
    }
  }

  private noteMarker(k: number): void {
    if (this.journal && !this.journal.markers.has(k)) {
      this.journal.markers.set(k, this.state.markers.get(k)?.text ?? null);
    }
  }

  /** Layout of the belt or bridge at a tile key. */
  tileSnap(k: number): TileSnap | null {
    const belt = this.state.belts.get(k);
    if (belt) return { kind: 'belt', outputs: belt.outputs, priority: belt.priority };
    const br = this.state.bridges.get(k);
    if (br) {
      return {
        kind: 'bridge',
        h: br.h ? singleOutput(br.h) : null,
        v: br.v ? singleOutput(br.v) : null,
      };
    }
    return null;
  }

  buildingSnap(id: number): BuildingSnap | null {
    const b = this.state.buildings.get(id);
    if (!b) return null;
    return {
      type: b.type,
      x: b.x,
      y: b.y,
      rot: b.rot,
      mirror: b.mirror === true,
      priority: b.priority,
      extractValue: b.extractValue ?? null,
    };
  }

  /**
   * Put every slot of `change` back to its `side` state (undo = 'before', redo = 'after').
   * Buildings first (removals, then additions), then tiles, then markers. Live items on
   * objects that survive are kept; destroyed items never come back.
   */
  applyChange(change: Change, side: 'before' | 'after'): void {
    if (this.journal) throw new Error('applyChange inside an open change');
    const same = (b: Building, s: BuildingSnap): boolean =>
      b.type === s.type &&
      b.x === s.x &&
      b.y === s.y &&
      b.rot === s.rot &&
      (b.mirror === true) === s.mirror;
    for (const [id, c] of change.buildings) {
      const target = c[side];
      const cur = this.state.buildings.get(id);
      if (cur && (!target || !same(cur, target))) this.removeBuilding(id);
    }
    for (const [id, c] of change.buildings) {
      const target = c[side];
      if (!target) continue;
      const cur = this.state.buildings.get(id);
      if (cur) {
        cur.priority = target.priority;
        if (target.extractValue !== null) cur.extractValue = target.extractValue;
      } else {
        this.insertBuilding(this.makeBuilding(id, target), target.priority);
      }
    }
    for (const [k, c] of change.tiles) {
      const target = c[side];
      const { x, y } = unkey(k);
      if (!target) {
        this.removeBelt(x, y);
        this.removeBridge(x, y);
      } else if (target.kind === 'belt') {
        const belt = this.setBelt(x, y, target.outputs);
        belt.priority = target.priority;
      } else {
        this.setBridge(x, y, target.h, target.v);
      }
    }
    for (const [k, c] of change.markers) {
      const { x, y } = unkey(k);
      this.setMarker(x, y, c[side]);
    }
    this.invalidate();
  }

  // ---- priorities and markers ---------------------------------------------

  /** Set a belt's (or lane's) prioritised output (PLAN §6.6). */
  setBeltPriority(belt: Belt, dir: Dir | null): void {
    this.noteTile(key(belt.x, belt.y));
    belt.priority = dir;
  }

  /** Set a building's prioritised output face (port key), or null. */
  setBuildingPriority(b: Building, portKey: number | null): void {
    this.noteBuilding(b.id);
    b.priority = portKey;
  }

  /** Create, edit (non-empty text) or delete (null or empty text) the marker of a tile. */
  setMarker(x: number, y: number, text: string | null): void {
    const k = key(x, y);
    this.noteMarker(k);
    if (text === null || text === '') this.state.markers.delete(k);
    else this.state.markers.set(k, { x, y, text });
  }

  // ---- belts -------------------------------------------------------------

  /** Create or overwrite a belt. Keeps the existing item when overwriting. */
  setBelt(x: number, y: number, outputs: number): Belt {
    const k = key(x, y);
    this.noteTile(k);
    const existing = this.state.belts.get(k);
    this.events.emit('beltChanged', { x, y });
    if (existing) {
      existing.outputs = outputs;
      if (existing.priority !== null && (outputs & (1 << existing.priority)) === 0) {
        existing.priority = null;
      }
      this.invalidate();
      return existing;
    }
    this.removeBridge(x, y);
    const belt = newBelt(x, y, outputs);
    this.state.belts.set(k, belt);
    this.indexTile(this.beltChunks, k, x, y);
    this.invalidate();
    return belt;
  }

  /**
   * Create or update a bridge (PLAN §6.7). A lane given `undefined` keeps its current state;
   * `null` removes it; a direction sets it (keeping its item if the axis matches). A plain
   * belt on the tile becomes the lane of its own axis.
   */
  setBridge(x: number, y: number, h: Dir | null | undefined, v: Dir | null | undefined): Bridge {
    const k = key(x, y);
    this.noteTile(k);
    let br = this.state.bridges.get(k);
    if (!br) {
      br = { x, y, h: null, v: null };
      const old = this.removeBelt(x, y);
      if (old) {
        // Keep the straight belt as the lane of its axis, with its item.
        const d = singleOutput(old);
        if (d !== null) {
          const lane = newBelt(x, y, dirMask(d));
          lane.item = old.item;
          if (d % 2 === 1) br.h = lane;
          else br.v = lane;
        }
      }
      this.state.bridges.set(k, br);
      this.indexTile(this.bridgeChunks, k, x, y);
    }
    const apply = (cur: Belt | null, d: Dir | null | undefined): Belt | null => {
      if (d === undefined) return cur;
      if (d === null) return null;
      if (cur) {
        cur.outputs = dirMask(d);
        return cur;
      }
      return newBelt(x, y, dirMask(d));
    };
    br.h = apply(br.h, h);
    br.v = apply(br.v, v);
    this.events.emit('tilesChanged', { x0: x, y0: y, x1: x, y1: y });
    this.invalidate();
    return br;
  }

  /** Remove a bridge and both its lanes (PLAN §6.7). */
  removeBridge(x: number, y: number): Bridge | null {
    const k = key(x, y);
    const br = this.state.bridges.get(k);
    if (!br) return null;
    this.noteTile(k);
    this.state.bridges.delete(k);
    const { cx, cy } = chunkOf(x, y);
    this.bridgeChunks.get(chunkId(cx, cy))?.delete(k);
    this.events.emit('tilesChanged', { x0: x, y0: y, x1: x, y1: y });
    this.invalidate();
    return br;
  }

  removeBelt(x: number, y: number): Belt | null {
    const k = key(x, y);
    const belt = this.state.belts.get(k);
    if (!belt) return null;
    this.noteTile(k);
    this.state.belts.delete(k);
    const { cx, cy } = chunkOf(x, y);
    this.beltChunks.get(chunkId(cx, cy))?.delete(k);
    this.events.emit('beltChanged', { x, y });
    this.invalidate();
    return belt;
  }

  private indexTile(index: Map<string, Set<number>>, k: number, x: number, y: number): void {
    const { cx, cy } = chunkOf(x, y);
    const id = chunkId(cx, cy);
    let set = index.get(id);
    if (!set) {
      set = new Set();
      index.set(id, set);
    }
    set.add(k);
  }

  // ---- buildings ---------------------------------------------------------

  /** True if every tile of the footprint is free of buildings. Belts do not block. */
  isFootprintFree(type: BuildingType, x: number, y: number, rot: number, mirror = false): boolean {
    return footprintTiles(type, x, y, rot, mirror).every((t) => !this.occupancy.has(key(t.x, t.y)));
  }

  /**
   * Add a building. Belts under its footprint are removed (replaced). The caller is
   * responsible for validity (free footprint, deposit for extractors).
   */
  addBuilding(
    type: BuildingType,
    x: number,
    y: number,
    rot: Rot,
    extra: { extractValue?: number; mirror?: boolean } = {},
  ): Building {
    const b = this.makeBuilding(this.state.nextBuildingId, {
      type,
      x,
      y,
      rot,
      mirror: extra.mirror === true,
      priority: null,
      extractValue: extra.extractValue ?? null,
    });
    return this.insertBuilding(b, null);
  }

  /** A fresh building (empty buffers) from a layout snapshot. */
  private makeBuilding(id: number, s: BuildingSnap): Building {
    const def = BUILDINGS[s.type];
    const b: Building = {
      id,
      type: s.type,
      x: s.x,
      y: s.y,
      rot: def.rotatable ? s.rot : 0,
      rrOut: 0,
      priority: null,
    };
    if (def.rotatable && s.mirror) b.mirror = true;
    if (s.extractValue !== null) {
      b.extractValue = s.extractValue;
      b.extractAcc = 0;
    }
    if (s.type === 'storage') {
      b.storeValue = null;
      b.storeCount = 0;
    }
    if (isOperator(s.type)) {
      b.inA = [];
      b.inB = [];
      b.cycle = -1;
      if (s.type === 'divider') {
        b.outQ = [];
        b.outR = [];
      } else {
        b.out = [];
      }
    }
    return b;
  }

  private insertBuilding(b: Building, priority: number | null): Building {
    for (const t of footprintTiles(b.type, b.x, b.y, b.rot, b.mirror)) {
      this.removeBelt(t.x, t.y);
      this.removeBridge(t.x, t.y);
    }
    this.noteBuilding(b.id);
    b.priority = priority;
    this.state.buildings.set(b.id, b);
    this.state.nextBuildingId = Math.max(this.state.nextBuildingId, b.id + 1);
    this.indexBuilding(b);
    this.emitFootprint(b);
    this.invalidate();
    return b;
  }

  removeBuilding(id: number): Building | null {
    const b = this.state.buildings.get(id);
    if (!b || b.type === 'hub') return null;
    this.noteBuilding(id);
    this.state.buildings.delete(id);
    for (const t of footprintTiles(b.type, b.x, b.y, b.rot, b.mirror))
      this.occupancy.delete(key(t.x, t.y));
    for (const p of this.buildingPorts.get(id) ?? [])
      this.ports.delete(portKey(key(p.x, p.y), p.face));
    this.buildingPorts.delete(id);
    const { cx, cy } = chunkOf(b.x, b.y);
    this.buildingChunks.get(chunkId(cx, cy))?.delete(id);
    this.emitFootprint(b);
    this.invalidate();
    return b;
  }

  private emitFootprint(b: Building): void {
    const { w, h } = buildingSize(b.type, b.rot);
    this.events.emit('tilesChanged', { x0: b.x, y0: b.y, x1: b.x + w - 1, y1: b.y + h - 1 });
  }

  private indexBuilding(b: Building): void {
    for (const t of footprintTiles(b.type, b.x, b.y, b.rot, b.mirror))
      this.occupancy.set(key(t.x, t.y), b.id);
    const faces = portFaces(b.type, b.x, b.y, b.rot, b.mirror);
    this.buildingPorts.set(b.id, faces);
    for (const p of faces) this.ports.set(portKey(key(p.x, p.y), p.face), { building: b, port: p });
    const { cx, cy } = chunkOf(b.x, b.y);
    const id = chunkId(cx, cy);
    let set = this.buildingChunks.get(id);
    if (!set) {
      set = new Set();
      this.buildingChunks.set(id, set);
    }
    set.add(b.id);
  }

  /** Belts in chunks overlapping the tile rectangle (inclusive). */
  *beltsInRect(x0: number, y0: number, x1: number, y1: number): Generator<Belt> {
    for (let cy = Math.floor(y0 / CHUNK_SIZE); cy <= Math.floor(y1 / CHUNK_SIZE); cy++) {
      for (let cx = Math.floor(x0 / CHUNK_SIZE); cx <= Math.floor(x1 / CHUNK_SIZE); cx++) {
        const set = this.beltChunks.get(chunkId(cx, cy));
        if (!set) continue;
        for (const k of set) {
          const b = this.state.belts.get(k);
          if (b) yield b;
        }
      }
    }
  }

  /** Bridges in chunks overlapping the tile rectangle (inclusive). */
  *bridgesInRect(x0: number, y0: number, x1: number, y1: number): Generator<Bridge> {
    for (let cy = Math.floor(y0 / CHUNK_SIZE); cy <= Math.floor(y1 / CHUNK_SIZE); cy++) {
      for (let cx = Math.floor(x0 / CHUNK_SIZE); cx <= Math.floor(x1 / CHUNK_SIZE); cx++) {
        const set = this.bridgeChunks.get(chunkId(cx, cy));
        if (!set) continue;
        for (const k of set) {
          const b = this.state.bridges.get(k);
          if (b) yield b;
        }
      }
    }
  }

  /** Buildings whose origin chunk is within one chunk of the rectangle. */
  *buildingsInRect(x0: number, y0: number, x1: number, y1: number): Generator<Building> {
    for (let cy = Math.floor(y0 / CHUNK_SIZE) - 1; cy <= Math.floor(y1 / CHUNK_SIZE); cy++) {
      for (let cx = Math.floor(x0 / CHUNK_SIZE) - 1; cx <= Math.floor(x1 / CHUNK_SIZE); cx++) {
        const set = this.buildingChunks.get(chunkId(cx, cy));
        if (!set) continue;
        for (const id of set) {
          const b = this.state.buildings.get(id);
          if (b) yield b;
        }
      }
    }
  }
}
