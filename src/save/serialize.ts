import { TICK_RATE } from '../config/balance';
import { type Dir, key } from '../core/grid';
import { type Belt, type Building, footprintTiles, type Item } from '../sim/entities';
import { createInitialState, type GameState } from '../sim/state';
import { singleOutput, type World } from '../sim/world';
import {
  SAVE_VERSION,
  type SaveData,
  SaveError,
  type SavedBuilding,
  type SavedItem,
  type SavedLane,
} from './schema';

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

function saveItem(item: Item | null): SavedItem | null {
  return item ? [item.value, item.progress, item.from] : null;
}

function loadItem(s: SavedItem | null): Item | null {
  return s ? { value: s[0], progress: s[1], from: s[2], stamp: -1 } : null;
}

function saveLane(lane: Belt | null): SavedLane | null {
  if (!lane) return null;
  const d = singleOutput(lane);
  if (d === null) return null;
  return { dir: d, rr: lane.rr, rrIn: lane.rrIn, item: saveItem(lane.item) };
}

function makeBelt(x: number, y: number, outputs: number): Belt {
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

function saveBuilding(b: Building): SavedBuilding {
  const s: SavedBuilding = {
    id: b.id,
    type: b.type,
    x: b.x,
    y: b.y,
    rot: b.rot,
    rrOut: b.rrOut,
    priority: b.priority,
  };
  if (b.mirror) s.mirror = true;
  if (b.extractValue !== undefined) s.extractValue = b.extractValue;
  if (b.extractAcc !== undefined) s.extractAcc = b.extractAcc;
  for (const k of ['inA', 'inB', 'out', 'outQ', 'outR'] as const) {
    const buf = b[k];
    if (buf) s[k] = [...buf];
  }
  if (b.cycle !== undefined) s.cycle = b.cycle;
  if (b.storeValue !== undefined) s.storeValue = b.storeValue;
  if (b.storeCount !== undefined) s.storeCount = b.storeCount;
  return s;
}

function loadBuilding(s: SavedBuilding): Building {
  const b: Building = {
    id: s.id,
    type: s.type,
    x: s.x,
    y: s.y,
    rot: s.rot,
    rrOut: s.rrOut,
    priority: s.priority,
  };
  if (s.mirror) b.mirror = true;
  if (s.extractValue !== undefined) b.extractValue = s.extractValue;
  if (s.extractAcc !== undefined) b.extractAcc = s.extractAcc;
  for (const k of ['inA', 'inB', 'out', 'outQ', 'outR'] as const) {
    const buf = s[k];
    if (buf) b[k] = [...buf];
  }
  if (s.cycle !== undefined) b.cycle = s.cycle;
  if (s.storeValue !== undefined) b.storeValue = s.storeValue;
  if (s.storeCount !== undefined) b.storeCount = s.storeCount;
  return b;
}

/** Snapshot of the game (PLAN §11.3). Runtime-only fields are left out. */
export function serialize(world: World, camera: CameraState, savedAt = ''): SaveData {
  const s = world.state;
  const byId = [...s.buildings.values()].sort((a, b) => a.id - b.id);
  const belts = [...s.belts.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b);
  const bridges = [...s.bridges.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b);
  const markers = [...s.markers.entries()].sort((a, b) => a[0] - b[0]).map(([, m]) => m);
  const copyTrack = <T, U>(r: Record<string, T>, f: (v: T) => U): Record<string, U> =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, f(v)]));
  return {
    version: SAVE_VERSION,
    seed: s.seed,
    tick: s.tick,
    playTimeMs: Math.round((s.tick * 1000) / TICK_RATE),
    savedAt,
    level: s.level,
    levels: s.levels.map((l) => [l.target, l.quantity, l.final]),
    levelRequirement: s.levelRequirement ? { ...s.levelRequirement } : null,
    finishedAtTick: s.finishedAtTick,
    maxExtraction: s.maxExtraction,
    unlockedBuildings: [...s.unlockedBuildings],
    unlockedFeatures: [...s.unlockedFeatures],
    upgrades: { ...s.upgrades },
    upgradeSeqs: copyTrack(s.upgradeSeqs, (v) => [...v]) as SaveData['upgradeSeqs'],
    upgradeReqs: copyTrack(s.upgradeReqs, (v) =>
      v.map((r) => ({ ...r })),
    ) as SaveData['upgradeReqs'],
    autoBuyUpgrades: s.autoBuyUpgrades,
    totalDelivered: s.totalDelivered,
    nextBuildingId: s.nextBuildingId,
    buildings: byId.map(saveBuilding),
    belts: belts.map((b) => ({
      x: b.x,
      y: b.y,
      outputs: b.outputs,
      rr: b.rr,
      rrIn: b.rrIn,
      priority: b.priority,
      item: saveItem(b.item),
    })),
    bridges: bridges.map((br) => ({ x: br.x, y: br.y, h: saveLane(br.h), v: saveLane(br.v) })),
    markers: markers.map((m) => ({ x: m.x, y: m.y, text: m.text })),
    clipboard: structuredClone(s.clipboard),
    helpSeen: [...s.helpSeen],
    contracts: structuredClone(s.contracts),
    camera: { x: camera.x, y: camera.y, zoom: camera.zoom },
  };
}

/**
 * Rebuild a game state from a validated save. Throws `SaveError` when objects overlap
 * (two buildings, or a belt / bridge on a building or on each other).
 */
export function deserialize(data: SaveData): { state: GameState; camera: CameraState } {
  const state = createInitialState(data.seed);
  state.tick = data.tick;
  state.level = data.level;
  state.levels = data.levels.map(([target, quantity, final]) => ({ target, quantity, final }));
  state.levelRequirement = data.levelRequirement ? { ...data.levelRequirement } : null;
  state.finishedAtTick = data.finishedAtTick;
  state.maxExtraction = data.maxExtraction;
  state.unlockedBuildings = [...data.unlockedBuildings];
  state.unlockedFeatures = [...data.unlockedFeatures];
  state.upgrades = { ...data.upgrades };
  state.upgradeSeqs = structuredClone(data.upgradeSeqs);
  state.upgradeReqs = structuredClone(data.upgradeReqs);
  state.autoBuyUpgrades = data.autoBuyUpgrades;
  state.totalDelivered = data.totalDelivered;
  state.nextBuildingId = data.nextBuildingId;
  state.helpSeen = [...data.helpSeen];
  if (data.contracts) state.contracts = structuredClone(data.contracts);
  state.clipboard = structuredClone(data.clipboard);

  const occupied = new Set<number>();
  const claim = (x: number, y: number, path: string): void => {
    const k = key(x, y);
    if (occupied.has(k)) throw new SaveError(path);
    occupied.add(k);
  };
  state.buildings.clear();
  for (const [i, sb] of data.buildings.entries()) {
    const b = loadBuilding(sb);
    for (const t of footprintTiles(b.type, b.x, b.y, b.rot, b.mirror))
      claim(t.x, t.y, `$.buildings[${i}]`);
    state.buildings.set(b.id, b);
  }
  for (const [i, sb] of data.belts.entries()) {
    claim(sb.x, sb.y, `$.belts[${i}]`);
    const b = makeBelt(sb.x, sb.y, sb.outputs);
    b.rr = sb.rr;
    b.rrIn = sb.rrIn;
    b.priority = sb.priority !== null && sb.outputs & (1 << sb.priority) ? sb.priority : null;
    b.item = loadItem(sb.item);
    state.belts.set(key(sb.x, sb.y), b);
  }
  for (const [i, sb] of data.bridges.entries()) {
    claim(sb.x, sb.y, `$.bridges[${i}]`);
    const lane = (l: SavedLane | null, axisOk: (d: Dir) => boolean): Belt | null => {
      if (!l || !axisOk(l.dir)) return null;
      const b = makeBelt(sb.x, sb.y, 1 << l.dir);
      b.rr = l.rr;
      b.rrIn = l.rrIn;
      b.item = loadItem(l.item);
      return b;
    };
    state.bridges.set(key(sb.x, sb.y), {
      x: sb.x,
      y: sb.y,
      h: lane(sb.h, (d) => d % 2 === 1),
      v: lane(sb.v, (d) => d % 2 === 0),
    });
  }
  for (const m of data.markers) state.markers.set(key(m.x, m.y), { ...m });
  return { state, camera: { ...data.camera } };
}

/** Canonical text of everything saved except the date: equal states give equal hashes. */
export function stateHash(world: World, camera: CameraState): string {
  const text = JSON.stringify(serialize(world, camera));
  // FNV-1a 32-bit, plus the length: short and stable, enough to compare states in tests.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16)}-${text.length}`;
}
