import type { Dir } from '../core/grid';
import type { Track } from './balance';
import { type OperationDef, type OperationId, OPERATIONS } from './operations';

/** Operators placed without limit once unlocked. */
export type BaseOperatorType = 'adder' | 'multiplier' | 'subtractor' | 'divider' | 'exponent';

/**
 * Special buildings (PLAN-recompenses §2, §3.5): owned in limited copies, each with a native
 * edition. Phase 1 has a single placeholder, to be removed or replaced in phase 2: every
 * code path reads `SPECIAL_BUILDINGS` and works for any special type.
 */
export type SpecialType = 'ancientAdder';

/** Buildings that compute: the ordinary operators and the special buildings. */
export type OperatorType = BaseOperatorType | SpecialType;

/** Building kinds that occupy tiles (belts and bridges are handled separately). */
export type BuildingType = 'hub' | 'extractor' | BaseOperatorType | 'storage' | SpecialType;

/** Role of a footprint tile (PLAN §6.1). `any` ports follow the building's `anyRole`. */
export type PortRole = 'A' | 'B' | 'O' | 'Q' | 'R' | 'any' | 'body';

export interface FootprintTile {
  x: number;
  y: number;
  role: PortRole;
  /** Port faces in rotation 0. `'outward'` = every face that leads outside the building. */
  faces: readonly Dir[] | 'outward';
}

export interface BuildingDef {
  w: number;
  h: number;
  tiles: readonly FootprintTile[];
  /** What `any` ports do. */
  anyRole?: 'input' | 'output' | 'dynamic';
  /** Can the player rotate it? */
  rotatable: boolean;
}

/** Full rectangle of `any` tiles. */
function block(size: number): FootprintTile[] {
  const tiles: FootprintTile[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) tiles.push({ x, y, role: 'any', faces: 'outward' });
  }
  return tiles;
}

const N = 0;
const E = 1;
const S = 2;
const W = 3;

/** Footprints of the ordinary buildings in rotation 0 (PLAN §6.3). */
const ORDINARY: Record<Exclude<BuildingType, SpecialType>, BuildingDef> = {
  hub: { w: 6, h: 6, tiles: block(6), anyRole: 'input', rotatable: false },
  extractor: { w: 3, h: 3, tiles: block(3), anyRole: 'output', rotatable: false },
  storage: { w: 3, h: 3, tiles: block(3), anyRole: 'dynamic', rotatable: false },
  adder: {
    w: 2,
    h: 2,
    rotatable: true,
    tiles: [
      { x: 0, y: 0, role: 'A', faces: [N, W] },
      { x: 1, y: 0, role: 'B', faces: [N, E] },
      { x: 0, y: 1, role: 'O', faces: [S, W] },
      { x: 1, y: 1, role: 'O', faces: [S, E] },
    ],
  },
  multiplier: {
    w: 3,
    h: 1,
    rotatable: true,
    tiles: [
      { x: 0, y: 0, role: 'A', faces: [N, W, S] },
      { x: 1, y: 0, role: 'O', faces: [N, S] },
      { x: 2, y: 0, role: 'B', faces: [N, E, S] },
    ],
  },
  subtractor: {
    w: 2,
    h: 2,
    rotatable: true,
    tiles: [
      { x: 0, y: 0, role: 'A', faces: [N, W, E] },
      { x: 0, y: 1, role: 'O', faces: [W, S] },
      { x: 1, y: 1, role: 'B', faces: [N, E, S] },
    ],
  },
  divider: {
    w: 2,
    h: 2,
    rotatable: true,
    tiles: [
      { x: 0, y: 0, role: 'A', faces: [N, W] },
      { x: 1, y: 0, role: 'B', faces: [N, E] },
      { x: 0, y: 1, role: 'Q', faces: [W, S] },
      { x: 1, y: 1, role: 'R', faces: [S, E] },
    ],
  },
  exponent: {
    w: 2,
    h: 2,
    rotatable: true,
    tiles: [
      { x: 1, y: 0, role: 'B', faces: [N, W, E] },
      { x: 0, y: 1, role: 'A', faces: [N, W, S] },
      { x: 1, y: 1, role: 'O', faces: [E, S] },
    ],
  },
};

/**
 * What a computing building performs (PLAN-objets §2): an operation of the registry, sped up
 * by an upgrade track. Its footprint's A, B and output ports must match the operation's.
 */
export interface OperatorDef {
  op: OperationId;
  /** Upgrade track setting its speed; absent = the operation's own track. */
  track?: Track;
}

/** Operation of each ordinary operator. */
export const OPERATOR_BUILDINGS: Readonly<Record<BaseOperatorType, OperatorDef>> = {
  adder: { op: 'add' },
  multiplier: { op: 'mul' },
  subtractor: { op: 'sub' },
  divider: { op: 'div' },
  exponent: { op: 'pow' },
};

export interface SpecialDef extends OperatorDef {
  /** Footprint and ports in rotation 0 (an ordinary one may be reused as is). */
  footprint: BuildingDef;
  /** Placeholder object of phase 1 (PLAN-recompenses §5.3). */
  placeholder?: boolean;
}

/**
 * Special buildings, in build bar order. A new one may bring a new operation: add it to
 * `config/operations.ts`, then declare the building here with its own footprint.
 */
export const SPECIAL_BUILDINGS: Readonly<Record<SpecialType, SpecialDef>> = {
  ancientAdder: { op: 'add', footprint: ORDINARY.adder, placeholder: true },
};

export const SPECIAL_TYPES = Object.keys(SPECIAL_BUILDINGS) as SpecialType[];

export function isSpecial(type: string): type is SpecialType {
  return Object.hasOwn(SPECIAL_BUILDINGS, type);
}

export const BUILDINGS: Readonly<Record<BuildingType, BuildingDef>> = {
  ...ORDINARY,
  ...(Object.fromEntries(SPECIAL_TYPES.map((t) => [t, SPECIAL_BUILDINGS[t].footprint])) as Record<
    SpecialType,
    BuildingDef
  >),
};

/** Operation and track of every computing building, resolved once (read on every cycle). */
interface ResolvedOperator {
  operation: OperationDef;
  track: Track;
}

const RESOLVED = Object.fromEntries(
  Object.entries<OperatorDef>({ ...OPERATOR_BUILDINGS, ...SPECIAL_BUILDINGS }).map(([t, d]) => {
    const operation = OPERATIONS[d.op];
    return [t, { operation, track: d.track ?? operation.track }];
  }),
) as Record<OperatorType, ResolvedOperator>;

/** The operation `type` performs (ordinary operator or special building). */
export function operationOf(type: OperatorType): OperationDef {
  return RESOLVED[type].operation;
}

/** The upgrade track setting the speed of `type`. */
export function trackOf(type: OperatorType): Track {
  return RESOLVED[type].track;
}
