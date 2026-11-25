/**
 * Simulator and tuner settings (PLAN-objets §3, §4, §5): every constant of the cost model,
 * the default run, the report bands and the balance criteria, in one place. Game code never
 * reads this file. Changing a value here changes every verdict: note why in docs/DECISIONS.md.
 */

/** Default run of `npm run sim` (overridable from the command line). */
export const RUN_DEFAULTS = {
  /** Games per strategy. */
  seeds: 30,
  /** First seed; seeds are `seedOffset`, `seedOffset + 1`, … */
  seedOffset: 1,
  /** Last level played (the offer of this level is not drawn: it plays no level). */
  maxLevel: 60,
} as const;

/** Tuner settings (§5). */
export const TUNER = {
  /** Seeds of the search, then of the control run (disjoint from the search seeds). */
  seeds: 30,
  seedOffset: 1,
  controlSeedOffset: 100_001,
  /** Points of the coarse grid of a knob, log-spaced between its bounds (plus the current value). */
  gridPoints: 9,
  /** Coordinate descent passes over the knobs (stops earlier when nothing improves). */
  passes: 3,
  /** Refinement steps: each one tries the midpoints (in log) around the best value. */
  refineSteps: 2,
  /** Proposed values are rounded to this many significant digits. */
  digits: 2,
} as const;

/**
 * Cost model (§3.2). The level time is `quantity × item cost`, an item cost being the time
 * one item takes when the factory works on the level target only:
 *
 * - an ordinary operation costs `1 / (opsPerSecond × (G + E))`, where `G` is the generic
 *   capacity (`factory`) plus the edition cards, and `E` the limited buildings performing
 *   the same operation (their copies, counted in buildings of the ordinary speed);
 * - an operation only limited buildings perform costs `1 / (copies × opsPerSecond)`: their
 *   throughput is the cap `copies × speed / uses per item` of §3.2;
 * - a raw item of value v costs `raw.weight × (1 + raw.valuePenalty × (v − 1)) /
 *   (extractor rate × G)` (higher values lie farther from the hub).
 */
export const COST = {
  /**
   * Generic capacity `G(L) = base + perLevel × L`, in ordinary buildings working in parallel
   * at level L. It only matters relative to the limited buildings and the edition cards.
   */
  factory: { base: 6, perLevel: 1 },
  raw: { weight: 1, valuePenalty: 0.02 },
  /**
   * Upgrade schedule, identical for every strategy: from `fromLevel` on, the upgrade level of
   * a track is 1 + the number of its base sequence terms (`UPGRADE_SEQUENCES`, extended by
   * the mean growth) at most `reach × reference target` of level `L − lag`. The reference
   * target is the LEVEL_TABLE base target, then the mean infinite growth.
   */
  upgrades: { fromLevel: 3, lag: 1, reach: 1 },
  /** The cost table of a tool set is computed up to `margin × target` (cache reuse only). */
  margin: 1.3,
  /** Cached cost tables are dropped beyond this many numbers in total (memory only). */
  cacheNumbers: 12_000_000,
} as const;

/** Level bands of the report (inclusive). The last one ends at the max level. */
export const BAND_SIZE = 10;

/** Thresholds of the three criteria of §4. */
export interface CriteriaThresholds {
  /** 1. Not essential: index under `below` for more than `maxRun` levels in a row… */
  essential: {
    below: number;
    maxRun: number;
    /** …in at most 1 − `games` of the games. */ games: number;
  };
  /** 2. Not useless: index under `below` on at least `levels` of the levels after the first pick (median). */
  useful: { below: number; levels: number };
  /** 3. Visible: offered at least once before the benchmark level in `min` to `max` of the games. */
  visible: { min: number; max: number };
}

export const CRITERIA: CriteriaThresholds = {
  essential: { below: 0.5, maxRun: 3, games: 0.9 },
  useful: { below: 1, levels: 1 / 3 },
  visible: { min: 0.5, max: 0.8 },
};

/** Per-object overrides of the thresholds, argued in the object's sheet (`docs/objets/`). */
export const CRITERIA_OVERRIDES: Readonly<
  Record<string, { [K in keyof CriteriaThresholds]?: Partial<CriteriaThresholds[K]> }>
> = {};

/**
 * Benchmark level of an object (criterion 3), from its sheet. Without one: the level whose
 * natural reward is the card (LEVEL_TABLE), else `DEFAULT_BENCHMARK`.
 */
export const BENCHMARK_LEVELS: Readonly<Record<string, number>> = {};
export const DEFAULT_BENCHMARK = 15;

/** Index comparisons ignore differences below this (floating point noise). */
export const INDEX_EPSILON = 1e-9;

/** Folder of the JSON reports (git-ignored). */
export const REPORT_DIR = 'sim-reports';
