import { describe, expect, it } from 'vitest';
import { LEVEL_TABLE, LEVELS, PALIERS, QUANTITY_FACTOR } from '../../src/config/balance';
import {
  ensureLevels,
  type GeneratedLevel,
  palierThresholds,
  paliersFor,
  quantityFactor,
  quantityFor,
} from '../../src/sim/levels';
import { chooseCard, completeLevel, deliver, setLevel } from '../../src/sim/progression';
import { createInitialState } from '../../src/sim/state';

const SEEDS = [0, 1, 42, 987654321, 2 ** 32 - 1];

function generate(seed: number, n: number): GeneratedLevel[] {
  return ensureLevels(seed, [], n);
}

describe('level generation', () => {
  it('keeps levels 1 to 5 fixed: 1, 2, 3, 5, 10', () => {
    for (const seed of SEEDS) {
      expect(generate(seed, 5).map((l) => l.target)).toEqual([1, 2, 3, 5, 10]);
    }
  });

  it('randomises levels 6 to 30 within ±8 % of the base target', () => {
    for (const seed of SEEDS) {
      const levels = generate(seed, 30);
      for (let n = 6; n <= 30; n++) {
        const base = LEVEL_TABLE[n - 1]?.target ?? 0;
        const target = levels[n - 1]?.target ?? 0;
        expect(target).toBeGreaterThanOrEqual(Math.round(base * 0.92) - 1);
        expect(target).toBeLessThanOrEqual(Math.round(base * 1.08) + 1);
        expect(levels[n - 1]?.quantity).toBe(quantityFor(n));
      }
    }
  });

  it('is strictly increasing, including the infinite levels', () => {
    for (const seed of SEEDS) {
      const levels = generate(seed, 300);
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i]?.target ?? 0).toBeGreaterThan(levels[i - 1]?.target ?? 0);
      }
    }
  });

  it('is deterministic per seed, whatever the generation steps', () => {
    const all = generate(42, 200);
    const stepwise: GeneratedLevel[] = [];
    for (let n = 1; n <= 200; n += 7) ensureLevels(42, stepwise, n);
    ensureLevels(42, stepwise, 200);
    expect(stepwise).toEqual(all);
    expect(generate(43, 200)).not.toEqual(all);
  });

  it('infinite levels grow by 1 to 3 % with the quantity formula', () => {
    const levels = generate(7, 120);
    for (let n = 31; n <= 120; n++) {
      const prev = levels[n - 2]?.target ?? 0;
      const cur = levels[n - 1]?.target ?? 0;
      expect(cur).toBeGreaterThanOrEqual(Math.max(prev + 1, Math.round(prev * 1.01) - 1));
      expect(cur).toBeLessThanOrEqual(Math.round(prev * 1.03) + 1);
    }
    expect(quantityFor(31)).toBe(10_650); // 14 200 × 0,75
    expect(quantityFor(60)).toBe(15_000); // 20 000 × 0,75
  });

  it('ends with a final level capped at 2 000 000 000', () => {
    const levels = generate(1, 5000);
    const last = levels[levels.length - 1];
    expect(last?.final).toBe(true);
    expect(last?.target).toBe(LEVELS.maxTarget);
    expect(levels.filter((l) => l.final)).toHaveLength(1);
    expect(levels.length).toBeLessThan(5000);
  });
});

describe('quantities (PLAN-paliers §3.3)', () => {
  it('keeps levels 1 to 15 at their table quantity', () => {
    for (let n = 1; n <= 15; n++) expect(quantityFor(n)).toBe(LEVEL_TABLE[n - 1]?.quantity);
  });

  it('applies × 0,75 from level 16 on, infinite levels included', () => {
    expect(quantityFactor(15)).toBe(1);
    expect(quantityFactor(16)).toBe(0.75);
    expect(quantityFactor(500)).toBe(0.75);
    expect(quantityFor(16)).toBe(3_000);
    expect(quantityFor(30)).toBe(10_500);
  });

  it('has no jump between the table and the infinite levels', () => {
    for (let n = 2; n <= 80; n++) {
      expect(quantityFor(n)).toBeGreaterThanOrEqual(quantityFor(n - 1));
    }
    expect(quantityFor(31) - quantityFor(30)).toBeLessThanOrEqual(200);
  });

  it('reads custom ranges, the last one reached winning, rounded to ten, never 0', () => {
    const ranges = [
      { from: 3, factor: 0.5 },
      { from: 10, factor: 0.123 },
    ];
    expect(quantityFor(2, ranges)).toBe(20);
    expect(quantityFor(3, ranges)).toBe(20); // 35 × 0,5 = 17,5 → 20
    expect(quantityFor(12, ranges)).toBe(100); // 800 × 0,123 = 98,4 → 100
    expect(quantityFor(1, [{ from: 1, factor: 0.001 }])).toBe(1);
    expect(quantityFor(16, [])).toBe(LEVEL_TABLE[15]?.quantity);
  });

  it('every factor is positive and ranges start at increasing levels', () => {
    for (const r of QUANTITY_FACTOR) expect(r.factor).toBeGreaterThan(0);
    for (let i = 1; i < QUANTITY_FACTOR.length; i++)
      expect(QUANTITY_FACTOR[i]?.from).toBeGreaterThan(QUANTITY_FACTOR[i - 1]?.from ?? 0);
  });
});

describe('paliers (PLAN-paliers §3.2)', () => {
  it('none before level 6, then 1/2, 1/3 2/3 from 12, 1/4 1/2 3/4 from 16', () => {
    for (let n = 1; n <= 5; n++) expect(paliersFor(n)).toEqual([]);
    expect(paliersFor(6)).toEqual([1 / 2]);
    expect(paliersFor(11)).toEqual([1 / 2]);
    expect(paliersFor(12)).toEqual([1 / 3, 2 / 3]);
    expect(paliersFor(15)).toEqual([1 / 3, 2 / 3]);
    expect(paliersFor(16)).toEqual([1 / 4, 1 / 2, 3 / 4]);
    expect(paliersFor(400)).toEqual([1 / 4, 1 / 2, 3 / 4]);
  });

  it('every range has increasing fractions strictly between 0 and 1', () => {
    for (const r of PALIERS) {
      r.at.forEach((f, i) => {
        expect(f).toBeGreaterThan(0);
        expect(f).toBeLessThan(1);
        if (i > 0) expect(f).toBeGreaterThan(r.at[i - 1] ?? 0);
      });
    }
    for (let i = 1; i < PALIERS.length; i++)
      expect(PALIERS[i]?.from).toBeGreaterThan(PALIERS[i - 1]?.from ?? 0);
  });

  it('thresholds are ceil(fraction × quantity), at least 1, exact on round values', () => {
    expect(palierThresholds([1 / 3, 2 / 3], 3_000)).toEqual([1_000, 2_000]);
    expect(palierThresholds([1 / 4, 1 / 2, 3 / 4], 10)).toEqual([3, 5, 8]);
    expect(palierThresholds([1 / 2], 1)).toEqual([1]);
    expect(palierThresholds([1 / 3, 2 / 3], 2)).toEqual([1, 2]);
  });

  it('reads custom ranges', () => {
    const ranges = [{ from: 2, at: [0.1, 0.9] }];
    expect(paliersFor(1, ranges)).toEqual([]);
    expect(paliersFor(7, ranges)).toEqual([0.1, 0.9]);
  });
});

describe('progression', () => {
  it('starts at level 1 with 1 × 10 and generates the lookahead', () => {
    const s = createInitialState(42);
    expect(s.levelRequirement).toEqual({ value: 1, required: 10, delivered: 0 });
    expect(s.levels.length).toBe(1 + LEVELS.lookahead);
  });

  it('applies rewards at once: adder, upgrades, value 2, bridge, value 3', () => {
    const s = createInitialState(42);
    deliver(s, 1, undefined);
    for (let i = 0; i < 10; i++) deliver(s, 1);
    expect(s.level).toBe(2);
    expect(s.unlockedBuildings).toContain('adder');
    expect(s.levelRequirement).toEqual({ value: 2, required: 20, delivered: 0 });
    completeLevel(s);
    expect(s.unlockedFeatures).toContain('upgrades');
    completeLevel(s);
    expect(s.maxExtraction).toBe(2);
    completeLevel(s);
    expect(s.unlockedBuildings).toContain('bridge');
    completeLevel(s);
    expect(s.maxExtraction).toBe(3);
    expect(s.level).toBe(6);
    expect(s.pendingOffers).toEqual([]);
  });

  it('only counts the target value and never exceeds the quantity', () => {
    const s = createInitialState(1);
    deliver(s, 2);
    expect(s.levelRequirement?.delivered).toBe(0);
    for (let i = 0; i < 9; i++) deliver(s, 1);
    expect(s.levelRequirement?.delivered).toBe(9);
    expect(s.totalDelivered).toBe(10);
  });

  it('setLevel grants every earlier reward', () => {
    const s = createInitialState(3);
    setLevel(s, 23);
    expect(s.level).toBe(23);
    expect(s.unlockedBuildings).toEqual(
      expect.arrayContaining([
        'adder',
        'bridge',
        'multiplier',
        'subtractor',
        'divider',
        'exponent',
        'storage',
      ]),
    );
    expect(s.unlockedFeatures).toEqual(expect.arrayContaining(['upgrades', 'priorities']));
    expect(s.maxExtraction).toBe(15);
  });

  it('finishing the final level switches to free play, its reward given at once', () => {
    const s = createInitialState(1);
    const levels = ensureLevels(s.seed, s.levels, 5000);
    setLevel(s, levels.length);
    const events: unknown[] = [];
    completeLevel(s, (type, payload) => events.push({ type, payload }));
    expect(s.levelRequirement).toBeNull();
    expect(s.finishedAtTick).toBe(s.tick);
    expect(events).toEqual([
      {
        type: 'levelCompleted',
        payload: expect.objectContaining({ final: true, reward: expect.anything() }),
      },
    ]);
    expect(s.pendingOffers).toEqual([]);
    deliver(s, 5); // no crash in free play
    expect(s.totalDelivered).toBe(1);
    expect(chooseCard(s, 0)).toBe(false);
  });
});
