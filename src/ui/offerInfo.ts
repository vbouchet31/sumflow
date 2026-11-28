/**
 * What the choice screen shows about an offer (PLAN-recompenses §4.2, §4.4), computed from
 * the game state without touching the DOM: card names, the back of each card, its tags, the
 * "1 / 3" position, and when the screen may open by itself.
 */
import { EDITION_EFFECTS, type EditionEffect } from '../config/cards';
import { getLocale, type MessageKey, t } from '../i18n';
import { paliersFor } from '../sim/levels';
import type { OfferCard } from '../sim/offers';
import { cardDef } from '../sim/rewards';
import type { GameState, StoredOffer } from '../sim/state';
import { cardLabel, cardParams } from './labels';

/** `helpSeen` id of the line "You keep this choice for the whole game", shown once. */
export const OFFER_INTRO_ID = 'offer-intro';

/** Tags on the back of a card. */
export type OfferTag = 'new' | 'unique';

export interface OfferCardView {
  card: OfferCard;
  /** Icon id of the catalogue (`kind:name`). */
  icon: string;
  /** Name on the front: the picture already shows the edition. */
  name: string;
  /** Name with its edition, on the back. */
  fullName: string;
  /** Genre of the card (special building, edition, passive…), first line of the back. */
  genre: string;
  /** What the card gives: unlocked without limit, copies × N, a card to apply… */
  gives: string;
  /** Edition effects, one line each (empty for a base object). */
  effects: string[];
  text: string;
  tags: OfferTag[];
}

export interface OfferView {
  level: number;
  /** Palier of the offer (1-based) and the number of paliers of its level (PLAN-paliers §4.2). */
  palier: number;
  paliers: number;
  /** Position of this offer among those waiting (1-based), and their number. */
  index: number;
  total: number;
  /** Show the line "You keep this choice for the whole game" (first screen only). */
  intro: boolean;
  cards: OfferCardView[];
}

const EFFECT_KEYS = ['speed', 'rate', 'capacity'] as const satisfies (keyof EditionEffect)[];
const GROUP_KEY: Record<(typeof EFFECT_KEYS)[number], MessageKey> = {
  speed: 'offer.effect.speed',
  rate: 'offer.effect.rate',
  capacity: 'offer.effect.capacity',
};
const OWN_KEY: Record<(typeof EFFECT_KEYS)[number], MessageKey> = {
  speed: 'offer.effect.ownSpeed',
  rate: 'offer.effect.ownRate',
  capacity: 'offer.effect.ownCapacity',
};

/** A multiplier in the current locale: 1.5 → "1,5" in French. */
function factor(x: number): string {
  return x.toLocaleString(getLocale(), { maximumFractionDigits: 2 });
}

/**
 * Effects of the edition of `card`, read from EDITION_EFFECTS. An edition card lists what
 * it does on each kind of building ("Operators: speed × 1.5"); a special building lists the
 * effect of its native edition on itself ("Speed × 1.5"). Nothing for a base object.
 */
export function editionEffectLines(card: OfferCard): string[] {
  const e = cardDef(card.card)?.effect;
  if (e?.kind === 'edition') {
    const lines: string[] = [];
    for (const key of EFFECT_KEYS) {
      const values = new Set<number>();
      for (const byEdition of Object.values(EDITION_EFFECTS)) {
        const v = byEdition?.[e.edition][key];
        if (v !== undefined) values.add(v);
      }
      if (values.size > 0)
        lines.push(t(GROUP_KEY[key], { x: [...values].map(factor).join(' / ') }));
    }
    return lines;
  }
  if (e?.kind === 'special' && card.edition !== 'base') {
    const own = EDITION_EFFECTS[e.building]?.[card.edition] ?? {};
    return EFFECT_KEYS.flatMap((key) => {
      const v = own[key];
      return v === undefined ? [] : [t(OWN_KEY[key], { x: factor(v) })];
    });
  }
  return [];
}

/** What a card gives, in a few words. */
export function givesLabel(card: OfferCard): string {
  const e = cardDef(card.card)?.effect;
  switch (e?.kind) {
    case 'unlock':
      return t('offer.gives.unlock');
    case 'feature':
      return t('offer.gives.feature');
    case 'value':
      return t('offer.gives.value');
    case 'special':
      return t('offer.gives.special', { n: e.count });
    case 'edition':
      return t('offer.gives.edition');
    case 'passive':
      return t('offer.gives.passive');
    case 'meta':
      return t('offer.gives.meta');
    default:
      return '';
  }
}

/**
 * Tags of `card`: new (never obtained in this game; a special building counts by edition) and
 * unique (`maxPicks: 1`).
 */
export function offerTags(state: GameState, card: OfferCard): OfferTag[] {
  const def = cardDef(card.card);
  const special = def?.effect.kind === 'special';
  const tags: OfferTag[] = [];
  const owned = state.picks.some(
    (p) => p.card === card.card && (!special || p.edition === card.edition),
  );
  if (!owned) tags.push('new');
  if (def?.maxPicks === 1) tags.push('unique');
  return tags;
}

/** Genre name on the back of a card: the kind of its effect. */
export function genreLabel(card: OfferCard): string {
  const kind = cardDef(card.card)?.effect.kind;
  return kind ? t(`offer.genre.${kind}`) : '';
}

/** Everything the screen shows for `offer`, the first pending one. */
export function offerView(
  state: GameState,
  offer: StoredOffer,
  position: { index: number; total: number },
): OfferView {
  const cards = offer.cards.map((card): OfferCardView => {
    const def = cardDef(card.card);
    const params = def ? cardParams(def, card.value) : {};
    return {
      card,
      icon: def?.icon ?? '',
      name: def ? t(def.title, params) : card.card,
      fullName: cardLabel(card),
      genre: genreLabel(card),
      gives: givesLabel(card),
      effects: editionEffectLines(card),
      text: def ? t(def.text, params) : '',
      tags: offerTags(state, card),
    };
  });
  return {
    level: offer.level,
    palier: offer.palier,
    paliers: Math.max(offer.palier, paliersFor(offer.level).length),
    index: position.index,
    total: position.total,
    intro: !state.helpSeen.includes(OFFER_INTRO_ID),
    cards,
  };
}

/**
 * Position of the offers shown one after the other ("1 / 3"): the levels shown in this
 * series, so the count keeps its total while offers are chosen. A series ends when no offer
 * is left.
 */
export class OfferSeries {
  private readonly shown: number[] = [];

  /** Position of the offer of `level`, with `pending` offers waiting (this one included). */
  position(level: number, pending: number): { index: number; total: number } {
    if (!this.shown.includes(level)) this.shown.push(level);
    const before = this.shown.indexOf(level);
    return { index: before + 1, total: before + pending };
  }

  reset(): void {
    this.shown.length = 0;
  }
}

/** What decides whether the choice screen may open by itself (§4.4). */
export interface OfferGate {
  /** Level of the newest offer waiting, or null when none waits. */
  newest: number | null;
  /**
   * Newest waiting level when the player closed the screen with "See the map": those offers
   * wait for the badge; a level completed afterwards opens the screen again.
   */
  minimized: number | null;
  /** A dialog is open: menu, tutorial card, end screen, marker editor. */
  modal: boolean;
  /** A press is in progress on the map (belt, zone, paste, move, pan). */
  gesture: boolean;
  /** Missed time is being simulated. */
  catchingUp: boolean;
  /** A tutorial card waits: cards first, then the next offer. */
  tipPending: boolean;
}

export function canOpenOffer(g: OfferGate): boolean {
  return (
    g.newest !== null &&
    g.newest !== g.minimized &&
    !g.modal &&
    !g.gesture &&
    !g.catchingUp &&
    !g.tipPending
  );
}
