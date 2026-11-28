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
  isAvailable,
  genreOf,
  naturalAt,
  naturalSequence,
  nextPity,
  nextValue,
  type OfferContext,
  offerSize,
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
    palier: 0,
    picks: {},
    pity: {},
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
    const curve = [
      { level: 3, w: 50 },
      { level: 20, w: 25 },
      { level: 40, w: 15 },
    ];
    expect(curveAt(curve, 1)).toBe(50);
    expect(curveAt(curve, 3)).toBe(50);
    expect(curveAt(curve, 11.5)).toBe(37.5);
    expect(curveAt(curve, 20)).toBe(25);
    expect(curveAt(curve, 30)).toBe(20);
    expect(curveAt(curve, 400)).toBe(15);
    expect(curveAt([], 5)).toBe(0);
    const concat = card('concat').weight;
    expect([1, 8, 10, 12, 20, 30, 50].map((l) => curveAt(concat, l))).toEqual([
      2, 2, 3.5, 5, 5, 3, 3,
    ]);
  });

  it('next value skips the forbidden 10', () => {
    expect(nextValue(1)).toBe(2);
    expect(nextValue(8)).toBe(9);
    expect(nextValue(9)).toBe(11);
    expect(nextValue(11)).toBe(12);
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

  it('the fil rouge reproduces the former unlock order, and is never drawn', () => {
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
      expect(card(step.card).drawable).toBe(false);
      expect(isAvailable(card(step.card), ctx)).toBe(false);
      apply(ctx, step.card);
    }
    expect(ctx.maxExtraction).toBe(80 - 7);
  });

  it('an item not obtained stays the next one', () => {
    const ctx = ctxAt(5, { unlockedBuildings: [...START_BUILDINGS, 'adder', 'bridge'] });
    expect(naturalAt(ctx)).toEqual({ card: 'value', value: 2 });
    ctx.maxExtraction = 2;
    expect(naturalAt(ctx)).toEqual({ card: 'value', value: 3 });
  });
});

describe('availability (PLAN-paliers §3.4)', () => {
  it('never the socle: values, operators, bridge, priorities, storage', () => {
    const late = ctxAt(80, { maxExtraction: 1 });
    for (const step of naturalSequence()) expect(isAvailable(card(step.card), late)).toBe(false);
    for (let seed = 0; seed < 300; seed++) {
      for (const level of [6, 12, 16, 40]) {
        for (const c of drawOffer(ctxAt(level, { seed, palier: 1 })).cards)
          expect(card(c.card).drawable).toBe(true);
      }
    }
  });

  it('prerequisites and minimum levels: the Concatenator needs ×, from level 8', () => {
    const concat = card('concat');
    expect(isAvailable(concat, ctxAt(9))).toBe(false);
    const withMult: Partial<Ctx> = {
      unlockedBuildings: [...START_BUILDINGS, 'adder', 'multiplier'],
    };
    expect(isAvailable(concat, ctxAt(7, withMult))).toBe(false);
    expect(isAvailable(concat, ctxAt(8, withMult))).toBe(true);
  });

  it('Éventail I from level 6, Éventail II after it from level 12, each once', () => {
    const fan = card('eventail');
    const fan2 = card('eventail-2');
    expect(isAvailable(fan, ctxAt(5))).toBe(false);
    expect(isAvailable(fan, ctxAt(6))).toBe(true);
    expect(isAvailable(fan, ctxAt(9, { picks: { eventail: 1 } }))).toBe(false);
    expect(isAvailable(fan2, ctxAt(14))).toBe(false); // needs Éventail I
    expect(isAvailable(fan2, ctxAt(11, { picks: { eventail: 1 } }))).toBe(false);
    expect(isAvailable(fan2, ctxAt(12, { picks: { eventail: 1 } }))).toBe(true);
    expect(isAvailable(fan2, ctxAt(12, { picks: { eventail: 1, 'eventail-2': 1 } }))).toBe(false);
    for (let seed = 0; seed < 300; seed++) {
      const offer = drawOffer(ctxAt(9, { seed, picks: { eventail: 1 } }));
      expect(offer.cards.map((c) => c.card)).not.toContain('eventail');
    }
  });
});

describe('drawOffer (PLAN-paliers §3.4)', () => {
  it('is deterministic and depends on the seed and the palier', () => {
    const ctx = ctxAt(9, {
      palier: 1,
      picks: { eventail: 1 },
      unlockedBuildings: [...START_BUILDINGS, 'adder', 'multiplier'],
    });
    expect(drawOffer(ctx)).toEqual(drawOffer({ ...ctx }));
    const seen = new Set<string>();
    for (let seed = 0; seed < 50; seed++)
      seen.add(JSON.stringify(drawOffer({ ...ctx, seed }).cards));
    expect(seen.size).toBeGreaterThan(2);
    let differ = 0;
    for (let seed = 0; seed < 50; seed++) {
      const a = drawOffer({ ...ctx, seed, palier: 1 }).cards;
      const b = drawOffer({ ...ctx, seed, palier: 2 }).cards;
      if (JSON.stringify(a) !== JSON.stringify(b)) differ += 1;
    }
    expect(differ).toBeGreaterThan(5);
  });

  it('2 cards, 3 with Éventail I, 4 with Éventail II, never more, never twice the same', () => {
    expect(offerSize(ctxAt(8))).toBe(2);
    expect(offerSize(ctxAt(8, { picks: { eventail: 1 } }))).toBe(3);
    expect(offerSize(ctxAt(14, { picks: { eventail: 1, 'eventail-2': 1 } }))).toBe(4);
    expect(offerSize(ctxAt(14, { picks: { eventail: 3, 'eventail-2': 3 } }))).toBe(OFFERS.maxCards);
    const withMult = [...START_BUILDINGS, 'adder', 'multiplier'] as Ctx['unlockedBuildings'];
    // One more object (a passive, a genre without a card for now), so 4 cards can be drawn.
    const extra: CardDef = {
      ...card('edition-brillante'),
      id: 'test-passive',
      effect: { kind: 'passive', id: 'operatorsBoost' },
    };
    const wider: Catalogue = { ...DEFAULT_CATALOGUE, cards: [...CARDS, extra] };
    for (let seed = 0; seed < 300; seed++) {
      for (const [picks, n] of [
        [{}, 2],
        [{ eventail: 1 }, 3],
        [{ eventail: 1, 'eventail-2': 1 }, 4],
      ] as const) {
        const offer = drawOffer(ctxAt(14, { seed, picks, unlockedBuildings: withMult }), wider);
        expect(offer.cards).toHaveLength(n);
        expect(new Set(offer.cards.map((c) => c.card)).size).toBe(n);
      }
      // The real catalogue has only 3 objects left once both Éventail are taken: 3 cards.
      const real = drawOffer(
        ctxAt(14, { seed, picks: { eventail: 1, 'eventail-2': 1 }, unlockedBuildings: withMult }),
      );
      expect(real.cards).toHaveLength(3);
    }
  });

  it('diversity: never two cards of one genre while another genre is left', () => {
    const withMult = [...START_BUILDINGS, 'adder', 'multiplier'] as Ctx['unlockedBuildings'];
    for (let seed = 0; seed < 500; seed++) {
      const ctx = ctxAt(14, { seed, picks: { eventail: 1 }, unlockedBuildings: withMult });
      const genres = drawOffer(ctx).cards.map((c) => genreOf(card(c.card)));
      // Genres available: edition, special, meta (Éventail II): 3 cards, 3 genres.
      expect(new Set(genres).size).toBe(genres.length);
    }
    // Only edition cards left: the rule gives way, the offer still has 2 cards.
    const editionsOnly = tweak((c) => (c.effect.kind === 'edition' ? c : { ...c, minLevel: 999 }));
    const offer = drawOffer(ctxAt(9), editionsOnly);
    expect(offer.cards.map((c) => c.card).sort()).toEqual([
      'edition-brillante',
      'edition-legendaire',
    ]);
  });

  it('draws each card in proportion to its weight', () => {
    const ctx = ctxAt(9);
    const reference = drawOffer(ctx);
    const N = 20_000;
    const weights = reference.draws[0]?.weights ?? [];
    expect(weights.length).toBeGreaterThan(2);
    const total = weights.reduce((sum, w) => sum + w.weight, 0);
    const counts = new Map<string, number>();
    for (let seed = 0; seed < N; seed++) {
      const c = drawOffer({ ...ctx, seed }).draws[0]?.card.card ?? '';
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    for (const w of weights) {
      expect(Math.abs((counts.get(w.card) ?? 0) / N - w.weight / total)).toBeLessThan(0.015);
    }
  });

  it('weights are the curve times the tuned scale, then guards', () => {
    const ctx = ctxAt(9);
    const legendary = drawOffer(ctx).draws[0]?.weights.find((w) => w.card === 'edition-legendaire');
    expect(legendary).toEqual({
      card: 'edition-legendaire',
      curve: curveAt(card('edition-legendaire').weight, 9),
      guard: 1,
      weight: curveAt(card('edition-legendaire').weight, 9),
    });
    const guarded = {
      ...DEFAULT_CATALOGUE,
      guards: [{ id: 'test', when: () => true, cards: ['edition-legendaire'], factor: 3 }],
    };
    expect(cardWeight(card('edition-legendaire'), ctx, guarded)).toBe(
      3 * curveAt(card('edition-legendaire').weight, 9),
    );
  });

  it('fewer cards when the pile runs out, none when it is empty', () => {
    const onlyFan = tweak((c) => (c.id === 'eventail' ? c : { ...c, minLevel: 999 }));
    expect(drawOffer(ctxAt(9), onlyFan).cards.map((c) => c.card)).toEqual(['eventail']);
    const nothing = tweak((c) => ({ ...c, minLevel: 999 }));
    expect(drawOffer(ctxAt(9), nothing).cards).toEqual([]);
  });

  it('special cards draw their native edition about 85 / 10 / 5', () => {
    const counts: Record<Edition, number> = { base: 0, brillante: 0, legendaire: 0 };
    const N = 20_000;
    for (let i = 0; i < N; i++) counts[drawSpecialEdition(mulberry32(i))] += 1;
    expect(Math.abs(counts.base / N - 0.85)).toBeLessThan(0.01);
    expect(Math.abs(counts.brillante / N - 0.1)).toBeLessThan(0.01);
    expect(Math.abs(counts.legendaire / N - 0.05)).toBeLessThan(0.01);

    const heavy = tweak((c) => (c.id === 'concat' ? { ...c, weight: [{ level: 1, w: 1e6 }] } : c));
    const inOffers: Record<Edition, number> = { base: 0, brillante: 0, legendaire: 0 };
    const M = 5_000;
    for (let seed = 0; seed < M; seed++) {
      const ctx = ctxAt(8, {
        seed,
        unlockedBuildings: [...START_BUILDINGS, 'adder', 'multiplier'],
      });
      for (const c of drawOffer(ctx, heavy).cards) {
        if (c.card === 'concat') inOffers[c.edition] += 1;
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

describe('safety net (PLAN-paliers §3.5)', () => {
  it('forces Éventail after 4 offers without it, as the first card', () => {
    const fan = card('eventail');
    expect(fan.pity).toBe(4);
    for (let seed = 0; seed < 200; seed++) {
      const due = drawOffer(ctxAt(9, { seed, pity: { eventail: 4 } }));
      expect(due.cards[0]?.card).toBe('eventail');
      expect(due.draws[0]?.forced).toBe(true);
      const early = drawOffer(ctxAt(9, { seed, pity: { eventail: 3 } }));
      expect(early.draws.every((d) => !d.forced)).toBe(true);
    }
  });

  it('counts offers where the card was available but not offered, back to 0 when offered', () => {
    const ctx = ctxAt(9, { pity: { eventail: 2 } });
    expect(nextPity(ctx, [{ card: 'edition-brillante', edition: 'brillante' }])).toEqual({
      eventail: 3,
    });
    expect(nextPity(ctx, [{ card: 'eventail', edition: 'base' }])).toEqual({ eventail: 0 });
    // Not available (Éventail II before Éventail I, or Éventail before level 6): unchanged.
    expect(nextPity(ctxAt(5, { pity: { eventail: 2 } }), [])).toEqual({ eventail: 2 });
    expect(nextPity(ctxAt(14), [])).toEqual({ eventail: 1 });
    expect(nextPity(ctxAt(14, { picks: { eventail: 1 } }), [])).toEqual({ 'eventail-2': 1 });
  });

  it('a whole run of offers never goes 5 offers without Éventail while it is available', () => {
    for (let seed = 0; seed < 100; seed++) {
      const ctx = ctxAt(9, { seed });
      let wait = 0;
      for (let palier = 1; palier <= 40; palier++) {
        ctx.palier = palier;
        const offer = drawOffer(ctx);
        wait = offer.cards.some((c) => c.card === 'eventail') ? 0 : wait + 1;
        expect(wait).toBeLessThanOrEqual(4);
        ctx.pity = nextPity(ctx, offer.cards);
      }
    }
  });
});
