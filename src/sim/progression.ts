import { type Track, TRACKS } from '../config/balance';
import type { Edition } from '../config/cards';
import { drawOffer, fixedReward, isNaturalOwned, naturalStep, type OfferCard } from './offers';
import { grantCard, obtainCard, offerContext } from './rewards';
import { type GameState, requirementFor, type StoredOffer } from './state';
import { buyUpgrade, isUpgradeReady } from './upgrades';

export type ProgressionEvents = {
  delivered: { value: number };
  /** `reward`: the card of a fixed level (1 and 2); null when the level gives an offer. */
  levelCompleted: { level: number; reward: OfferCard | null; final: boolean };
  /** An offer was drawn for `level`; `pending` counts the offers waiting, this one included. */
  offerReady: { level: number; cards: OfferCard[]; pending: number };
  /** A card of the offer of `level` was taken. `final`: that level was the last one. */
  cardChosen: { level: number; card: string; edition: Edition; value?: number; final: boolean };
  upgradeReady: { track: Track };
  upgradeBought: { track: Track; level: number };
};

export type Emit = <K extends keyof ProgressionEvents>(
  type: K,
  payload: ProgressionEvents[K],
) => void;

/**
 * Count one item of `value` delivered to the hub (PLAN §7.1). Every active, incomplete
 * requirement of that value advances: the level's and each track's next upgrade. One item
 * can therefore count several times; items beyond a requirement are lost.
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
 * Finish the current level (PLAN-recompenses §4.1): levels 1 and 2 give their fixed card at
 * once; every later level, the final one included, joins the queue of pending offers. The
 * next level starts immediately; after the final one the game switches to free play.
 */
export function completeLevel(state: GameState, emit?: Emit): void {
  const done = state.level;
  const def = state.levels[done - 1];
  const fixed = fixedReward(done);
  let reward: OfferCard | null = null;
  if (fixed) reward = grantCard(state, fixed.card, 'base', done) ?? null;
  else state.pendingLevels.push(done);
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
 * The offer of the first pending level, drawn now if it is not yet (PLAN-recompenses §4.4):
 * drawn late so it accounts for the earlier choices, stored so a reload shows the same
 * cards. Null when no offer is pending.
 */
export function ensureOffer(state: GameState, emit?: Emit): StoredOffer | null {
  const level = state.pendingLevels[0];
  if (level === undefined) {
    state.currentOffer = null;
    return null;
  }
  if (state.currentOffer?.level === level) return state.currentOffer;
  const offer = drawOffer(offerContext(state, level));
  state.currentOffer = { level, cards: offer.cards };
  emit?.('offerReady', {
    level,
    cards: offer.cards.map((c) => ({ ...c })),
    pending: state.pendingLevels.length,
  });
  return state.currentOffer;
}

/**
 * Take card `index` of the current offer (drawn first if needed): apply it, record it, update
 * the refusal counter, then move on to the next pending level. False if there is no such card.
 */
export function chooseCard(state: GameState, index: number, emit?: Emit): boolean {
  const offer = ensureOffer(state, emit);
  const card = offer?.cards[index];
  if (!offer || !card) return false;
  const obtained = obtainCard(state, card, offer.level, offer.cards);
  state.pendingLevels.shift();
  state.currentOffer = null;
  emit?.('cardChosen', {
    level: offer.level,
    ...obtained,
    final: state.levels[offer.level - 1]?.final ?? false,
  });
  return true;
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
  state.pendingLevels = [];
  state.currentOffer = null;
  state.naturalRefusals = 0;
  state.level = target;
  state.finishedAtTick = null;
  state.levelRequirement = requirementFor(state, target);
}
