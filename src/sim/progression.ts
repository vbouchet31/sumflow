import { type Track, TRACKS } from '../config/balance';
import type { Edition } from '../config/cards';
import { palierThresholds, paliersFor } from './levels';
import {
  drawOffer,
  isNaturalOwned,
  naturalAt,
  naturalStep,
  nextPity,
  type OfferCard,
} from './offers';
import { grantCard, obtainCard, offerContext } from './rewards';
import { type GameState, MAX_PALIERS, requirementFor, type StoredOffer } from './state';
import { buyUpgrade, isUpgradeReady } from './upgrades';

export type ProgressionEvents = {
  delivered: { value: number };
  /** `reward`: the fil rouge card the level gave (PLAN-paliers §3.1), null if none was left. */
  levelCompleted: { level: number; reward: OfferCard | null; final: boolean };
  /** Palier `palier` of `of` of `level` was reached; its offer joined the queue. */
  palierReached: { level: number; palier: number; of: number; pending: number };
  /** An offer was drawn; `pending` counts the offers waiting, this one included. */
  offerReady: { level: number; palier: number; cards: OfferCard[]; pending: number };
  /**
   * A card of the offer of `level`, `palier` was taken. `final`: the game is finished and no
   * offer waits any more (the end screen may open).
   */
  cardChosen: {
    level: number;
    palier: number;
    card: string;
    edition: Edition;
    value?: number;
    final: boolean;
  };
  upgradeReady: { track: Track };
  upgradeBought: { track: Track; level: number };
};

export type Emit = <K extends keyof ProgressionEvents>(
  type: K,
  payload: ProgressionEvents[K],
) => void;

/**
 * Delivered counts at which the paliers of the current level are reached (PLAN-paliers §3.2),
 * increasing; empty without palier or in free play.
 */
export function levelPaliers(state: GameState): number[] {
  const req = state.levelRequirement;
  if (!req) return [];
  return palierThresholds(paliersFor(state.level).slice(0, MAX_PALIERS), req.required);
}

/**
 * Count one item of `value` delivered to the hub (PLAN §7.1). Every active, incomplete
 * requirement of that value advances: the level's and each track's next upgrade. One item
 * can therefore count several times; items beyond a requirement are lost. Reaching a palier
 * queues its offer, before the level ends if the same item ends it (PLAN-paliers §3.2).
 */
export function deliver(state: GameState, value: number, emit?: Emit): void {
  state.totalDelivered += 1;
  emit?.('delivered', { value });
  for (const track of TRACKS) {
    const reqs = state.upgradeReqs[track];
    let hit = false;
    for (const r of reqs) {
      if (r.value === value && r.delivered < r.required) {
        r.delivered += 1;
        hit = true;
      }
    }
    if (hit && isUpgradeReady(state, track)) {
      emit?.('upgradeReady', { track });
      if (state.autoBuyUpgrades) purchase(state, track, emit);
    }
  }
  const req = state.levelRequirement;
  if (req && req.value === value && req.delivered < req.required) {
    req.delivered += 1;
    const thresholds = levelPaliers(state);
    thresholds.forEach((at, i) => {
      if (at !== req.delivered) return;
      const palier = i + 1;
      state.pendingOffers.push({ level: state.level, palier });
      emit?.('palierReached', {
        level: state.level,
        palier,
        of: thresholds.length,
        pending: state.pendingOffers.length,
      });
    });
    if (req.delivered >= req.required) completeLevel(state, emit);
  }
}

/** Buy an upgrade (manual button or auto-buy). Effects are immediate (PLAN §7.3). */
export function purchase(state: GameState, track: Track, emit?: Emit): boolean {
  if (!buyUpgrade(state, track)) return false;
  emit?.('upgradeBought', { track, level: state.upgrades[track] });
  // The new window may already be complete only if it is empty; nothing else to do.
  return true;
}

/** Turning auto-buy on buys everything already ready. */
export function setAutoBuy(state: GameState, on: boolean, emit?: Emit): void {
  state.autoBuyUpgrades = on;
  if (!on) return;
  for (const track of TRACKS) if (isUpgradeReady(state, track)) purchase(state, track, emit);
}

/**
 * Finish the current level (PLAN-paliers §3.1): it gives its fil rouge card at once, the
 * first item of the sequence not owned yet (so a reward is never lost, nor given twice). The
 * next level starts immediately; after the final one the game switches to free play.
 */
export function completeLevel(state: GameState, emit?: Emit): void {
  const done = state.level;
  const def = state.levels[done - 1];
  const step = naturalAt(offerContext(state, done));
  const reward = grantCard(state, step.card, 'base', done) ?? null;
  const final = def?.final ?? false;
  if (final) {
    state.levelRequirement = null;
    state.finishedAtTick = state.tick;
  } else {
    state.level = done + 1;
    state.levelRequirement = requirementFor(state, state.level);
  }
  emit?.('levelCompleted', { level: done, reward, final });
}

/**
 * The offer of the first pending palier, drawn now if it is not yet (PLAN-recompenses §4.4):
 * drawn late so it accounts for the earlier choices, stored so a reload shows the same
 * cards. Drawing it moves the safety net counters on (PLAN-paliers §3.5). Null when no offer
 * is pending.
 */
export function ensureOffer(state: GameState, emit?: Emit): StoredOffer | null {
  const next = state.pendingOffers[0];
  if (next === undefined) {
    state.currentOffer = null;
    return null;
  }
  const cur = state.currentOffer;
  if (cur?.level === next.level && cur.palier === next.palier) return cur;
  const ctx = offerContext(state, next.level, next.palier);
  const offer = drawOffer(ctx);
  state.pity = nextPity(ctx, offer.cards);
  state.currentOffer = { level: next.level, palier: next.palier, cards: offer.cards };
  emit?.('offerReady', {
    level: next.level,
    palier: next.palier,
    cards: offer.cards.map((c) => ({ ...c })),
    pending: state.pendingOffers.length,
  });
  return state.currentOffer;
}

/**
 * Take card `index` of the current offer (drawn first if needed): apply it, record it, then
 * move on to the next pending palier. False if there is no such card.
 */
export function chooseCard(state: GameState, index: number, emit?: Emit): boolean {
  const offer = ensureOffer(state, emit);
  const card = offer?.cards[index];
  if (!offer || !card) return false;
  const obtained = obtainCard(state, card, offer.level, offer.palier);
  state.pendingOffers.shift();
  state.currentOffer = null;
  emit?.('cardChosen', {
    level: offer.level,
    palier: offer.palier,
    ...obtained,
    final: isFinished(state) && state.pendingOffers.length === 0,
  });
  return true;
}

/** True once the final level is done (free play). */
export function isFinished(state: GameState): boolean {
  return state.finishedAtTick !== null;
}

/**
 * Debug: jump to `level`, granting the natural card of every level before it (those not
 * obtained yet), and dropping the pending offers.
 */
export function setLevel(state: GameState, level: number): void {
  const target = Math.max(1, Math.floor(level));
  for (let n = 1; n < target; n++) {
    const step = naturalStep(n);
    if (!isNaturalOwned(step, offerContext(state, n))) grantCard(state, step.card, 'base', n);
  }
  state.pendingOffers = [];
  state.currentOffer = null;
  state.level = target;
  state.finishedAtTick = null;
  state.levelRequirement = requirementFor(state, target);
}
