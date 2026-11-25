/**
 * Choice strategies of the simulator (PLAN-objets §3.1). Each one picks a card index in an
 * offer, reading the game state with the game's own functions.
 */
import type { CardDef } from '../config/cards';
import { autoPickIndex } from '../sim/autoPick';
import { naturalAt } from '../sim/offers';
import { cardDef, offerContext } from '../sim/rewards';
import type { GameState, StoredOffer } from '../sim/state';
import { offerTags } from '../ui/offerInfo';

export type Strategy =
  /** The natural card ("fil rouge") when offered, else the first card. */
  | { kind: 'natural' }
  /** A card at random (seeded, the game's `random` pick mode). */
  | { kind: 'random' }
  /** A card never obtained in this game (the first one), else as `natural`. */
  | { kind: 'new' }
  /** Never a value card when another card is offered; among the others, as `natural`. */
  | { kind: 'minimal' }
  /** The object as soon as it is offered, else as `natural`. */
  | { kind: 'object'; card: string };

export const BASE_STRATEGIES: readonly Strategy[] = [
  { kind: 'natural' },
  { kind: 'random' },
  { kind: 'new' },
  { kind: 'minimal' },
];

export function strategyName(s: Strategy): string {
  return s.kind === 'object' ? `object:${s.card}` : s.kind;
}

/** Parse `natural`, `random`, `new`, `minimal` or `object:<cardId>`; null if unknown. */
export function parseStrategy(text: string, cards: readonly CardDef[]): Strategy | null {
  const t = text.trim();
  if (t === 'natural' || t === 'random' || t === 'new' || t === 'minimal') return { kind: t };
  if (t.startsWith('object:')) {
    const card = t.slice('object:'.length);
    return cards.some((c) => c.id === card && c.slot !== null) ? { kind: 'object', card } : null;
  }
  return null;
}

/** Index of the natural card in `cards` (indices into the offer), or -1. */
function naturalIn(state: GameState, offer: StoredOffer, indices: readonly number[]): number {
  const natural = naturalAt(offerContext(state, offer.level)).card;
  return indices.find((i) => offer.cards[i]?.card === natural) ?? -1;
}

/** Index of the card `strategy` takes in `offer` (non-empty). */
export function pickIndex(state: GameState, offer: StoredOffer, strategy: Strategy): number {
  const all = offer.cards.map((_, i) => i);
  const natural = (): number => autoPickIndex(state, offer, 'natural') ?? 0;
  switch (strategy.kind) {
    case 'natural':
      return natural();
    case 'random':
      return autoPickIndex(state, offer, 'random') ?? 0;
    case 'new': {
      const nat = naturalAt(offerContext(state, offer.level)).card;
      const i = all.find((k) => {
        const card = offer.cards[k];
        return card !== undefined && offerTags(state, card, nat).includes('new');
      });
      return i ?? natural();
    }
    case 'minimal': {
      const others = all.filter((k) => {
        const card = offer.cards[k];
        return card !== undefined && cardDef(card.card)?.effect.kind !== 'value';
      });
      if (others.length === 0) return natural();
      const n = naturalIn(state, offer, others);
      return n >= 0 ? n : (others[0] ?? 0);
    }
    case 'object': {
      const i = offer.cards.findIndex((c) => c.card === strategy.card);
      return i >= 0 ? i : natural();
    }
  }
}
