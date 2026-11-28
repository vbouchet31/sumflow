import { describe, expect, it } from 'vitest';
import {
  CARDS,
  type CardDef,
  EDITION_EFFECTS,
  EDITION_RULES,
  GUARDS,
  OFFERS,
  SPECIAL_EDITION_ODDS,
} from '../../src/config/cards';
import { MESSAGES } from '../../src/i18n';
import { curveAt, validateCatalogue } from '../../src/sim/offers';

function card(id: string): CardDef {
  const c = CARDS.find((x) => x.id === id);
  if (!c) throw new Error(`unknown card ${id}`);
  return c;
}

describe('card catalogue', () => {
  it('is valid', () => {
    expect(validateCatalogue(CARDS)).toEqual([]);
  });

  it('has the prerequisites of the plan', () => {
    const requires = Object.fromEntries(CARDS.map((c) => [c.id, c.requires ?? []]));
    expect(requires).toEqual({
      value: [],
      adder: [],
      upgrades: [],
      bridge: [],
      mult: [{ building: 'adder' }],
      priorities: [{ building: 'bridge' }],
      sub: [{ building: 'multiplier' }],
      div: [{ building: 'subtractor' }],
      exp: [{ building: 'multiplier' }],
      storage: [{ level: 12 }],
      'edition-brillante': [],
      'edition-legendaire': [],
      concat: [{ building: 'multiplier' }],
      eventail: [],
      'eventail-2': [{ card: 'eventail' }],
    });
  });

  it('the socle is never drawn; objects have the starting weights of the plan', () => {
    const at = (id: string, level: number): number => curveAt(card(id).weight, level);
    // PLAN-paliers §3.6: every fil rouge card is given by its level, never drawn.
    for (const id of ['value', 'adder', 'upgrades', 'mult', 'sub', 'div', 'exp'])
      expect(card(id)).toMatchObject({ drawable: false, weight: [] });
    for (const id of ['bridge', 'priorities', 'storage'])
      expect(card(id)).toMatchObject({ drawable: false, weight: [] });
    expect(at('edition-brillante', 30)).toBe(6);
    expect(at('edition-legendaire', 30)).toBe(2);
    // Concaténateur (docs/objets/concat.md): from level 8, 2 → 5 → 5 → 3.
    expect(card('concat')).toMatchObject({ drawable: true, minLevel: 8 });
    expect([8, 10, 12, 20, 25, 30, 60].map((L) => at('concat', L))).toEqual([
      2, 3.5, 5, 5, 4, 3, 3,
    ]);
    // Éventail I and II (PLAN-paliers §3.5): frequent, with a safety net of 4 offers.
    expect(at('eventail', 30)).toBe(8);
    expect(card('eventail')).toMatchObject({ minLevel: 6, maxPicks: 1, pity: 4 });
    expect(at('eventail-2', 30)).toBe(6);
    expect(card('eventail-2')).toMatchObject({ minLevel: 12, maxPicks: 1, pity: 4 });
    expect(card('eventail-2').effect).toEqual(card('eventail').effect);
    expect(card('concat').placeholder).toBeUndefined();
    // The placeholder passive was removed (PLAN-paliers, P6): no placeholder left.
    expect(CARDS.some((c) => c.placeholder)).toBe(false);
  });

  it('has every card kind and texts in every locale', () => {
    const kinds = new Set(CARDS.map((c) => c.effect.kind));
    expect([...kinds].sort()).toEqual(
      ['edition', 'feature', 'meta', 'special', 'unlock', 'value'].sort(),
    );
    for (const c of CARDS) {
      for (const messages of Object.values(MESSAGES)) {
        expect(messages[c.title]).toBeTruthy();
        expect(messages[c.text]).toBeTruthy();
      }
    }
  });

  it('keeps the offer and edition settings of the plan', () => {
    expect(OFFERS).toEqual({ baseCards: 2, maxCards: 4, maxPerGenre: 1 });
    expect(SPECIAL_EDITION_ODDS).toEqual({ base: 85, brillante: 10, legendaire: 5 });
    expect(EDITION_RULES).toEqual({ returnOnDemolish: true, removable: true });
    expect(EDITION_EFFECTS.multiplier).toEqual({
      brillante: { speed: 1.25 },
      legendaire: { speed: 1.5 },
    });
    expect(EDITION_EFFECTS.extractor?.legendaire).toEqual({ rate: 1.5 });
    expect(EDITION_EFFECTS.storage?.brillante).toEqual({ capacity: 1.25 });
    expect(GUARDS).toEqual([]);
  });
});

describe('validateCatalogue', () => {
  const mult = card('mult');
  /** A drawable object to derive broken cards from. */
  const value = card('edition-brillante');

  it('rejects duplicate ids and unknown prerequisites', () => {
    expect(validateCatalogue([...CARDS, mult])).toContain('mult: duplicate id');
    const broken = { ...mult, id: 'x', requires: [{ card: 'nope' }] };
    expect(validateCatalogue([...CARDS, broken])).toContain('x: unknown card nope');
    const noFeature = CARDS.filter((c) => c.id !== 'priorities');
    const needs = { ...mult, id: 'y', requires: [{ feature: 'priorities' as const }] };
    expect(validateCatalogue([...noFeature, needs])).toContain(
      'y: no card unlocks feature priorities',
    );
  });

  it('rejects dependency cycles', () => {
    const a: CardDef = { ...value, id: 'a', requires: [{ card: 'b' }] };
    const b: CardDef = { ...value, id: 'b', requires: [{ card: 'a' }] };
    expect(validateCatalogue([...CARDS, a, b]).some((e) => e.startsWith('dependency cycle'))).toBe(
      true,
    );
    // − needs ×, so × needing − loops.
    const loop = CARDS.map((c) =>
      c.id === 'mult' ? { ...c, requires: [{ building: 'subtractor' as const }] } : c,
    );
    expect(validateCatalogue(loop).some((e) => e.startsWith('dependency cycle'))).toBe(true);
  });

  it('rejects bad weights, ordinary specials and edition cards without edition', () => {
    const neg = { ...value, id: 'n', weight: [{ level: 1, w: -1 }] };
    expect(validateCatalogue([...CARDS, neg])).toContain('n: negative weight');
    const unordered = {
      ...value,
      id: 'u',
      weight: [
        { level: 5, w: 1 },
        { level: 3, w: 1 },
      ],
    };
    expect(validateCatalogue([...CARDS, unordered])).toContain('u: curve levels not increasing');
    const empty = { ...value, id: 'e', weight: [] };
    expect(validateCatalogue([...CARDS, empty])).toContain('e: drawable without weight');
    const special = {
      ...value,
      id: 's',
      effect: { kind: 'special', building: 'multiplier', count: 1 },
    } as unknown as CardDef;
    expect(validateCatalogue([...CARDS, special])).toContain(
      's: special card for ordinary building',
    );
    const edition = {
      ...value,
      id: 'd',
      effect: { kind: 'edition', edition: 'base' },
    } as unknown as CardDef;
    expect(validateCatalogue([...CARDS, edition])).toContain('d: edition card without edition');
    const unique = { ...value, id: 'm', maxPicks: 0 };
    expect(validateCatalogue([...CARDS, unique])).toContain('m: bad maxPicks');
    const pity = { ...value, id: 'p', pity: 0 };
    expect(validateCatalogue([...CARDS, pity])).toContain('p: bad pity');
  });

  it('refuses a drawable fil rouge card', () => {
    const drawn = CARDS.map((c) => (c.id === 'mult' ? { ...c, drawable: true } : c));
    expect(validateCatalogue(drawn)).toContain('mult: fil rouge card must not be drawable');
  });

  it('needs a card for every LEVEL_TABLE reward', () => {
    const errors = validateCatalogue(CARDS.filter((c) => c.id !== 'bridge'));
    expect(errors.some((e) => e.includes('no card for level reward'))).toBe(true);
  });
});
