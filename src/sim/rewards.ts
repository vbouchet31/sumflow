/**
 * Reward cards applied to the game (PLAN-recompenses §3.2, §3.5, §3.6): the offer context
 * read from the state, the effect of each card kind, the record of picks and the refusal
 * counter of the natural card. The draw itself is in `offers.ts`.
 */
import { CARDS, type CardDef, type Edition } from '../config/cards';
import {
  naturalAt,
  type NaturalStep,
  nextValue,
  type OfferCard,
  type OfferContext,
} from './offers';
import type { GameState } from './state';
import { syncUpgradeRequirements } from './upgrades';

/** The catalogue entry of `id`, or undefined. */
export function cardDef(id: string): CardDef | undefined {
  return CARDS.find((c) => c.id === id);
}

/** Times each card id was picked. */
export function pickCounts(state: GameState): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of state.picks) counts[p.card] = (counts[p.card] ?? 0) + 1;
  return counts;
}

/** What a draw reads from the game, for the offer of `level` (the level just completed). */
export function offerContext(state: GameState, level: number): OfferContext {
  return {
    seed: state.seed,
    level,
    maxExtraction: state.maxExtraction,
    unlockedBuildings: state.unlockedBuildings,
    unlockedFeatures: state.unlockedFeatures,
    picks: pickCounts(state),
    naturalRefusals: state.naturalRefusals,
  };
}

/** The current natural item (the level only matters for weights, not for the item). */
function currentNatural(state: GameState): NaturalStep {
  return naturalAt(offerContext(state, state.level));
}

const sameStep = (a: NaturalStep, b: NaturalStep): boolean =>
  a.card === b.card && a.value === b.value;

/**
 * The offer card `id` would be as a grant: edition cards carry their own edition, special
 * buildings take `edition` (base by default), every other card is base. Undefined if unknown.
 */
export function grantedCard(id: string, edition: Edition = 'base'): OfferCard | undefined {
  const def = cardDef(id);
  if (!def) return undefined;
  const e = def.effect;
  if (e.kind === 'edition') return { card: id, edition: e.edition };
  if (e.kind === 'special') return { card: id, edition };
  return { card: id, edition: 'base' };
}

/**
 * Apply the effect of `card` (one place for every kind). Returns the value obtained for a
 * value card, else undefined. Values come one by one, in order (9 → 11).
 */
export function applyCard(state: GameState, card: OfferCard): number | undefined {
  const def = cardDef(card.card);
  if (!def) return undefined;
  const e = def.effect;
  let value: number | undefined;
  switch (e.kind) {
    case 'value':
      state.maxExtraction = nextValue(state.maxExtraction);
      value = state.maxExtraction;
      break;
    case 'unlock':
      if (!state.unlockedBuildings.includes(e.building)) state.unlockedBuildings.push(e.building);
      break;
    case 'feature':
      if (!state.unlockedFeatures.includes(e.feature)) state.unlockedFeatures.push(e.feature);
      break;
    case 'edition':
      state.editionCards[e.edition] += 1;
      break;
    case 'special': {
      const k = `${e.building}:${card.edition}`;
      state.specials[k] = (state.specials[k] ?? 0) + e.count;
      break;
    }
    case 'passive':
      state.passives.push(e.id);
      break;
    case 'meta':
      // Read from the picks by `offerSlots` (Éventail adds the Joker slot).
      break;
  }
  syncUpgradeRequirements(state);
  return value;
}

/**
 * Obtain `card` at `level`: apply it, record the pick and update the refusal counter.
 * `offered` is the offer it was chosen from (null for a fixed level or a grant): a refusal
 * is an offer that held the natural card while another card was taken. The counter goes back
 * to 0 whenever the natural item changes, i.e. it was obtained, by any means.
 */
export function obtainCard(
  state: GameState,
  card: OfferCard,
  level: number,
  offered: readonly OfferCard[] | null,
): OfferCard {
  const before = currentNatural(state);
  const refused =
    offered !== null && card.card !== before.card && offered.some((c) => c.card === before.card);
  const value = applyCard(state, card);
  const obtained: OfferCard = { card: card.card, edition: card.edition };
  if (value !== undefined) obtained.value = value;
  state.picks.push({ level, ...obtained, tick: state.tick });
  if (!sameStep(before, currentNatural(state))) state.naturalRefusals = 0;
  else if (refused) state.naturalRefusals += 1;
  return obtained;
}

/** Give card `id` outside an offer (fixed level, debug). Undefined if the id is unknown. */
export function grantCard(
  state: GameState,
  id: string,
  edition: Edition = 'base',
  level = 0,
): OfferCard | undefined {
  const card = grantedCard(id, edition);
  return card && obtainCard(state, card, level, null);
}
