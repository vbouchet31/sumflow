import { afterEach, describe, expect, it } from 'vitest';
import { CARDS } from '../../src/config/cards';
import { setLocale } from '../../src/i18n';
import { cardArt } from '../../src/render/cardArt';
import { completeLevel, ensureOffer } from '../../src/sim/progression';
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
  slotLabel,
} from '../../src/ui/offerInfo';

/** A game whose level 3 is complete: its offer waits. */
function withOffer(): GameState {
  const s = createInitialState(42);
  completeLevel(s);
  completeLevel(s);
  completeLevel(s);
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
    expect(givesLabel({ card: 'ancient-adder', edition: 'base' })).toBe('Exemplaire × 1');
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
    expect(editionEffectLines({ card: 'ancient-adder', edition: 'brillante' })).toEqual([
      'Vitesse × 1,25',
    ]);
    expect(editionEffectLines({ card: 'ancient-adder', edition: 'base' })).toEqual([]);
    expect(editionEffectLines({ card: 'mult', edition: 'base' })).toEqual([]);
    setLocale('en');
    expect(editionEffectLines({ card: 'edition-brillante', edition: 'brillante' })[0]).toBe(
      'Operators: speed × 1.25',
    );
  });

  it('names the slot: Joker for the third card, else the slot of the catalogue', () => {
    expect(slotLabel('nombres', { card: 'value', edition: 'base' })).toBe('Nombres');
    expect(slotLabel('joker', { card: 'value', edition: 'base' })).toBe('Joker');
    // An empty Atelier slot draws from Nombres: the card keeps its own slot.
    expect(slotLabel('atelier', { card: 'mult', edition: 'base' })).toBe('Nombres');
    expect(slotLabel(undefined, { card: 'bridge', edition: 'base' })).toBe('Atelier');
  });

  it('tags new, unique and classic-path cards', () => {
    const s = withOffer();
    expect(offerTags(s, { card: 'value', edition: 'base' }, 'value')).toEqual(['new', 'natural']);
    expect(offerTags(s, { card: 'eventail', edition: 'base' }, 'value')).toEqual(['new', 'unique']);
    grantCard(s, 'value');
    expect(offerTags(s, { card: 'value', edition: 'base' }, 'bridge')).toEqual([]);
    // A special building is new once per edition.
    grantCard(s, 'ancient-adder', 'base');
    expect(offerTags(s, { card: 'ancient-adder', edition: 'base' }, 'x')).toEqual([]);
    expect(offerTags(s, { card: 'ancient-adder', edition: 'legendaire' }, 'x')).toEqual(['new']);
  });
});

describe('offer view', () => {
  it('shows the cards of the stored offer, the intro line until it was seen', () => {
    const s = withOffer();
    const offer = ensureOffer(s) as StoredOffer;
    const view = offerView(s, offer, { index: 1, total: 1 });
    expect(view.level).toBe(3);
    expect(view.intro).toBe(true);
    expect(view.cards.map((c) => c.card)).toEqual(offer.cards);
    const value = view.cards.find((c) => c.card.card === 'value');
    expect(value?.name).toBe('Valeur 2');
    expect(value?.text).toBe('Les gisements de 2 deviennent extractibles.');
    expect(value?.tags).toContain('natural');
    markSeen(s, OFFER_INTRO_ID);
    expect(offerView(s, offer, { index: 1, total: 1 }).intro).toBe(false);
  });

  it('the front of a special building shows its name, the back its edition', () => {
    const s = withOffer();
    const offer: StoredOffer = {
      level: 3,
      cards: [{ card: 'ancient-adder', edition: 'legendaire' }],
    };
    const [card] = offerView(s, offer, { index: 1, total: 1 }).cards;
    expect(card?.name).toBe('Additionneur ancien');
    expect(card?.fullName).toBe('Additionneur ancien (légendaire)');
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
    expect(cardArt('special:ancientAdder', 'legendaire')).toEqual({
      kind: 'building',
      tool: 'ancientAdder',
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
