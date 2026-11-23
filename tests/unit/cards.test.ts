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
      'ancient-adder': [],
      'passive-operators': [],
      eventail: [],
    });
  });

  it('has the slots and starting weights of the plan', () => {
    const at = (id: string, level: number): number => curveAt(card(id).weight, level);
    expect(card('adder').slot).toBeNull();
    expect(card('upgrades').slot).toBeNull();
    expect(at('value', 3)).toBe(20);
    for (const [id, L, slot] of [
      ['bridge', 4, 'atelier'],
      ['mult', 7, 'nombres'],
      ['priorities', 10, 'atelier'],
      ['sub', 13, 'nombres'],
      ['div', 16, 'nombres'],
      ['exp', 19, 'nombres'],
      ['storage', 22, 'atelier'],
    ] as const) {
      expect(card(id).slot).toBe(slot);
      expect(card(id).weight).toEqual([
        { level: L - 4, w: 2 },
        { level: L, w: 20 },
        { level: L + 6, w: 8 },
      ]);
    }
    expect(at('edition-brillante', 30)).toBe(6);
    expect(at('edition-legendaire', 30)).toBe(2);
    expect(at('ancient-adder', 30)).toBe(4);
    expect(at('passive-operators', 30)).toBe(3);
    expect(at('eventail', 30)).toBe(3);
    expect(card('eventail')).toMatchObject({ minLevel: 6, maxPicks: 1 });
    expect(card('ancient-adder').placeholder).toBe(true);
    expect(card('passive-operators').placeholder).toBe(true);
  });

  it('has every card kind and texts in every locale', () => {
    const kinds = new Set(CARDS.map((c) => c.effect.kind));
    expect([...kinds].sort()).toEqual(
      ['edition', 'feature', 'meta', 'passive', 'special', 'unlock', 'value'].sort(),
    );
    for (const c of CARDS) {
      for (const messages of Object.values(MESSAGES)) {
        expect(messages[c.title]).toBeTruthy();
        expect(messages[c.text]).toBeTruthy();
      }
    }
  });

  it('keeps the offer and edition settings of the plan', () => {
    expect(OFFERS.fixedUntil).toBe(2);
    expect(OFFERS.slots).toEqual(['nombres', 'atelier']);
    expect(OFFERS.naturalRefusalDecay).toBe(0.7);
    expect(SPECIAL_EDITION_ODDS).toEqual({ base: 85, brillante: 10, legendaire: 5 });
    expect(EDITION_RULES).toEqual({ returnOnDemolish: true, removable: true });
    expect(EDITION_EFFECTS.multiplier).toEqual({
      brillante: { speed: 1.25 },
      legendaire: { speed: 1.5 },
    });
    expect(EDITION_EFFECTS.extractor?.legendaire).toEqual({ rate: 1.5 });
    expect(EDITION_EFFECTS.storage?.brillante).toEqual({ capacity: 1.25 });
    expect(GUARDS.every((g) => g.placeholder)).toBe(true);
  });
});

describe('validateCatalogue', () => {
  const mult = card('mult');
  const value = card('value');

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
  });

  it('needs a card for every LEVEL_TABLE reward', () => {
    const errors = validateCatalogue(CARDS.filter((c) => c.id !== 'bridge'));
    expect(errors.some((e) => e.includes('no card for level reward'))).toBe(true);
  });
});
