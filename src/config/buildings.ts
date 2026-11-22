import type { Dir } from '../core/grid';

/** Operators placed without limit once unlocked. */
export type BaseOperatorType = 'adder' | 'multiplier' | 'subtractor' | 'divider' | 'exponent';

/**
 * Special buildings (PLAN-recompenses §2, §3.5): owned in limited copies, each with a native
 * edition. Phase 1 has a single placeholder, to be removed or replaced in phase 2: every
 * code path reads `SPECIAL_BUILDINGS` and works for any special type.
 */
export type SpecialType = 'ancientAdder';

/** Building kinds that occupy tiles (belts and bridges are handled separately). */
export type BuildingType = 'hub' | 'extractor' | BaseOperatorType | 'storage' | SpecialType;

export interface SpecialDef {
  /** The ordinary operator it behaves like: same computation and upgrade track. */
  like: BaseOperatorType;
  /** Placeholder object of phase 1 (PLAN-recompenses §5.3). */
  placeholder?: boolean;
}

/** Special buildings, in build bar order. */
export const SPECIAL_BUILDINGS: Readonly<Record<SpecialType, SpecialDef>> = {
  ancientAdder: { like: 'adder', placeholder: true },
};

export const SPECIAL_TYPES = Object.keys(SPECIAL_BUILDINGS) as SpecialType[];

export function isSpecial(type: string): type is SpecialType {
  return Object.hasOwn(SPECIAL_BUILDINGS, type);
}

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

/** Footprints in rotation 0 (PLAN §6.3). Special buildings take the footprint they imitate. */
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

export const BUILDINGS: Readonly<Record<BuildingType, BuildingDef>> = {
  ...ORDINARY,
  ...(Object.fromEntries(
    SPECIAL_TYPES.map((t) => [t, ORDINARY[SPECIAL_BUILDINGS[t].like]]),
  ) as Record<SpecialType, BuildingDef>),
};
