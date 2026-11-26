/**
 * Simulator and tuner settings (PLAN-objets §3, §4, §5): every constant of the cost model,
 * the default run, the report bands and the balance criteria, in one place. Game code never
 * reads this file. Changing a value here changes every verdict: note why in docs/DECISIONS.md.
 */

/** Default run of `npm run sim` (overridable from the command line). */
export const RUN_DEFAULTS = {
  /** Games per strategy. */
  seeds: 60,
  /** First seed; seeds are `seedOffset`, `seedOffset + 1`, … */
  seedOffset: 1,
  /** Last level played (the offer of this level is not drawn: it plays no level). */
  maxLevel: 60,
} as const;

/** Tuner settings (§5). */
export const TUNER = {
  /** Seeds of the search (each point plays `natural`, `object:<id>` and `once:<id>`). */
  seeds: 60,
  seedOffset: 1,
  /** Seeds of the control run, whole catalogue, disjoint from the search seeds. */
  controlSeeds: 60,
  controlSeedOffset: 100_001,
  /** Points of the coarse grid of a knob, log-spaced between its bounds (plus the current value). */
  gridPoints: 9,
  /** Coordinate descent passes over the knobs (stops earlier when nothing improves). */
  passes: 3,
  /** Refinement steps: each one tries the midpoints (in log) around the best value. */
  refineSteps: 2,
  /** Proposed values are rounded to this many significant digits. */
  digits: 2,
  /**
   * Slack preferred on each criterion among the passing points (share of games or of
   * levels): 5 points away from the bounds when possible, against the noise of the seeds.
   */
  safety: 0.05,
} as const;

/**
 * Cost model (§3.2). The level time is `quantity × item cost`, an item cost being the time
 * one item takes when the factory works on the level target only:
 *
 * - an ordinary operation costs `1 / (opsPerSecond × (G + E))`, where `G` is the generic
 *   capacity (`factory`) plus the edition cards (each free card adds the speed gain of the
 *   best operator edition, e.g. 0.5 building for a légendaire), and `E` the limited
 *   buildings performing the same operation (their copies, in buildings of ordinary speed);
 * - an operation only limited buildings perform costs `1 / (copies × opsPerSecond)` on their
 *   own line (the cap `copies × speed / uses per item` of §3.2), and that line works **in
 *   parallel** with the ordinary factory: the best recipe through it is mixed with the best
 *   ordinary recipe, their throughputs adding up (`mixedCost` in `cost.ts`,
 *   docs/objets/concat.md);
 * - a raw item of value v costs `raw.weight × (1 + raw.valuePenalty × (v − 1)) /
 *   (extractor rate × G)` (higher values lie farther from the hub); the extractor rate is
 *   capacity × belt speed at the scheduled upgrade levels.
 *
 * Speeds come from `config/balance.ts` (`operatorSpeed` per track and upgrade level), the
 * passives (`PASSIVE_EFFECTS`), the editions (`EDITION_EFFECTS`) and the tuned `speed` knob.
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
  /**
   * 1. Not essential: at least `games` of the games never stay more than `maxRun` levels in
   * a row with an index under `below`.
   */
  essential: { below: number; maxRun: number; games: number };
  /**
   * 2. Not useless: the median over the games of the share of the levels after the first
   * pick with an index under `below` is at least `levels`.
   */
  useful: { below: number; levels: number };
  /** 3. Visible: offered at least once before the benchmark level in `min` to `max` of the games. */
  visible: { min: number; max: number };
}

export const CRITERIA: CriteriaThresholds = {
  essential: { below: 0.5, maxRun: 3, games: 0.9 },
  useful: { below: 1, levels: 1 / 3 },
  visible: { min: 0.5, max: 0.8 },
};

/**
 * Effects the cost model cannot see, by card id, with the reason shown in the report: their
 * criterion 2 is "n/a". A new card whose effect changes no item cost goes here, argued in
 * its sheet.
 */
export const UNMODELED: Readonly<Record<string, string>> = {
  bridge: 'un pont ne calcule rien',
  priorities: 'les priorités ne changent aucun coût',
  storage: 'un stockage ne calcule rien',
  eventail: 'l’emplacement d’offre en plus ne change aucun coût',
};

/**
 * Noise margin of the tuner: `max(minPoints, standardErrors × √(p(1 − p) / n))`, n being the
 * games behind a measure.
 * - A criterion of another object that flips from pass to fail is a regression only if its
 *   measure moved by more than the margin (p = mean of the two measures); a smaller flip is
 *   shown "à surveiller" and blocks nothing.
 * - The tuned object passes the control run if every failing criterion misses its threshold
 *   by at most the margin (p = its measure); shown "à surveiller" too.
 */
export const NOISE = { minPoints: 0.07, standardErrors: 2 } as const;

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
