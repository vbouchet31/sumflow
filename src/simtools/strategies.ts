/**
 * Choice strategies of the simulator (PLAN-paliers §5.2). Each one picks a card index in a
 * palier offer, or none, reading the game state with the game's own functions. Every level
 * gives its fil rouge card whatever the strategy: only the objects differ.
 */
import { CARDS, type CardDef } from '../config/cards';
import { autoPickIndex } from '../sim/autoPick';
import type { GameState, StoredOffer } from '../sim/state';
import { offerTags } from '../ui/offerInfo';

export type Strategy =
  /** The reference: no object at all (only the simulator may leave an offer). */
  | { kind: 'none' }
  /** A card at random (seeded, the game's `random` pick mode). */
  | { kind: 'random' }
  /** A card never obtained in this game (the first one), else at random. */
  | { kind: 'new' }
  /** The object every time it is offered, nothing else (criteria 1, 3 and 4). */
  | { kind: 'object'; card: string }
  /** The object the first time it is offered, nothing else (criterion 2: is it worth it). */
  | { kind: 'once'; card: string };

/** The strategy every index is measured against. */
export const REFERENCE: Strategy = { kind: 'none' };

export const BASE_STRATEGIES: readonly Strategy[] = [
  { kind: 'none' },
  { kind: 'random' },
  { kind: 'new' },
];

export function strategyName(s: Strategy): string {
  return s.kind === 'object' || s.kind === 'once' ? `${s.kind}:${s.card}` : s.kind;
}

/** Parse `none`, `random`, `new`, `object:<cardId>` or `once:<cardId>`. */
export function parseStrategy(text: string, cards: readonly CardDef[]): Strategy | null {
  const t = text.trim();
  if (t === 'none' || t === 'random' || t === 'new') return { kind: t };
  for (const kind of ['object', 'once'] as const) {
    if (!t.startsWith(`${kind}:`)) continue;
    const card = t.slice(kind.length + 1);
    return cards.some((c) => c.id === card && c.drawable) ? { kind, card } : null;
  }
  return null;
}

/** Cards `card` requires, directly or through them (`requires: [{ card }]`). */
export function cardPrerequisites(card: string, cards: readonly CardDef[] = CARDS): string[] {
  const out: string[] = [];
  const visit = (id: string): void => {
    for (const p of cards.find((c) => c.id === id)?.requires ?? []) {
      if (!('card' in p) || out.includes(p.card)) continue;
      out.push(p.card);
      visit(p.card);
    }
  };
  visit(card);
  return out;
}

/** Index of `card` in `offer`, else of a card it still needs (Éventail I for II), or -1. */
function targetIndex(state: GameState, offer: StoredOffer, card: string): number {
  const i = offer.cards.findIndex((c) => c.card === card);
  if (i >= 0) return i;
  const needed = cardPrerequisites(card).filter((id) => !state.picks.some((p) => p.card === id));
  return offer.cards.findIndex((c) => needed.includes(c.card));
}

/**
 * Index of the card `strategy` takes in `offer`, or null to take nothing. `object` and `once`
 * take nothing else (but the cards their object requires), so their index measures that
 * object alone against `none`.
 */
export function pickIndex(state: GameState, offer: StoredOffer, strategy: Strategy): number | null {
  if (offer.cards.length === 0) return null;
  const random = (): number => autoPickIndex(state, offer, 'random') ?? 0;
  switch (strategy.kind) {
    case 'none':
      return null;
    case 'random':
      return random();
    case 'new': {
      const i = offer.cards.findIndex((c) => offerTags(state, c).includes('new'));
      return i >= 0 ? i : random();
    }
    case 'object': {
      const i = targetIndex(state, offer, strategy.card);
      return i >= 0 ? i : null;
    }
    case 'once': {
      if (state.picks.some((p) => p.card === strategy.card)) return null;
      const i = targetIndex(state, offer, strategy.card);
      return i >= 0 ? i : null;
    }
  }
}
