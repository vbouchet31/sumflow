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
  | 'bridge'
  | 'relay';

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
  { target: 466, quantity: 3_000, reward: b('relay') },
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

/** Level generation (PLAN §7.2). */
export const LEVELS = {
  /** Levels 1..fixedUntil keep their base target exactly. */
  fixedUntil: 5,
  /** Levels up to the table end: target = round(base × U(min, max)). */
  tableJitter: { min: 0.92, max: 1.08 },
  /** Beyond the table: target = round(previous × U(min, max)), at least previous + 1. */
  infiniteGrowth: { min: 1.01, max: 1.03 },
  /** quantity(n) = min(quantityCap, quantityBase + quantityStep × (n - table length)). */
  quantityBase: 14_000,
  quantityStep: 200,
  quantityCap: 20_000,
  /** Reward of infinite level n: Extraction (n - extractionOffset). */
  extractionOffset: 7,
  /** The first level whose target would exceed this becomes the last one. */
  maxTarget: 2_000_000_000,
  /** Levels generated ahead of the current one (kept in the save). */
  lookahead: 15,
  /** Levels listed in the Levels panel. */
  preview: 12,
} as const;

/** Delivery relays (proposal 10): how many can stand at once. */
export const RELAY_MAX = 3;

/** Hub footprint (PLAN §4.2): tiles x, y ∈ [-3, 2]. */
export const HUB = { x: -3, y: -3, size: 6 } as const;

/** Starting extraction cap (PLAN §4.5). */
export const START_MAX_EXTRACTION = 1;

/** Buildings and features available from the start (PLAN §7.4). */
export const START_BUILDINGS: readonly PlaceableType[] = ['extractor'];

/** Statistics window (PLAN §7.1): sliding 60 s, sampled per second. */
export const STATS_WINDOW_SECONDS = 60;

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

/** Simulation rate (PLAN §2, §11.1). */
export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;
/** Max simulation ticks per rendered frame before slowing down (PLAN §11.1). */
export const MAX_TICKS_PER_FRAME = 8;
/** Catching up after the tab was hidden (PLAN §11.1). */
export const CATCH_UP = {
  /** Longest absence simulated, in seconds. */
  maxSeconds: 600,
  ticksPerFrame: 600,
  /** Absences shorter than this are ignored, in seconds. */
  minSeconds: 1,
  /** A catch-up frame stops simulating after this long, in milliseconds. */
  frameBudgetMs: 24,
} as const;

/** Storage capacity, single value (PLAN §6.3). */
export const STORAGE_CAPACITY = 10_000;

/** Operator buffers (PLAN §6.2). */
export const INPUT_BUFFER_SIZE = 4;
export const OUTPUT_BUFFER_SIZE = 2;

export type Track = 'belt' | 'extractor' | 'adder' | 'multiplier' | 'subdiv' | 'exponent';
export const TRACKS: readonly Track[] = [
  'belt',
  'extractor',
  'adder',
  'multiplier',
  'subdiv',
  'exponent',
];

/** Upgrade values for levels 1..8 (PLAN §7.3). Index 0 is level 1. */
const BELT_SPEED = [1, 2, 3, 4, 5, 6, 7, 8];
const ADDER_SPEED = [0.25, 0.333, 0.4, 0.5, 0.667, 1, 1.5, 2];
const OPERATOR_SPEED = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1];

export const UPGRADE_CAPS = {
  beltSpeed: 20,
  adderSpeed: 4,
  operatorSpeed: 3,
  extractorLevel: 12,
} as const;

/** Belt speed in tiles/s at upgrade level L. */
export function beltSpeed(level: number): number {
  const L = Math.max(1, Math.floor(level));
  const v = L <= 8 ? (BELT_SPEED[L - 1] ?? 1) : 8 + 0.1 * (L - 8);
  return Math.min(UPGRADE_CAPS.beltSpeed, v);
}

/** Extractor capacity in full belts at upgrade level L. */
export function extractorCapacity(level: number): number {
  return Math.min(UPGRADE_CAPS.extractorLevel, Math.max(1, Math.floor(level)));
}

/** Operations per second of a track's operator at upgrade level L. */
export function operatorSpeed(track: Track, level: number): number {
  const L = Math.max(1, Math.floor(level));
  if (track === 'adder') {
    const v = L <= 8 ? (ADDER_SPEED[L - 1] ?? 0.25) : 2 + 0.02 * (L - 8);
    return Math.min(UPGRADE_CAPS.adderSpeed, v);
  }
  const v = L <= 8 ? (OPERATOR_SPEED[L - 1] ?? 0.2) : 1 + 0.02 * (L - 8);
  return Math.min(UPGRADE_CAPS.operatorSpeed, v);
}

/** Base sequences t1..t10 per track, before randomisation (PLAN §7.3). */
export const UPGRADE_SEQUENCES: Record<Track, readonly number[]> = {
  belt: [1, 16, 22, 34, 121, 247, 562, 839, 1_526, 4_294],
  extractor: [2, 7, 13, 29, 57, 110, 233, 471, 950, 1_900],
  adder: [3, 11, 75, 91, 193, 625, 1_400, 3_447, 9_423, 20_000],
  multiplier: [45, 110, 202, 574, 905, 2_571, 6_901, 15_000, 36_446, 64_331],
  subdiv: [280, 520, 1_100, 2_300, 4_700, 9_800, 21_000, 43_000, 88_000, 180_000],
  exponent: [650, 1_874, 3_900, 8_100, 17_000, 35_000, 72_000, 150_000, 310_000, 640_000],
};

export const UPGRADE_GEN = {
  /** Base values below this are kept as is. */
  keepBelow: 30,
  jitter: { min: 0.85, max: 1.15 },
  /** Beyond t10: t(k+1) = round(t(k) × U(min, max)). */
  growth: { min: 1.1, max: 1.35 },
  /** A term above this means the track is maxed. */
  maxTerm: 2_000_000_000,
} as const;

/** C(L) for levels 1..8 (PLAN §7.3). */
const UPGRADE_COST = [200, 1_000, 4_000, 9_000, 9_000, 11_000, 15_000, 20_000];

/** Base quantity C(L) of the first number of the window when upgrading from L to L+1. */
export function upgradeCost(level: number): number {
  const L = Math.max(1, Math.floor(level));
  return L <= 8 ? (UPGRADE_COST[L - 1] ?? 200) : Math.min(40_000, 20_000 + 250 * (L - 8));
}

/** Quantity multipliers for the 1st, 2nd and 3rd number of the window. */
export const UPGRADE_WINDOW_FACTORS = [1, 0.8, 0.6] as const;
/** Quantities are rounded to this step. */
export const UPGRADE_ROUNDING = 50;

/** Per-track factor applied to C(L). */
export const UPGRADE_TRACK_FACTOR: Record<Track, number> = {
  belt: 1,
  extractor: 1,
  adder: 1.2,
  multiplier: 1,
  subdiv: 1,
  exponent: 1,
};

/** Fixed, well-separated hues for items 1..9 (PLAN §5). Index 0 is value 1. */
export const ITEM_HUES = [210, 0, 120, 45, 280, 170, 25, 320, 85] as const;
export const ITEM_SATURATION = 65;
export const ITEM_LIGHTNESS = 55;

/** Editing tools (PLAN §8.2). */
export const EDIT = {
  /** Largest selection side, in tiles. */
  maxSelection: 128,
  /** Clipboard history length. */
  clipboardSize: 20,
  /** Undo stack depth. */
  historySize: 100,
  /** Longest marker text, in characters. */
  markerMaxLength: 40,
  /** Most copies placed by one paste drag. */
  maxPasteRow: 32,
} as const;
