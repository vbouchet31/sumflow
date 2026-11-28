/**
 * The tuner (PLAN-objets §5): searches the knobs of one object, within their bounds, for the
 * values closest to the three criteria; then checks them on other seeds over the whole
 * catalogue. It proposes; only the CLI writes, and only with `--apply`.
 */
import { CARDS } from '../config/cards';
import {
  KNOB_IDS,
  type KnobId,
  KNOBS,
  type KnobSpec,
  TUNED,
  type TuningValues,
} from '../config/tuning';
import { NOISE, TUNER } from './config';
import {
  CRITERION_IDS,
  type CriterionId,
  type CriterionResult,
  evaluateCatalogue,
  evaluateObject,
  type ObjectEvaluation,
  thresholdsOf,
} from './criteria';
import { isSocle } from './roles';
import {
  defaultStrategies,
  localRunner,
  objectStrategies,
  type RunResult,
  runSimulation,
  type SeedRunner,
} from './run';
import { REFERENCE, type Strategy } from './strategies';

export type KnobValues = Partial<Record<KnobId, number>>;

export interface Scored {
  values: KnobValues;
  /** Distance to the criteria (0 = every criterion passes). */
  distance: number;
  /**
   * Distance to the criteria tightened by `TUNER.safety` on each side (0 = every criterion
   * passes with that slack): among passing points, the tuner prefers one away from the
   * edges, which holds better on the control seeds.
   */
  robust: number;
  /** Distance from the starting values, in log scale (the tie-breaker: stay close). */
  deviation: number;
}

export interface SearchSettings {
  gridPoints: number;
  passes: number;
  refineSteps: number;
  digits: number;
}

/** `x` rounded to `digits` significant digits. */
export function roundSig(x: number, digits: number): number {
  if (x === 0 || !Number.isFinite(x)) return x;
  return Number(x.toPrecision(digits));
}

/** Grid of a knob: `points` log-spaced values between its bounds, plus `start`, ascending. */
export function knobGrid(spec: KnobSpec, start: number, points: number, digits: number): number[] {
  const set = new Set<number>([start]);
  for (let i = 0; i < points; i++) {
    const t = points === 1 ? 0.5 : i / (points - 1);
    const v = roundSig(spec.min * (spec.max / spec.min) ** t, digits);
    set.add(Math.min(spec.max, Math.max(spec.min, v)));
  }
  return [...set].sort((a, b) => a - b);
}

/** Is `a` better than `b`: closer to the criteria, then closer to the start values. */
/** Is `a` better than `b`: closer to the criteria, then with more slack, then closer to the start. */
export function better(a: Scored, b: Scored): boolean {
  if (Math.abs(a.distance - b.distance) > 1e-12) return a.distance < b.distance;
  if (Math.abs(a.robust - b.robust) > 1e-12) return a.robust < b.robust;
  return a.deviation < b.deviation - 1e-12;
}

/** What a point scores: its distance, and its robust distance (equal if not given). */
export type PointScore = number | { distance: number; robust: number };

export function deviation(values: KnobValues, start: KnobValues): number {
  let d = 0;
  for (const k of KNOB_IDS) {
    const v = values[k];
    const s = start[k];
    if (v !== undefined && s !== undefined) d += Math.abs(Math.log(v / s));
  }
  return d;
}

/**
 * Deterministic coordinate descent on a log grid, then refinement by log midpoints around
 * the best value. `distance(values)` is evaluated at most once per distinct point.
 */
export async function coordinateSearch(
  knobs: Readonly<Partial<Record<KnobId, KnobSpec>>>,
  start: KnobValues,
  distance: (values: KnobValues) => PointScore | Promise<PointScore>,
  settings: SearchSettings = TUNER,
): Promise<{ best: Scored; tried: Scored[] }> {
  const ids = KNOB_IDS.filter((k) => knobs[k]);
  const memo = new Map<string, Scored>();
  const tried: Scored[] = [];
  let best: Scored = { values: start, distance: Infinity, robust: Infinity, deviation: 0 };
  const score = async (values: KnobValues): Promise<Scored> => {
    const key = ids.map((k) => `${k}=${values[k]}`).join(',');
    const hit = memo.get(key);
    if (hit) return hit;
    // Once every criterion passes with slack, only a point closer to the start can win: skip
    // the others without playing them (they are not recorded as tried).
    const dev = deviation(values, start);
    if (best.distance === 0 && best.robust === 0 && dev >= best.deviation - 1e-12) return best;
    const r = await distance(values);
    const d = typeof r === 'number' ? { distance: r, robust: r } : r;
    const s: Scored = { values, distance: d.distance, robust: d.robust, deviation: dev };
    memo.set(key, s);
    tried.push(s);
    return s;
  };
  best = await score({ ...start });
  // Current values that satisfy every criterion are kept as they are (no churn).
  if (best.distance === 0) return { best, tried };
  const grids = new Map<KnobId, number[]>();
  for (const k of ids) {
    const spec = knobs[k];
    if (spec)
      grids.set(k, knobGrid(spec, start[k] ?? spec.default, settings.gridPoints, settings.digits));
  }
  for (let pass = 0; pass < settings.passes; pass++) {
    const before = best;
    for (const k of ids) {
      for (const v of grids.get(k) ?? []) {
        const s = await score({ ...best.values, [k]: v });
        if (better(s, best)) best = s;
      }
    }
    if (best === before) break;
  }
  for (let step = 0; step < settings.refineSteps; step++) {
    for (const k of ids) {
      const grid = grids.get(k) ?? [];
      const v = best.values[k];
      const i = v === undefined ? -1 : grid.indexOf(v);
      if (v === undefined || i < 0) continue;
      const near = [grid[i - 1], grid[i + 1]].filter((x): x is number => x !== undefined);
      for (const n of near) {
        // The roundest midpoint not tried yet on this grid.
        let mid: number = v;
        for (
          let d = settings.digits;
          d <= settings.digits + 3 && (mid === v || grid.includes(mid));
          d++
        )
          mid = roundSig(Math.sqrt(n * v), d);
        if (mid === v || grid.includes(mid)) continue;
        grid.push(mid);
        const s = await score({ ...best.values, [k]: mid });
        if (better(s, best)) best = s;
      }
      grid.sort((a, b) => a - b);
    }
  }
  return { best, tried };
}

/** Values of the whole catalogue with `card`'s knobs replaced. */
export function withKnobs(base: TuningValues, card: string, values: KnobValues): TuningValues {
  return { ...base, [card]: { ...base[card], ...values } };
}

export interface TuneOptions {
  card: string;
  seeds: number;
  seedOffset: number;
  /** Seeds of the control run (default: `seeds`). */
  controlSeeds?: number;
  controlSeedOffset: number;
  maxLevel: number;
  base?: TuningValues;
  settings?: SearchSettings;
  /** Strategies of the control runs (default: the whole catalogue). */
  controlStrategies?: readonly Strategy[];
  /** Plays the games (a worker pool, or this process by default). */
  runner?: SeedRunner;
  /** Regressions of other objects do not block the proposal (the author accepted them). */
  acceptRegressions?: boolean;
  log?: (line: string) => void;
}

/**
 * What the tuner concludes:
 * - `unchanged`: the current values already satisfy the criteria;
 * - `proposed`: other values satisfy them on both seed sets, without regression;
 * - `no-solution`: no value within the bounds satisfies them on the search seeds;
 * - `overfit`: the best values satisfy them on the search seeds, not on the control seeds;
 * - `regression`: they do, but another object that passed no longer does.
 */
export type TuneOutcome = 'unchanged' | 'proposed' | 'no-solution' | 'overfit' | 'regression';

export function tuneOutcome(r: {
  changed: boolean;
  best: Scored;
  targetPassesControl: boolean;
  regressions: readonly string[];
  acceptRegressions: boolean;
}): TuneOutcome {
  if (r.best.distance > 0) return 'no-solution';
  if (!r.targetPassesControl) return 'overfit';
  if (r.regressions.length > 0 && !r.acceptRegressions) return 'regression';
  return r.changed ? 'proposed' : 'unchanged';
}

export interface TuneResult {
  card: string;
  knobs: Readonly<Partial<Record<KnobId, KnobSpec>>>;
  current: KnobValues;
  best: Scored;
  /** Evaluation of the best values on the search seeds. */
  bestEvaluation: ObjectEvaluation | null;
  tried: Scored[];
  /** Control runs on other seeds, whole catalogue, current then proposed values. */
  control: {
    before: { result: RunResult; evals: ObjectEvaluation[] };
    after: { result: RunResult; evals: ObjectEvaluation[] };
  };
  /**
   * Real objects passing with the current values and failing with the proposed ones, by a
   * margin beyond the noise (`regressions`) or within it (`watch`, blocks nothing).
   */
  regressions: string[];
  watch: string[];
  flips: Flip[];
  /**
   * Criteria of the tuned object failing on the control seeds by less than the noise margin
   * (`failsWithinNoise`): accepted, shown "à surveiller". Empty when it passes or fails for real.
   */
  targetWatch: CriterionId[];
  outcome: TuneOutcome;
  /** `unchanged` or `proposed`: the values may be applied. */
  ok: boolean;
  ms: number;
}

/** Distance to the criteria of `e` with every threshold tightened by `slack`. */
export function robustDistance(e: ObjectEvaluation, slack: number): number {
  const t = thresholdsOf(e.card);
  let d = 0;
  const { essential, useful, visible } = e.criteria;
  if (essential.status !== 'n/a')
    d += Math.max(0, Math.min(1, t.essential.games + slack) - essential.value);
  if (useful.status !== 'n/a') d += Math.max(0, t.useful.levels + slack - useful.value);
  if (visible.status !== 'n/a')
    d += Math.max(
      0,
      t.visible.min + slack - visible.value,
      visible.value - (t.visible.max - slack),
    );
  return d;
}

/** A criterion of another object that passed with the current values and fails now. */
export interface Flip {
  card: string;
  criterion: CriterionId;
  before: number;
  after: number;
  /** Noise margin of this measure (`noiseMargin`). */
  margin: number;
  /** The measure moved by more than the margin: a regression; else "à surveiller". */
  beyondNoise: boolean;
}

/**
 * Noise margin of a measure (NOISE): `max(minPoints, standardErrors × √(p(1 − p) / n))`,
 * p the mean of the two measures, n the games behind them (the fewer of the two).
 */
export function noiseMargin(a: CriterionResult, b: CriterionResult): number {
  const p = Math.min(1, Math.max(0, (a.value + b.value) / 2));
  const n = Math.max(1, Math.min(a.n, b.n));
  return Math.max(NOISE.minPoints, NOISE.standardErrors * Math.sqrt((p * (1 - p)) / n));
}

/** Noise margin of one measure: `max(minPoints, standardErrors × √(p(1 − p) / n))`. */
export function measureMargin(c: CriterionResult): number {
  return noiseMargin(c, c);
}

/**
 * The failing criteria of `e` when each fails by less than its noise margin (distance to its
 * threshold at most `measureMargin`), else [] (it passes, or one failure is real).
 */
export function failsWithinNoise(e: ObjectEvaluation): CriterionId[] {
  const failing = CRITERION_IDS.filter((k) => e.criteria[k].status === 'fail');
  if (failing.length === 0) return [];
  const close = failing.every(
    (k) => e.criteria[k].distance <= measureMargin(e.criteria[k]) + 1e-12,
  );
  return close ? failing : [];
}

/**
 * Criteria of real objects (not `except`, not placeholders; the socle is never evaluated)
 * that pass in `before`, for an object passing as a whole, and fail in `after`.
 */
export function verdictFlips(
  before: readonly ObjectEvaluation[],
  after: readonly ObjectEvaluation[],
  except: string,
): Flip[] {
  const flips: Flip[] = [];
  for (const e of after) {
    if (e.placeholder || e.card === except || e.pass) continue;
    const b = before.find((x) => x.card === e.card);
    if (!b?.pass) continue;
    for (const k of CRITERION_IDS) {
      const was = b.criteria[k];
      const now = e.criteria[k];
      if (was.status !== 'pass' || now.status !== 'fail') continue;
      const margin = noiseMargin(was, now);
      flips.push({
        card: e.card,
        criterion: k,
        before: was.value,
        after: now.value,
        margin,
        beyondNoise: Math.abs(now.value - was.value) > margin + 1e-12,
      });
    }
  }
  return flips;
}

/** Current values of `card`'s knobs (stored or default). */
export function currentKnobs(card: string, base: TuningValues = TUNED): KnobValues {
  const out: KnobValues = {};
  for (const k of KNOB_IDS) {
    const spec = KNOBS[card]?.[k];
    if (spec) out[k] = base[card]?.[k] ?? spec.default;
  }
  return out;
}

export async function tune(opts: TuneOptions): Promise<TuneResult> {
  const start = performance.now();
  const base = opts.base ?? TUNED;
  const knobs = KNOBS[opts.card];
  const def = CARDS.find((c) => c.id === opts.card);
  if (isSocle(opts.card)) throw new Error(`${opts.card}: socle card, the criteria do not apply`);
  if (!knobs || !def) throw new Error(`${opts.card}: no such object with knobs`);
  const current = currentKnobs(opts.card, base);
  const runner = opts.runner ?? localRunner();
  const strategies: Strategy[] = [REFERENCE, ...objectStrategies(opts.card)];
  const evaluations = new Map<string, ObjectEvaluation | null>();
  const evaluate = async (values: KnobValues): Promise<ObjectEvaluation | null> => {
    const key = JSON.stringify(values);
    if (evaluations.has(key)) return evaluations.get(key) ?? null;
    const result = await runSimulation(
      {
        seeds: opts.seeds,
        seedOffset: opts.seedOffset,
        maxLevel: opts.maxLevel,
        strategies,
        tuning: withKnobs(base, opts.card, values),
      },
      runner,
    );
    const e = evaluateObject(result, def);
    evaluations.set(key, e);
    opts.log?.(
      `  ${Object.entries(values)
        .map(([k, v]) => `${k}=${v}`)
        .join(
          ' ',
        )} → écart ${e ? e.distance.toFixed(3) : '?'}, avec marge ${e ? robustDistance(e, TUNER.safety).toFixed(3) : '?'}`,
    );
    return e;
  };
  const { best, tried } = await coordinateSearch(
    knobs,
    current,
    async (v) => {
      const e = await evaluate(v);
      return e
        ? { distance: e.distance, robust: robustDistance(e, TUNER.safety) }
        : { distance: Infinity, robust: Infinity };
    },
    opts.settings ?? TUNER,
  );
  const controlStrategies = opts.controlStrategies ?? defaultStrategies();
  const control = async (
    tuning: TuningValues,
  ): Promise<{ result: RunResult; evals: ObjectEvaluation[] }> => {
    const result = await runSimulation(
      {
        seeds: opts.controlSeeds ?? opts.seeds,
        seedOffset: opts.controlSeedOffset,
        maxLevel: opts.maxLevel,
        strategies: controlStrategies,
        tuning,
      },
      runner,
    );
    return { result, evals: evaluateCatalogue(result) };
  };
  opts.log?.('  contrôle sur d’autres graines : valeurs actuelles…');
  const before = await control(base);
  const changed = Object.entries(best.values).some(([k, v]) => current[k as KnobId] !== v);
  if (changed) opts.log?.('  contrôle sur d’autres graines : valeurs proposées…');
  const after = changed ? await control(withKnobs(base, opts.card, best.values)) : before;
  const flips = verdictFlips(before.evals, after.evals, opts.card);
  const regressions = [...new Set(flips.filter((f) => f.beyondNoise).map((f) => f.card))];
  const watch = [...new Set(flips.map((f) => f.card))].filter((c) => !regressions.includes(c));
  const target = after.evals.find((e) => e.card === opts.card);
  const targetWatch = target ? failsWithinNoise(target) : [];
  const outcome = tuneOutcome({
    changed,
    best,
    targetPassesControl: target !== undefined && (target.pass || targetWatch.length > 0),
    regressions,
    acceptRegressions: opts.acceptRegressions === true,
  });
  return {
    card: opts.card,
    knobs,
    current,
    best,
    bestEvaluation: evaluations.get(JSON.stringify(best.values)) ?? null,
    tried,
    control: { before, after },
    regressions,
    watch,
    flips,
    targetWatch,
    outcome,
    ok: outcome === 'unchanged' || outcome === 'proposed',
    ms: performance.now() - start,
  };
}
