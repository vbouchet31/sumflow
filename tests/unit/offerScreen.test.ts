import { afterEach, describe, expect, it } from 'vitest';
import { CARDS } from '../../src/config/cards';
import { setLocale } from '../../src/i18n';
import { cardArt } from '../../src/render/cardArt';
import { ensureOffer, setLevel } from '../../src/sim/progression';
import { grantCard } from '../../src/sim/rewards';
import { createInitialState, type GameState, type StoredOffer } from '../../src/sim/state';
import { markSeen } from '../../src/ui/help';
import {
  canOpenOffer,
  editionEffectLines,
  givesLabel,
  OFFER_INTRO_ID,
  type OfferGate,
  OfferSeries,
  offerTags,
  offerView,
  genreLabel,
} from '../../src/ui/offerInfo';

/** A game whose level 3 is complete: its offer waits. */
/** Level 6 with its palier offer waiting. */
function withOffer(): GameState {
  const s = createInitialState(42);
  setLevel(s, 6);
  s.pendingOffers.push({ level: 6, palier: 1 });
  return s;
}

afterEach(() => setLocale('fr'));

describe('when the choice screen opens by itself (PLAN-recompenses §4.4)', () => {
  const open: OfferGate = {
    newest: 3,
    minimized: null,
    modal: false,
    gesture: false,
    catchingUp: false,
    tipPending: false,
  };

  it('opens with an offer waiting and nothing in the way', () => {
    expect(canOpenOffer(open)).toBe(true);
  });

  it('waits for dialogs, gestures, the catch-up and tutorial cards', () => {
    expect(canOpenOffer({ ...open, newest: null })).toBe(false);
    expect(canOpenOffer({ ...open, modal: true })).toBe(false);
    expect(canOpenOffer({ ...open, gesture: true })).toBe(false);
    expect(canOpenOffer({ ...open, catchingUp: true })).toBe(false);
    expect(canOpenOffer({ ...open, tipPending: true })).toBe(false);
  });

  it('a minimized offer does not come back by itself, a level completed afterwards does', () => {
    expect(canOpenOffer({ ...open, minimized: 3 })).toBe(false);
    expect(canOpenOffer({ ...open, newest: 4, minimized: 3 })).toBe(true);
  });
});

describe('position of the offer ("1 / 2")', () => {
  it('keeps its total while the offers are chosen, and restarts after the last', () => {
    const series = new OfferSeries();
    expect(series.position(3, 2)).toEqual({ index: 1, total: 2 });
    expect(series.position(3, 2)).toEqual({ index: 1, total: 2 }); // shown again
    expect(series.position(4, 1)).toEqual({ index: 2, total: 2 });
    // A level completed meanwhile joins the series.
    expect(series.position(4, 2)).toEqual({ index: 2, total: 3 });
    series.reset();
    expect(series.position(9, 1)).toEqual({ index: 1, total: 1 });
  });
});

describe('the back of a card', () => {
  it('says what each kind of card gives', () => {
    expect(givesLabel({ card: 'mult', edition: 'base' })).toBe('Débloqué sans limite');
    expect(givesLabel({ card: 'priorities', edition: 'base' })).toBe(
      'Débloqué pour toute la partie',
    );
    expect(givesLabel({ card: 'value', edition: 'base', value: 2 })).toBe(
      'Nouvelle valeur extractible',
    );
    expect(givesLabel({ card: 'concat', edition: 'base' })).toBe('Exemplaire × 1');
    expect(givesLabel({ card: 'edition-brillante', edition: 'brillante' })).toBe(
      'Carte à appliquer',
    );
    expect(givesLabel({ card: 'passive-operators', edition: 'base' })).toBe('Effet permanent');
    expect(givesLabel({ card: 'eventail', edition: 'base' })).toBe('Change les offres suivantes');
  });

  it('reads the edition effects from EDITION_EFFECTS, in the current locale', () => {
    expect(editionEffectLines({ card: 'edition-legendaire', edition: 'legendaire' })).toEqual([
      'Opérateurs : vitesse × 1,5',
      'Extracteur : débit × 1,5',
      'Stockage : capacité × 1,5',
    ]);
    expect(editionEffectLines({ card: 'concat', edition: 'brillante' })).toEqual([
      'Vitesse × 1,25',
    ]);
    expect(editionEffectLines({ card: 'concat', edition: 'base' })).toEqual([]);
    expect(editionEffectLines({ card: 'mult', edition: 'base' })).toEqual([]);
    setLocale('en');
    expect(editionEffectLines({ card: 'edition-brillante', edition: 'brillante' })[0]).toBe(
      'Operators: speed × 1.25',
    );
  });

  it('names the genre of the card', () => {
    expect(genreLabel({ card: 'concat', edition: 'base' })).toBe('Bâtiment spécial');
    expect(genreLabel({ card: 'edition-brillante', edition: 'brillante' })).toBe('Édition');
    expect(genreLabel({ card: 'passive-operators', edition: 'base' })).toBe('Passif');
    expect(genreLabel({ card: 'eventail-2', edition: 'base' })).toBe('Offres');
    setLocale('en');
    expect(genreLabel({ card: 'concat', edition: 'base' })).toBe('Special building');
  });

  it('tags new and unique cards', () => {
    const s = withOffer();
    expect(offerTags(s, { card: 'edition-brillante', edition: 'brillante' })).toEqual(['new']);
    expect(offerTags(s, { card: 'eventail', edition: 'base' })).toEqual(['new', 'unique']);
    grantCard(s, 'edition-brillante');
    expect(offerTags(s, { card: 'edition-brillante', edition: 'brillante' })).toEqual([]);
    // A special building is new once per edition.
    grantCard(s, 'concat', 'base');
    expect(offerTags(s, { card: 'concat', edition: 'base' })).toEqual([]);
    expect(offerTags(s, { card: 'concat', edition: 'legendaire' })).toEqual(['new']);
  });
});

describe('offer view', () => {
  it('shows the cards of the stored offer, the intro line until it was seen', () => {
    const s = withOffer();
    const offer = ensureOffer(s) as StoredOffer;
    const view = offerView(s, offer, { index: 1, total: 1 });
    expect(view).toMatchObject({ level: 6, palier: 1, paliers: 1 });
    expect(view.intro).toBe(true);
    expect(view.cards.map((c) => c.card)).toEqual(offer.cards);
    const legendary = offerView(
      s,
      { ...offer, cards: [{ card: 'edition-legendaire', edition: 'legendaire' }] },
      { index: 1, total: 1 },
    ).cards[0];
    expect(legendary?.name).toBe('Édition légendaire');
    expect(legendary?.genre).toBe('Édition');
    expect(legendary?.tags).toEqual(['new']);
    markSeen(s, OFFER_INTRO_ID);
    expect(offerView(s, offer, { index: 1, total: 1 }).intro).toBe(false);
  });

  it('the front of a special building shows its name, the back its edition', () => {
    const s = withOffer();
    const offer: StoredOffer = {
      level: 3,
      palier: 1,
      cards: [{ card: 'concat', edition: 'legendaire' }],
    };
    const [card] = offerView(s, offer, { index: 1, total: 1 }).cards;
    expect(card?.name).toBe('Concaténateur');
    expect(card?.fullName).toBe('Concaténateur (légendaire)');
  });
});

describe('card pictures', () => {
  it('every card of the catalogue has a picture', () => {
    for (const def of CARDS) expect(cardArt(def.icon, 'base', 2).kind).not.toBe('unknown');
  });

  it('buildings in their edition, values, chalk sticks and icons', () => {
    expect(cardArt('building:multiplier', 'base')).toEqual({
      kind: 'building',
      tool: 'multiplier',
      edition: 'base',
    });
    expect(cardArt('special:concat', 'legendaire')).toEqual({
      kind: 'building',
      tool: 'concat',
      edition: 'legendaire',
    });
    expect(cardArt('value', 'base', 11)).toEqual({ kind: 'value', value: 11 });
    expect(cardArt('edition:brillante', 'brillante')).toEqual({
      kind: 'edition',
      edition: 'brillante',
    });
    expect(cardArt('feature:priorities', 'base').kind).toBe('building');
    expect(cardArt('feature:upgrades', 'base').kind).toBe('upgrades');
    expect(cardArt('meta:eventail', 'base').kind).toBe('eventail');
    expect(cardArt('building:nope', 'base').kind).toBe('unknown');
  });
});
