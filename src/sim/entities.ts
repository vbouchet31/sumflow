import {
  type BaseOperatorType,
  BUILDINGS,
  type BuildingType,
  type OperatorType,
  type PortRole,
  SPECIAL_TYPES,
} from '../config/buildings';
import type { SpecialEdition } from '../config/cards';
import type { OutputPort } from '../config/operations';
import {
  type Dir,
  DX,
  DY,
  key,
  normalizeRot,
  type Rot,
  rotatedSize,
  transformDir,
  transformLocal,
} from '../core/grid';

/** An item on a belt. `progress` ∈ [0, 1] along the tile (PLAN §6.4). */
export interface Item {
  value: number;
  progress: number;
  /** Side the item entered from (for drawing); null when unknown. */
  from: Dir | null;
  /** Tick at which the item last moved or advanced (runtime only, never saved). */
  stamp: number;
}

export interface Belt {
  x: number;
  y: number;
  /** Bitmask of output directions (bit d = 1 << d). */
  outputs: number;
  item: Item | null;
  /** Round-robin index over output directions. */
  rr: number;
  /** Round-robin index over incoming neighbours (merge). */
  rrIn: number;
  priority: Dir | null;
  /** Runtime only (never saved): tick at which the item last left, and its carried progress. */
  vacatedTick: number;
  vacatedCarry: number;
}

/** Axis of a lane: 0 = horizontal (E/W), 1 = vertical (N/S). */
export type Axis = 0 | 1;

export function axisOf(d: Dir): Axis {
  return d % 2 === 1 ? 0 : 1;
}

/**
 * Bridge (PLAN §6.7): one tile with two independent straight lanes. Each lane behaves like
 * a single-output belt; a lane is null when it has no direction yet.
 */
export interface Bridge {
  x: number;
  y: number;
  h: Belt | null;
  v: Belt | null;
}

/**
 * Network node key. Plain belts use their tile key (≥ 0); bridge lanes use a negative key
 * derived from the tile key and the axis.
 */
export function laneNode(tileKey: number, axis: Axis): number {
  return -(2 * tileKey + axis) - 1;
}

export interface Building {
  id: number;
  type: BuildingType;
  /** Top-left tile after rotation. */
  x: number;
  y: number;
  rot: Rot;
  /**
   * Horizontal mirror applied before the rotation (pasting with `F`, PLAN §8.2). Ports keep
   * their role: a mirrored subtractor still computes A − B, only the positions change.
   * Absent means false.
   */
  mirror?: boolean;
  /** Round-robin index over output ports. */
  rrOut: number;
  /** Prioritised output face (port key: tile key × 4 + face), or null (PLAN §6.6). */
  priority: number | null;
  /** Extractor: value produced and fractional production accumulator. */
  extractValue?: number;
  extractAcc?: number;
  /** Operator input buffers (FIFO, PLAN §6.2). */
  inA?: number[];
  inB?: number[];
  /** Operator output buffers per group. */
  out?: number[];
  outQ?: number[];
  outR?: number[];
  /** Seconds left in the current cycle, -1 when idle. */
  cycle?: number;
  /** Tick of the last completed cycle (drawing the flash; runtime only). */
  flashTick?: number;
  /** Storage: stored value (null when empty) and count (PLAN §6.3). */
  storeValue?: number | null;
  storeCount?: number;
  /** Edition (PLAN-recompenses §3.4); absent = base. */
  edition?: SpecialEdition;
  /**
   * True when the edition comes from an edition card (it goes back to the player), false
   * or absent for the native edition of a special building (it never leaves it).
   */
  editionApplied?: boolean;
}

export type { OperatorType } from '../config/buildings';

/** Field of `Building` holding the buffer of each output port. */
export const OUTPUT_BUFFER = { O: 'out', Q: 'outQ', R: 'outR' } as const satisfies Record<
  OutputPort,
  keyof Building
>;

export const BASE_OPERATORS: readonly BaseOperatorType[] = [
  'adder',
  'multiplier',
  'subtractor',
  'divider',
  'exponent',
];

export const OPERATOR_TYPES: readonly OperatorType[] = [...BASE_OPERATORS, ...SPECIAL_TYPES];

export function isOperator(type: string): type is OperatorType {
  return (OPERATOR_TYPES as readonly string[]).includes(type);
}

/** Buildings placed freely with the generic tool (centred ghost, rows by dragging). */
export type FreeBuildingType = OperatorType | 'storage';

export function isFreeBuilding(type: string): type is FreeBuildingType {
  return type === 'storage' || isOperator(type);
}

export type PortKind = 'A' | 'B' | 'O' | 'Q' | 'R' | 'in' | 'out' | 'dynamic';

/** A port face in world coordinates: building tile `(x, y)`, face `face` (pointing outward). */
export interface PortFace {
  x: number;
  y: number;
  face: Dir;
  kind: PortKind;
}

export function hasOutput(belt: Belt, d: Dir): boolean {
  return (belt.outputs & (1 << d)) !== 0;
}

export function dirMask(d: Dir): number {
  return 1 << d;
}

/**
 * World tiles covered by a building of `type` at origin `(x, y)` with rotation `rot`
 * (and optional mirror, applied first).
 */
export function footprintTiles(
  type: BuildingType,
  x: number,
  y: number,
  rot: number,
  mirror = false,
): { x: number; y: number; role: PortRole }[] {
  const def = BUILDINGS[type];
  return def.tiles.map((t) => {
    const p = transformLocal(t.x, t.y, def.w, def.h, rot, mirror);
    return { x: x + p.x, y: y + p.y, role: t.role };
  });
}

/** Size of a building after rotation. */
export function buildingSize(type: BuildingType, rot: number): { w: number; h: number } {
  const def = BUILDINGS[type];
  return rotatedSize(def.w, def.h, rot);
}

function kindOf(role: PortRole, anyRole: 'input' | 'output' | 'dynamic' | undefined): PortKind {
  if (role === 'any') return anyRole === 'input' ? 'in' : anyRole === 'output' ? 'out' : 'dynamic';
  if (role === 'body') throw new Error('body tiles have no ports');
  return role;
}

/**
 * Port faces of a building in world coordinates, in a deterministic order
 * (footprint order, then N, E, S, W). Only faces that lead outside the building count.
 */
export function portFaces(
  type: BuildingType,
  x: number,
  y: number,
  rot: number,
  mirror = false,
): PortFace[] {
  const def = BUILDINGS[type];
  const r = normalizeRot(rot);
  const tiles = footprintTiles(type, x, y, r, mirror);
  const inside = new Set(tiles.map((t) => key(t.x, t.y)));
  const out: PortFace[] = [];
  def.tiles.forEach((t, i) => {
    if (t.role === 'body') return;
    const world = tiles[i];
    if (!world) return;
    const faces: Dir[] =
      t.faces === 'outward' ? [0, 1, 2, 3] : t.faces.map((f) => transformDir(f, r, mirror));
    faces.sort((a, b) => a - b);
    for (const face of faces) {
      if (inside.has(key(world.x + DX[face], world.y + DY[face]))) continue;
      out.push({ x: world.x, y: world.y, face, kind: kindOf(t.role, def.anyRole) });
    }
  });
  return out;
}

/** A port face, with where it comes from in the definition (stable across rotations). */
export interface LocalPortFace extends PortFace {
  /** Index of the footprint tile in `BUILDINGS[type].tiles`. */
  tile: number;
  /** Face in rotation 0, before the mirror. */
  local: Dir;
}

/**
 * `portFaces` with each face's origin in the definition: the same `tile` and `local` name
 * the same port whatever the rotation, which lets a moved building keep its connections.
 */
export function localPortFaces(
  type: BuildingType,
  x: number,
  y: number,
  rot: number,
  mirror = false,
): LocalPortFace[] {
  const def = BUILDINGS[type];
  const r = normalizeRot(rot);
  const tiles = footprintTiles(type, x, y, r, mirror);
  const inside = new Set(tiles.map((t) => key(t.x, t.y)));
  const out: LocalPortFace[] = [];
  def.tiles.forEach((t, i) => {
    if (t.role === 'body') return;
    const world = tiles[i];
    if (!world) return;
    const locals: Dir[] = t.faces === 'outward' ? [0, 1, 2, 3] : [...t.faces];
    for (const local of locals) {
      const face = transformDir(local, r, mirror);
      if (inside.has(key(world.x + DX[face], world.y + DY[face]))) continue;
      out.push({ x: world.x, y: world.y, face, kind: kindOf(t.role, def.anyRole), tile: i, local });
    }
  });
  return out;
}

/** Port lookup key: building tile key and face. */
export function portKey(tileKey: number, face: Dir): number {
  return tileKey * 4 + face;
}

export function isInputKind(kind: PortKind): boolean {
  return kind === 'A' || kind === 'B' || kind === 'in';
}

export function isOutputKind(kind: PortKind): boolean {
  return kind === 'O' || kind === 'Q' || kind === 'R' || kind === 'out';
}
