/**
 * One simulated game (PLAN-objets §3.1): a seed and a strategy, played from level 1 to the
 * max level with the game's own progression and offer code. No factory is simulated: each
 * level's time comes from the cost model on the tools owned while it is played.
 */
import { paliersFor } from '../sim/levels';
import { DEFAULT_CATALOGUE, drawOffer } from '../sim/offers';
import { chooseCard, completeLevel } from '../sim/progression';
import { offerContext } from '../sim/rewards';
import { createInitialState } from '../sim/state';
import { TUNED, type TuningValues } from '../config/tuning';
import { type CostCache, explain } from './cost';
import { type Strategy, pickIndex, strategyName } from './strategies';
import { costTools } from './tools';

export interface PickRecord {
  /** Level of the offer (the level just completed). */
  level: number;
  card: string;
  edition: string;
}

export interface GameRecord {
  seed: number;
  strategy: string;
  /** Per level played, index 0 = level 1. */
  targets: number[];
  quantities: number[];
  /** Level time from the cost model, in seconds. */
  times: number[];
  /** Cards obtained from offers (fixed levels excluded). */
  picks: PickRecord[];
  /** Level of the first offer showing each card. */
  firstOffered: Record<string, number>;
  /** Number of offers showing each card. */
  offered: Record<string, number>;
  /** Recipe of each level's target, when asked for (`explain`). */
  recipes?: string[];
}

export interface GameOptions {
  seed: number;
  strategy: Strategy;
  maxLevel: number;
  cache: CostCache;
  tuning?: TuningValues;
  /** Also record the recipe of each level (slow: for one game of the JSON report). */
  explain?: boolean;
}

export function playGame(opts: GameOptions): GameRecord {
  const tuning = opts.tuning ?? TUNED;
  const catalogue = { ...DEFAULT_CATALOGUE, tuning };
  const state = createInitialState(opts.seed);
  const rec: GameRecord = {
    seed: opts.seed,
    strategy: strategyName(opts.strategy),
    targets: [],
    quantities: [],
    times: [],
    picks: [],
    firstOffered: {},
    offered: {},
  };
  for (let level = 1; level <= opts.maxLevel; level++) {
    const def = state.levels[level - 1];
    if (!def || state.level !== level) break;
    const { tools, capacity } = costTools(state, level, tuning);
    rec.targets.push(def.target);
    rec.quantities.push(def.quantity);
    rec.times.push((def.quantity * opts.cache.itemCost(tools, def.target)) / capacity);
    if (opts.explain) (rec.recipes ??= []).push(explain(tools, def.target).expr);
    if (def.final || level === opts.maxLevel) break;
    // Paliers of the level (PLAN-paliers §3.2), chosen before the level gives its fil rouge.
    paliersFor(level).forEach((_, i) => state.pendingOffers.push({ level, palier: i + 1 }));
    for (let guard = 0; state.pendingOffers.length > 0 && guard < 100; guard++) {
      const next = state.pendingOffers[0] ?? { level, palier: 1 };
      const offer = drawOffer(offerContext(state, next.level, next.palier), catalogue);
      const stored = { ...next, cards: offer.cards };
      state.currentOffer = stored;
      for (const c of offer.cards) {
        rec.offered[c.card] = (rec.offered[c.card] ?? 0) + 1;
        rec.firstOffered[c.card] ??= next.level;
      }
      const card = offer.cards[pickIndex(state, stored, opts.strategy)];
      if (!card || !chooseCard(state, offer.cards.indexOf(card))) {
        state.pendingOffers.shift();
        state.currentOffer = null;
        continue;
      }
      rec.picks.push({ level: next.level, card: card.card, edition: card.edition });
    }
    completeLevel(state);
  }
  return rec;
}
