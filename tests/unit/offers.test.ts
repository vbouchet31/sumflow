import { describe, expect, it } from 'vitest';
import {
  LEVEL_TABLE,
  type Reward,
  START_BUILDINGS,
  START_MAX_EXTRACTION,
} from '../../src/config/balance';
import { CARDS, type CardDef, type Edition, OFFERS } from '../../src/config/cards';
import { mulberry32 } from '../../src/core/rng';
import {
  type Catalogue,
  cardWeight,
  curveAt,
  DEFAULT_CATALOGUE,
  drawOffer,
  drawSpecialEdition,
  fixedReward,
  isAvailable,
  isFixedLevel,
  naturalAt,
  naturalSequence,
  nextValue,
  type OfferContext,
  offerSlots,
} from '../../src/sim/offers';

type Ctx = {
  -readonly [K in keyof OfferContext]: OfferContext[K] extends readonly (infer T)[]
    ? T[]
    : OfferContext[K];
};

/** The fixed reward of level `n` before reward cards: the table, then Extraction n − 7. */
function legacyReward(n: number): Reward {
  return LEVEL_TABLE[n - 1]?.reward ?? { kind: 'extraction', max: n - 7 };
}

function card(id: string): CardDef {
  const c = CARDS.find((x) => x.id === id);
  if (!c) throw new Error(`unknown card ${id}`);
  return c;
}

/** Context of a game that took the natural reward of levels 1 and 2. */
function ctxAt(level: number, over: Partial<Ctx> = {}): Ctx {
  return {
    seed: 42,
    level,
    maxExtraction: START_MAX_EXTRACTION,
    unlockedBuildings: [...START_BUILDINGS, 'adder'],
    unlockedFeatures: ['upgrades'],
    picks: {},
    naturalRefusals: 0,
    ...over,
  };
}

/** Apply a card's effect to a test context (R2 does this on the game state). */
function apply(ctx: Ctx, id: string): void {
  const e = card(id).effect;
  ctx.picks = { ...ctx.picks, [id]: (ctx.picks[id] ?? 0) + 1 };
  if (e.kind === 'value') ctx.maxExtraction = nextValue(ctx.maxExtraction);
  if (e.kind === 'unlock') ctx.unlockedBuildings.push(e.building);
  if (e.kind === 'feature') ctx.unlockedFeatures.push(e.feature);
}

/** Catalogue with some cards changed. */
function tweak(change: (c: CardDef) => CardDef): Catalogue {
  return { ...DEFAULT_CATALOGUE, cards: CARDS.map(change) };
}

describe('curves and values', () => {
  it('interpolates linearly and clamps to the first and last points', () => {
    expect(curveAt(OFFERS.natural, 1)).toBe(50);
    expect(curveAt(OFFERS.natural, 3)).toBe(50);
    expect(curveAt(OFFERS.natural, 11.5)).toBe(37.5);
    expect(curveAt(OFFERS.natural, 20)).toBe(25);
    expect(curveAt(OFFERS.natural, 30)).toBe(20);
    expect(curveAt(OFFERS.natural, 400)).toBe(15);
    expect(curveAt([], 5)).toBe(0);
    const mult = card('mult').weight;
    expect([1, 3, 5, 7, 10, 13, 50].map((l) => curveAt(mult, l))).toEqual([2, 2, 11, 20, 14, 8, 8]);
  });

  it('next value skips the forbidden 10', () => {
    expect(nextValue(1)).toBe(2);
    expect(nextValue(8)).toBe(9);
    expect(nextValue(9)).toBe(11);
    expect(nextValue(11)).toBe(12);
  });

  it('levels 1 and 2 are fixed: adder, then upgrades', () => {
    expect([0, 1, 2, 3].map(isFixedLevel)).toEqual([false, true, true, false]);
    expect(fixedReward(1)).toEqual({ card: 'adder' });
    expect(fixedReward(2)).toEqual({ card: 'upgrades' });
    expect(fixedReward(3)).toBeNull();
  });
});

describe('natural sequence', () => {
  it('follows LEVEL_TABLE, values 2..9 then 11..23', () => {
    const seq = naturalSequence();
    expect(seq).toHaveLength(30);
    seq.forEach((step, i) => {
      const reward = legacyReward(i + 1);
      if (reward?.kind === 'extraction') expect(step).toEqual({ card: 'value', value: reward.max });
      if (reward?.kind === 'building')
        expect(card(step.card).effect).toEqual({ kind: 'unlock', building: reward.building });
      if (reward?.kind === 'feature')
        expect(card(step.card).effect).toEqual({ kind: 'feature', feature: reward.feature });
    });
    expect(seq.map((s) => s.card).slice(0, 7)).toEqual([
      'adder',
      'upgrades',
      'value',
      'bridge',
      'value',
      'value',
      'mult',
    ]);
    expect(seq.flatMap((s) => (s.value === undefined ? [] : [s.value]))).toEqual([
      2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
    ]);
  });

  it('taking the natural card at every level reproduces the current unlock order', () => {
    const ctx = ctxAt(1, { unlockedBuildings: [...START_BUILDINGS], unlockedFeatures: [] });
    for (let n = 1; n <= 80; n++) {
      ctx.level = n;
      const step = naturalAt(ctx);
      const reward = legacyReward(n);
      const effect = card(step.card).effect;
      if (reward?.kind === 'extraction') {
        expect(effect.kind).toBe('value');
        expect(step.value).toBe(reward.max);
        expect(nextValue(ctx.maxExtraction)).toBe(reward.max);
      } else if (reward?.kind === 'building') {
        expect(effect).toEqual({ kind: 'unlock', building: reward.building });
      } else if (reward?.kind === 'feature') {
        expect(effect).toEqual({ kind: 'feature', feature: reward.feature });
      }
      if (!isFixedLevel(n)) {
        expect(isAvailable(card(step.card), ctx)).toBe(true);
        expect(cardWeight(card(step.card), ctx)).toBeGreaterThanOrEqual(curveAt(OFFERS.natural, n));
      }
      apply(ctx, step.card);
    }
    expect(ctx.maxExtraction).toBe(80 - 7);
  });

  it('a refused value comes back as the natural card', () => {
    const ctx = ctxAt(5, { unlockedBuildings: [...START_BUILDINGS, 'adder', 'bridge'] });
    expect(naturalAt(ctx)).toEqual({ card: 'value', value: 2 });
    ctx.maxExtraction = 2;
    expect(naturalAt(ctx)).toEqual({ card: 'value', value: 3 });
  });

  it('the natural weight decays with refusals, never below the card curve', () => {
    const value = card('value');
    const weights = [0, 1, 2, 3, 10].map((r) =>
      cardWeight(value, ctxAt(3, { naturalRefusals: r })),
    );
    expect(weights[0]).toBe(50);
    expect(weights[1]).toBeCloseTo(35);
    expect(weights[2]).toBeCloseTo(24.5);
    expect(weights[3]).toBe(20);
    expect(weights[4]).toBe(20);
    // Not the natural card: plain curve.
    expect(cardWeight(card('bridge'), ctxAt(3))).toBe(curveAt(card('bridge').weight, 3));
  });
});

describe('availability', () => {
  it('respects prerequisites: no − before ×, no ÷ before −, no Priorités before Pont', () => {
    const base = ctxAt(8);
    expect(isAvailable(card('mult'), base)).toBe(true);
    for (const id of ['sub', 'div', 'exp', 'priorities'])
      expect(isAvailable(card(id), base)).toBe(false);
    const withMult = ctxAt(8, { unlockedBuildings: [...START_BUILDINGS, 'adder', 'multiplier'] });
    expect(isAvailable(card('mult'), withMult)).toBe(false);
    expect(isAvailable(card('sub'), withMult)).toBe(true);
    expect(isAvailable(card('exp'), withMult)).toBe(true);
    expect(isAvailable(card('div'), withMult)).toBe(false);
    const withBridge = ctxAt(8, { unlockedBuildings: [...START_BUILDINGS, 'adder', 'bridge'] });
    expect(isAvailable(card('priorities'), withBridge)).toBe(true);
    expect(isAvailable(card('bridge'), withBridge)).toBe(false);
  });

  it('storage needs level 12, adder and upgrades are never drawn', () => {
    expect(isAvailable(card('storage'), ctxAt(11))).toBe(false);
    expect(isAvailable(card('storage'), ctxAt(12))).toBe(true);
    const fresh = ctxAt(3, { unlockedBuildings: [...START_BUILDINGS], unlockedFeatures: [] });
    expect(isAvailable(card('adder'), fresh)).toBe(false);
    expect(isAvailable(card('upgrades'), fresh)).toBe(false);
  });

  it('Éventail: from level 6, at most once', () => {
    const fan = card('eventail');
    expect(isAvailable(fan, ctxAt(5))).toBe(false);
    expect(isAvailable(fan, ctxAt(6))).toBe(true);
    expect(isAvailable(fan, ctxAt(9, { picks: { eventail: 1 } }))).toBe(false);
    for (let seed = 0; seed < 300; seed++) {
      const offer = drawOffer(ctxAt(9, { seed, picks: { eventail: 1 } }));
      expect(offer.cards.map((c) => c.card)).not.toContain('eventail');
    }
  });

  it('values come one by one: never 3 before 2', () => {
    for (let seed = 0; seed < 300; seed++) {
      for (const c of drawOffer(ctxAt(4, { seed })).cards) {
        if (c.card === 'value') expect(c.value).toBe(2);
      }
    }
    let elevens = 0;
    for (let seed = 0; seed < 300; seed++) {
      for (const c of drawOffer(ctxAt(15, { seed, maxExtraction: 9 })).cards) {
        if (c.card !== 'value') continue;
        expect(c.value).toBe(11);
        elevens += 1;
      }
    }
    expect(elevens).toBeGreaterThan(0);
  });
});

describe('drawOffer', () => {
  it('is deterministic and depends on the seed', () => {
    const ctx = ctxAt(9, { maxExtraction: 5, picks: { eventail: 1 } });
    expect(drawOffer(ctx)).toEqual(drawOffer({ ...ctx }));
    const seen = new Set<string>();
    for (let seed = 0; seed < 50; seed++)
      seen.add(JSON.stringify(drawOffer({ ...ctx, seed }).cards));
    expect(seen.size).toBeGreaterThan(5);
  });

  it('draws Nombres then Atelier, plus Joker with Éventail, without duplicates', () => {
    expect(offerSlots(ctxAt(8))).toEqual(['nombres', 'atelier']);
    expect(offerSlots(ctxAt(8, { picks: { eventail: 1 } }))).toEqual([
      'nombres',
      'atelier',
      'joker',
    ]);
    for (let seed = 0; seed < 500; seed++) {
      for (const level of [3, 8, 14, 25, 60]) {
        const ctx = ctxAt(level, { seed, maxExtraction: 4, picks: { eventail: 1 } });
        const offer = drawOffer(ctx);
        expect(offer.cards).toHaveLength(3);
        expect(new Set(offer.cards.map((c) => c.card)).size).toBe(3);
        const [nombres, atelier] = offer.cards;
        expect(card(nombres?.card ?? '').slot).toBe('nombres');
        expect(card(atelier?.card ?? '').slot).toBe('atelier');
        expect(drawOffer({ ...ctx, picks: {} }).cards).toHaveLength(2);
      }
    }
  });

  it('draws each card in proportion to its weight', () => {
    const ctx = ctxAt(8, {
      maxExtraction: 4,
      unlockedBuildings: [...START_BUILDINGS, 'adder', 'bridge'],
    });
    const reference = drawOffer(ctx);
    const N = 20_000;
    for (const slotIndex of [0, 1]) {
      const weights = reference.slots[slotIndex]?.weights ?? [];
      expect(weights.length).toBeGreaterThan(1);
      const total = weights.reduce((s, w) => s + w.weight, 0);
      const counts = new Map<string, number>();
      for (let seed = 0; seed < N; seed++) {
        const c = drawOffer({ ...ctx, seed }).slots[slotIndex]?.card?.card ?? '';
        counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      for (const w of weights) {
        expect(Math.abs((counts.get(w.card) ?? 0) / N - w.weight / total)).toBeLessThan(0.015);
      }
    }
  });

  it('gives the natural card its boosted weight in its slot', () => {
    const ctx = ctxAt(8, {
      maxExtraction: 4,
      unlockedBuildings: [...START_BUILDINGS, 'adder', 'bridge'],
    });
    expect(naturalAt(ctx).card).toBe('mult');
    const mult = drawOffer(ctx).slots[0]?.weights.find((w) => w.card === 'mult');
    expect(mult?.curve).toBe(curveAt(card('mult').weight, 8));
    expect(mult?.natural).toBeCloseTo(curveAt(OFFERS.natural, 8));
    expect(mult?.weight).toBe(mult?.natural);
  });

  it('applies guards (placeholder rule: level 12+ without ×)', () => {
    const at12 = drawOffer(ctxAt(12)).slots[0]?.weights.find((w) => w.card === 'mult');
    expect(at12?.guard).toBe(3);
    expect(at12?.weight).toBe(3 * curveAt(card('mult').weight, 12));
    const at11 = drawOffer(ctxAt(11)).slots[0]?.weights.find((w) => w.card === 'mult');
    expect(at11?.guard).toBe(1);
    const noGuard = { ...DEFAULT_CATALOGUE, guards: [] };
    expect(cardWeight(card('mult'), ctxAt(12), noGuard)).toBe(curveAt(card('mult').weight, 12));
  });

  it('an empty slot draws from the other one', () => {
    const noAtelier = tweak((c) => (c.slot === 'atelier' ? { ...c, minLevel: 999 } : c));
    const ctx = ctxAt(9, { unlockedBuildings: [...START_BUILDINGS, 'adder', 'multiplier'] });
    const a = drawOffer(ctx, noAtelier);
    expect(a.cards).toHaveLength(2);
    expect(a.slots[1]?.pool).toBe('nombres');
    expect(a.cards.every((c) => card(c.card).slot === 'nombres')).toBe(true);

    const noNombres = tweak((c) => (c.slot === 'nombres' ? { ...c, minLevel: 999 } : c));
    const b = drawOffer(ctx, noNombres);
    expect(b.slots[0]?.pool).toBe('atelier');
    expect(b.cards).toHaveLength(2);

    const onlyValue = tweak((c) => (c.id === 'value' ? c : { ...c, minLevel: 999 }));
    const c = drawOffer(ctx, onlyValue);
    expect(c.cards.map((x) => x.card)).toEqual(['value']);
    expect(c.slots[1]).toMatchObject({ slot: 'atelier', pool: null, card: null });
  });

  it('the real Atelier slot is never empty and Nombres always has the value card', () => {
    for (let level = 3; level <= 80; level++) {
      const offer = drawOffer(ctxAt(level, { seed: level }));
      expect(offer.slots.map((s) => s.pool)).toEqual(['nombres', 'atelier']);
    }
  });

  it('special cards draw their native edition about 85 / 10 / 5', () => {
    const counts: Record<Edition, number> = { base: 0, brillante: 0, legendaire: 0 };
    const N = 20_000;
    for (let i = 0; i < N; i++) counts[drawSpecialEdition(mulberry32(i))] += 1;
    expect(Math.abs(counts.base / N - 0.85)).toBeLessThan(0.01);
    expect(Math.abs(counts.brillante / N - 0.1)).toBeLessThan(0.01);
    expect(Math.abs(counts.legendaire / N - 0.05)).toBeLessThan(0.01);

    const heavy = tweak((c) =>
      c.id === 'ancient-adder' ? { ...c, weight: [{ level: 1, w: 1e6 }] } : c,
    );
    const inOffers: Record<Edition, number> = { base: 0, brillante: 0, legendaire: 0 };
    const M = 5_000;
    for (let seed = 0; seed < M; seed++) {
      for (const c of drawOffer(ctxAt(8, { seed }), heavy).cards) {
        if (c.card === 'ancient-adder') inOffers[c.edition] += 1;
        else if (c.card === 'edition-brillante') expect(c.edition).toBe('brillante');
        else if (c.card === 'edition-legendaire') expect(c.edition).toBe('legendaire');
        else expect(c.edition).toBe('base');
      }
    }
    expect(inOffers.base + inOffers.brillante + inOffers.legendaire).toBe(M);
    expect(Math.abs(inOffers.base / M - 0.85)).toBeLessThan(0.02);
    expect(Math.abs(inOffers.brillante / M - 0.1)).toBeLessThan(0.02);
    expect(Math.abs(inOffers.legendaire / M - 0.05)).toBeLessThan(0.02);
  });
});
