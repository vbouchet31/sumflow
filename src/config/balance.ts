/**
 * All gameplay balance values (PLAN §1.3). Nothing gameplay-related is hard-coded elsewhere.
 */

/** Buildings the player can place. */
export type PlaceableType =
  | 'extractor'
  | 'adder'
  | 'multiplier'
  | 'subtractor'
  | 'divider'
  | 'exponent'
  | 'storage'
  | 'bridge';

export type Feature = 'upgrades' | 'priorities';

export type Reward =
  | { kind: 'building'; building: PlaceableType }
  | { kind: 'feature'; feature: Feature }
  | { kind: 'extraction'; max: number };

export interface LevelDef {
  /** Base target before seeded randomisation (PLAN §7.2). */
  target: number;
  quantity: number;
  reward: Reward;
}

const b = (building: PlaceableType): Reward => ({ kind: 'building', building });
const f = (feature: Feature): Reward => ({ kind: 'feature', feature });
const x = (max: number): Reward => ({ kind: 'extraction', max });

/** Levels 1 to 30 (PLAN §7.2). Index 0 is level 1. */
export const LEVEL_TABLE: readonly LevelDef[] = [
  { target: 1, quantity: 10, reward: b('adder') },
  { target: 2, quantity: 20, reward: f('upgrades') },
  { target: 3, quantity: 35, reward: x(2) },
  { target: 5, quantity: 40, reward: b('bridge') },
  { target: 10, quantity: 50, reward: x(3) },
  { target: 19, quantity: 100, reward: x(4) },
  { target: 27, quantity: 150, reward: b('multiplier') },
  { target: 36, quantity: 300, reward: x(5) },
  { target: 47, quantity: 450, reward: x(6) },
  { target: 50, quantity: 500, reward: f('priorities') },
  { target: 82, quantity: 600, reward: x(7) },
  { target: 174, quantity: 800, reward: x(8) },
  { target: 248, quantity: 1_000, reward: b('subtractor') },
  { target: 324, quantity: 2_000, reward: x(9) },
  { target: 466, quantity: 3_000, reward: x(11) },
  { target: 594, quantity: 4_000, reward: b('divider') },
  { target: 631, quantity: 5_000, reward: x(12) },
  { target: 727, quantity: 6_000, reward: x(13) },
  { target: 891, quantity: 7_000, reward: b('exponent') },
  { target: 928, quantity: 8_000, reward: x(14) },
  { target: 1_779, quantity: 9_000, reward: x(15) },
  { target: 2_805, quantity: 10_000, reward: b('storage') },
  { target: 3_366, quantity: 10_500, reward: x(16) },
  { target: 4_100, quantity: 11_000, reward: x(17) },
  { target: 4_950, quantity: 11_500, reward: x(18) },
  { target: 5_900, quantity: 12_000, reward: x(19) },
  { target: 7_000, quantity: 12_500, reward: x(20) },
  { target: 8_200, quantity: 13_000, reward: x(21) },
  { target: 9_500, quantity: 13_500, reward: x(22) },
  { target: 10_904, quantity: 14_000, reward: x(23) },
];

/** Hub footprint (PLAN §4.2): tiles x, y ∈ [-3, 2]. */
export const HUB = { x: -3, y: -3, size: 6 } as const;

/** Starting extraction cap (PLAN §4.5). */
export const START_MAX_EXTRACTION = 1;

/** Map generation (PLAN §4.3, §4.4). Distances are in tiles from the hub centre. */
export const MAPGEN = {
  /** Deposit edge length in tiles. */
  depositSize: 3,
  /** Minimum empty tiles between two deposits. */
  depositGap: 1,
  /** No deposit tile inside x, y ∈ [min, max] around the hub. */
  clearZone: { min: -6, max: 5 },
  /** The value that never appears on the map. */
  forbiddenValue: 10,
  /** Guaranteed deposits are placed for values 1..guaranteedMaxValue. */
  guaranteedMaxValue: 80,
  /** Retries rotating the angle before pushing the distance out. */
  angleRetries: 30,
  /** Distance added after `angleRetries` failed attempts. */
  retryDistanceStep: 3,
  /** Random deposit attempts per chunk. */
  attemptsPerChunk: 4,
  /** vmax(d) = vmaxBase + floor(d / vmaxDistanceStep). */
  vmaxBase: 2,
  vmaxDistanceStep: 22,
  /** Weight of value v: v^(-weightExponent). */
  weightExponent: 1.15,
} as const;

export interface GuaranteedRule {
  count: number;
  minDist: number;
  maxDist: number;
  /** One deposit per quadrant (value 1). */
  perQuadrant?: boolean;
}

/** Guaranteed deposit rule for value v (PLAN §4.4 step A), or null for none. */
export function guaranteedRule(v: number): GuaranteedRule | null {
  if (v === MAPGEN.forbiddenValue || v < 1 || v > MAPGEN.guaranteedMaxValue) return null;
  if (v === 1) return { count: 4, minDist: 9, maxDist: 16, perQuadrant: true };
  if (v === 2) return { count: 3, minDist: 14, maxDist: 24 };
  if (v === 3) return { count: 2, minDist: 20, maxDist: 32 };
  if (v <= 9) return { count: 2, minDist: 10 + 7 * v, maxDist: 18 + 9 * v };
  return { count: 1, minDist: 60 + 14 * v, maxDist: 90 + 18 * v };
}
