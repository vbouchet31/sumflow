/**
 * Role of a card in the balance report (PLAN-objets §4):
 * - **socle**: a card of the natural sequence (`naturalSequence()`, read from LEVEL_TABLE),
 *   the game's reference path. The criteria do not apply: it is reported for information;
 * - **factice**: a placeholder object, evaluated but reported apart, out of the verdict;
 * - **objet**: every other drawable card, judged by the three criteria.
 */
import { CARDS, type CardDef } from '../config/cards';
import { naturalSequence } from '../sim/offers';
import { UNMODELED } from './config';

export type CardRole = 'socle' | 'factice' | 'objet';

/** First level of the natural sequence giving `card`, or null. */
export function naturalLevelOf(card: string): number | null {
  const i = naturalSequence().findIndex((s) => s.card === card);
  return i >= 0 ? i + 1 : null;
}

export function isSocle(card: string): boolean {
  return naturalLevelOf(card) !== null;
}

export function roleOf(card: CardDef): CardRole {
  if (isSocle(card.id)) return 'socle';
  return card.placeholder === true ? 'factice' : 'objet';
}

/** Why the cost model cannot see the effect of `card` (`UNMODELED`), or null. */
export function unmodeledReason(card: string): string | null {
  return UNMODELED[card] ?? null;
}

/** Drawable cards (they can have `object:<id>` and `once:<id>` strategies). */
export function drawableCards(cards: readonly CardDef[] = CARDS): CardDef[] {
  return cards.filter((c) => c.slot !== null);
}

/** Drawable cards judged by the criteria (objects and placeholders, not the socle). */
export function judgedCards(cards: readonly CardDef[] = CARDS): CardDef[] {
  return drawableCards(cards).filter((c) => !isSocle(c.id));
}
