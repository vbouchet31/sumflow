/**
 * One simulated game (PLAN-objets §3.1, PLAN-paliers §5.1): a seed and a strategy, played
 * from level 1 to the max level with the game's own progression and offer code. No factory
 * is simulated: each level is cut at its paliers, and each part's time comes from the cost
 * model on the tools owned while it is played (an object taken at a palier speeds up the
 * rest of the level). Every level then gives its fil rouge card.
 */
import { PALIERS, QUANTITY_FACTOR } from '../config/balance';
import { TUNED, type TuningValues } from '../config/tuning';
import { paliersFor, quantityFor } from '../sim/levels';
import { DEFAULT_CATALOGUE, drawOffer, isAvailable, nextPity } from '../sim/offers';
import { chooseCard, completeLevel } from '../sim/progression';
import { offerContext } from '../sim/rewards';
import { createInitialState } from '../sim/state';
import { type CostCache, explain } from './cost';
import { pickIndex, type Strategy, strategyName } from './strategies';
import { costTools } from './tools';

export interface PickRecord {
  /** Level and palier (1-based) of the offer. */
  level: number;
  palier: number;
  card: string;
  edition: string;
}

/** Level settings a run may override (`--paliers`, `--quantity-factor`), plain data. */
export interface LevelSettings {
  paliers: readonly { from: number; at: readonly number[] }[];
  quantityFactor: readonly { from: number; factor: number }[];
}

/** The game's own level settings. */
export const GAME_LEVELS: LevelSettings = { paliers: PALIERS, quantityFactor: QUANTITY_FACTOR };

export interface GameRecord {
  seed: number;
  strategy: string;
  /** Per level played, index 0 = level 1. */
  targets: number[];
  quantities: number[];
  /** Level time from the cost model, in seconds. */
  times: number[];
  /**
   * Time of each part of each level, cut at its paliers (one part without palier): the time
   * between two rewards, a palier offer or the fil rouge (PLAN-paliers §5.4).
   */
  segments: number[][];
  /** Cards obtained from palier offers (the fil rouge excluded). */
  picks: PickRecord[];
  /** Level of the first offer showing each card. */
  firstOffered: Record<string, number>;
  /** Number of offers showing each card. */
  offered: Record<string, number>;
  /** Number of offers drawn while each card was available (criterion 4). */
  available: Record<string, number>;
  /** Recipe of each level's target, when asked for (`explain`). */
  recipes?: string[];
}

export interface GameOptions {
  seed: number;
  strategy: Strategy;
  maxLevel: number;
  cache: CostCache;
  tuning?: TuningValues;
  /** Paliers and quantity factors (the game's by default). */
  levels?: LevelSettings;
  /** Also record the recipe of each level (slow: for one game of the JSON report). */
  explain?: boolean;
}

export function playGame(opts: GameOptions): GameRecord {
  const tuning = opts.tuning ?? TUNED;
  const settings = opts.levels ?? GAME_LEVELS;
  const catalogue = { ...DEFAULT_CATALOGUE, tuning };
  const state = createInitialState(opts.seed);
  const rec: GameRecord = {
    seed: opts.seed,
    strategy: strategyName(opts.strategy),
    targets: [],
    quantities: [],
    times: [],
    segments: [],
    picks: [],
    firstOffered: {},
    offered: {},
    available: {},
  };
  for (let level = 1; level <= opts.maxLevel; level++) {
    const def = state.levels[level - 1];
    if (!def || state.level !== level) break;
    const quantity = quantityFor(level, settings.quantityFactor);
    const fractions = paliersFor(level, settings.paliers);
    const bounds = [0, ...fractions, 1];
    rec.targets.push(def.target);
    rec.quantities.push(quantity);
    if (opts.explain)
      (rec.recipes ??= []).push(explain(costTools(state, level, tuning).tools, def.target).expr);
    const parts: number[] = [];
    for (let k = 0; k + 1 < bounds.length; k++) {
      const { tools, capacity } = costTools(state, level, tuning);
      const share = (bounds[k + 1] ?? 1) - (bounds[k] ?? 0);
      parts.push((share * quantity * opts.cache.itemCost(tools, def.target)) / capacity);
      if (k < fractions.length) offerAt(state, level, k + 1, opts.strategy, catalogue, rec);
    }
    rec.segments.push(parts);
    rec.times.push(parts.reduce((sum, t) => sum + t, 0));
    if (def.final || level === opts.maxLevel) break;
    completeLevel(state);
  }
  return rec;
}

/** Draw the offer of `palier` of `level` with the game's code and let `strategy` choose. */
function offerAt(
  state: ReturnType<typeof createInitialState>,
  level: number,
  palier: number,
  strategy: Strategy,
  catalogue: typeof DEFAULT_CATALOGUE,
  rec: GameRecord,
): void {
  const ctx = offerContext(state, level, palier);
  const offer = drawOffer(ctx, catalogue);
  for (const c of catalogue.cards)
    if (isAvailable(c, ctx)) rec.available[c.id] = (rec.available[c.id] ?? 0) + 1;
  state.pity = nextPity(ctx, offer.cards, catalogue);
  for (const c of offer.cards) {
    rec.offered[c.card] = (rec.offered[c.card] ?? 0) + 1;
    rec.firstOffered[c.card] ??= level;
  }
  const stored = { level, palier, cards: offer.cards };
  const index = pickIndex(state, stored, strategy);
  const card = index === null ? undefined : offer.cards[index];
  if (!card || index === null) return;
  state.pendingOffers = [{ level, palier }];
  state.currentOffer = stored;
  if (chooseCard(state, index))
    rec.picks.push({ level, palier, card: card.card, edition: card.edition });
  state.pendingOffers = [];
  state.currentOffer = null;
}
