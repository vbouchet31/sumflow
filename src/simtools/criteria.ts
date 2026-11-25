/**
 * The three balance criteria of PLAN-objets §4, evaluated on a run, object by object:
 * 1. not essential, 2. not useless (with the `object:<id>` strategy against `natural`),
 * 3. visible (offered before its benchmark level). Thresholds in `config.ts`.
 */
import { OPERATOR_BUILDINGS } from '../config/buildings';
import { type CardDef, CARDS, OFFERS, PASSIVE_EFFECTS } from '../config/cards';
import { naturalSequence } from '../sim/offers';
import {
  BENCHMARK_LEVELS,
  CRITERIA,
  CRITERIA_OVERRIDES,
  type CriteriaThresholds,
  DEFAULT_BENCHMARK,
  INDEX_EPSILON,
} from './config';
import type { RunResult, StrategyRun } from './run';

export type CriterionId = 'essential' | 'useful' | 'visible';
export const CRITERION_IDS: readonly CriterionId[] = ['essential', 'useful', 'visible'];

export interface CriterionResult {
  status: 'pass' | 'fail' | 'n/a';
  /** Measured value (share of games, median share of levels, share of games). */
  value: number;
  /** How far from passing, 0 when it passes or does not apply (the tuner minimises it). */
  distance: number;
  /** What is required, readable. */
  target: string;
  note?: string;
}

/** How often an object shows up and is taken with one strategy. */
export interface Exposure {
  /** Share of games where it is offered at least once. */
  offered: number;
  /** Median level of its first offer, among those games (null if never offered). */
  firstOffer: number | null;
  /** Share of games where it is picked at least once. */
  picked: number;
  /** Mean picks per game. */
  picks: number;
}

export interface ObjectEvaluation {
  card: string;
  placeholder: boolean;
  /** Why the cost model cannot see the object's effect, or null if it can. */
  unmodelled: string | null;
  /** Level of the natural sequence giving this card, or null. */
  naturalLevel: number | null;
  benchmark: number;
  exposure: Record<string, Exposure>;
  criteria: Record<CriterionId, CriterionResult>;
  /** All applicable criteria pass. */
  pass: boolean;
  /** Sum of the criteria distances. */
  distance: number;
}

/** Thresholds of `card`, with its overrides. */
export function thresholdsOf(card: string): CriteriaThresholds {
  const o = CRITERIA_OVERRIDES[card] ?? {};
  return {
    essential: { ...CRITERIA.essential, ...o.essential },
    useful: { ...CRITERIA.useful, ...o.useful },
    visible: { ...CRITERIA.visible, ...o.visible },
  };
}

/** First level of the natural sequence giving `card`, or null. */
export function naturalLevelOf(card: string): number | null {
  const i = naturalSequence().findIndex((s) => s.card === card);
  return i >= 0 ? i + 1 : null;
}

/** Benchmark level of `card` (criterion 3). */
export function benchmarkOf(card: string): number {
  return BENCHMARK_LEVELS[card] ?? naturalLevelOf(card) ?? DEFAULT_BENCHMARK;
}

/**
 * Why the cost model ignores the effect of `card`, or null when it reads it: a feature or a
 * building that computes nothing (bridge, storage) changes no item cost.
 */
export function unmodelledReason(card: CardDef): string | null {
  const e = card.effect;
  if (e.kind === 'feature') return 'fonctionnalité sans effet sur le coût';
  if (e.kind === 'unlock' && !Object.hasOwn(OPERATOR_BUILDINGS, e.building))
    return 'bâtiment sans opération, sans effet sur le coût';
  if (e.kind === 'passive' && PASSIVE_EFFECTS[e.id].operatorSpeed === 1)
    return 'passif sans effet de vitesse';
  return null;
}

export function median(xs: readonly number[]): number {
  return quantile(xs, 0.5);
}

/** Quantile with linear interpolation (deterministic). NaN for an empty list. */
export function quantile(xs: readonly number[], q: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = s[lo] ?? NaN;
  const b = s[hi] ?? NaN;
  return a + (b - a) * (pos - lo);
}

export function exposureOf(run: StrategyRun, card: string): Exposure {
  const n = run.games.length || 1;
  let offered = 0;
  let picked = 0;
  let picks = 0;
  const first: number[] = [];
  for (const g of run.games) {
    const f = g.firstOffered[card];
    if (f !== undefined) {
      offered++;
      first.push(f);
    }
    const p = g.picks.filter((x) => x.card === card).length;
    if (p > 0) picked++;
    picks += p;
  }
  return {
    offered: offered / n,
    firstOffer: first.length > 0 ? median(first) : null,
    picked: picked / n,
    picks: picks / n,
  };
}

/** Longest run of consecutive levels with an index under `below`. */
export function longestRunBelow(index: readonly number[], below: number): number {
  let best = 0;
  let cur = 0;
  for (const x of index) {
    cur = x < below - INDEX_EPSILON ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best;
}

const pct = (x: number): string => `${Math.round(x * 100)} %`;

/** Criterion 1: share of games without a run of more than `maxRun` levels under `below`. */
export function essentialCriterion(run: StrategyRun, t: CriteriaThresholds): CriterionResult {
  const { below, maxRun, games } = t.essential;
  const ok = run.index.filter((ix) => longestRunBelow(ix, below) <= maxRun).length;
  const value = ok / (run.index.length || 1);
  return {
    status: value >= games ? 'pass' : 'fail',
    value,
    distance: Math.max(0, games - value),
    target: `≥ ${pct(games)} des parties sans plus de ${maxRun} niveaux de suite sous ${below}`,
  };
}

/** Criterion 2: median share of the levels after the first pick with an index under `below`. */
export function usefulCriterion(
  run: StrategyRun,
  card: string,
  t: CriteriaThresholds,
): CriterionResult {
  const { below, levels } = t.useful;
  const shares: number[] = [];
  run.games.forEach((g, i) => {
    const first = g.picks.find((p) => p.card === card)?.level;
    const ix = run.index[i];
    if (first === undefined || !ix) return;
    // The card picked at the offer of level p plays from level p + 1.
    const after = ix.slice(first);
    if (after.length === 0) return;
    shares.push(after.filter((x) => x < below - INDEX_EPSILON).length / after.length);
  });
  const target = `médiane ≥ ${pct(levels)} des niveaux après la 1re prise sous ${below}`;
  if (shares.length === 0)
    return { status: 'fail', value: 0, distance: levels, target, note: 'jamais pris' };
  const value = median(shares);
  return {
    status: value >= levels ? 'pass' : 'fail',
    value,
    distance: Math.max(0, levels - value),
    target,
  };
}

/** Criterion 3: share of games offering the card at a level before its benchmark. */
export function visibleCriterion(
  run: StrategyRun,
  card: string,
  benchmark: number,
  t: CriteriaThresholds,
): CriterionResult {
  const { min, max } = t.visible;
  const target = `${pct(min)} à ${pct(max)} des parties, offert avant le niveau ${benchmark}`;
  if (benchmark <= OFFERS.fixedUntil + 1)
    return {
      status: 'n/a',
      value: 0,
      distance: 0,
      target,
      note: 'aucune offre avant le niveau repère',
    };
  const seen = run.games.filter((g) => (g.firstOffered[card] ?? Infinity) < benchmark).length;
  const value = seen / (run.games.length || 1);
  return {
    status: value >= min && value <= max ? 'pass' : 'fail',
    value,
    distance: Math.max(0, min - value, value - max),
    target,
  };
}

/** The three criteria and the exposure of `card` in `result` (its `object:<id>` run is needed). */
export function evaluateObject(result: RunResult, card: CardDef): ObjectEvaluation | null {
  const run = result.runs.get(`object:${card.id}`);
  if (!run) return null;
  const t = thresholdsOf(card.id);
  const benchmark = benchmarkOf(card.id);
  const unmodelled = unmodelledReason(card);
  const exposure: Record<string, Exposure> = {};
  for (const [name, r] of result.runs) exposure[name] = exposureOf(r, card.id);
  const useful = usefulCriterion(run, card.id, t);
  const criteria: Record<CriterionId, CriterionResult> = {
    essential: essentialCriterion(run, t),
    useful: unmodelled ? { ...useful, status: 'n/a', distance: 0, note: unmodelled } : useful,
    visible: visibleCriterion(run, card.id, benchmark, t),
  };
  const applicable = CRITERION_IDS.map((k) => criteria[k]).filter((c) => c.status !== 'n/a');
  return {
    card: card.id,
    placeholder: card.placeholder === true,
    unmodelled,
    naturalLevel: naturalLevelOf(card.id),
    benchmark,
    exposure,
    criteria,
    pass: applicable.every((c) => c.status === 'pass'),
    distance: applicable.reduce((s, c) => s + c.distance, 0),
  };
}

/** Evaluation of every object with an `object:<id>` run, in catalogue order. */
export function evaluateCatalogue(
  result: RunResult,
  cards: readonly CardDef[] = CARDS,
): ObjectEvaluation[] {
  return cards.flatMap((c) => {
    const e = evaluateObject(result, c);
    return e ? [e] : [];
  });
}
