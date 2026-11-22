import { describe, expect, it } from 'vitest';
import { LEVEL_TABLE, LEVELS } from '../../src/config/balance';
import { resolvePending } from '../../src/sim/autoPick';
import { ensureLevels, type GeneratedLevel, quantityFor } from '../../src/sim/levels';
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
        expect(levels[n - 1]?.quantity).toBe(LEVEL_TABLE[n - 1]?.quantity);
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
    expect(quantityFor(31)).toBe(14_200);
    expect(quantityFor(60)).toBe(20_000);
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

describe('progression', () => {
  it('starts at level 1 with 1 × 10 and generates the lookahead', () => {
    const s = createInitialState(42);
    expect(s.levelRequirement).toEqual({ value: 1, required: 10, delivered: 0 });
    expect(s.levels.length).toBe(1 + LEVELS.lookahead);
  });

  it('applies rewards: adder, upgrades, then the natural card of each offer', () => {
    const s = createInitialState(42);
    deliver(s, 1, undefined);
    for (let i = 0; i < 10; i++) deliver(s, 1);
    expect(s.level).toBe(2);
    expect(s.unlockedBuildings).toContain('adder');
    expect(s.levelRequirement).toEqual({ value: 2, required: 20, delivered: 0 });
    completeLevel(s);
    expect(s.unlockedFeatures).toContain('upgrades');
    completeLevel(s);
    expect(s.maxExtraction).toBe(1); // level 3 gives an offer, not chosen yet
    resolvePending(s, 'natural');
    expect(s.maxExtraction).toBe(2);
    completeLevel(s);
    resolvePending(s, 'natural');
    expect(s.unlockedBuildings).toContain('bridge');
    completeLevel(s);
    resolvePending(s, 'natural');
    expect(s.maxExtraction).toBe(3);
    expect(s.level).toBe(6);
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

  it('finishing the final level switches to free play, its offer still to choose', () => {
    const s = createInitialState(1);
    const levels = ensureLevels(s.seed, s.levels, 5000);
    setLevel(s, levels.length);
    const events: unknown[] = [];
    completeLevel(s, (type, payload) => events.push({ type, payload }));
    expect(s.levelRequirement).toBeNull();
    expect(s.finishedAtTick).toBe(s.tick);
    expect(events).toEqual([
      { type: 'levelCompleted', payload: expect.objectContaining({ final: true, reward: null }) },
    ]);
    expect(s.pendingLevels).toEqual([levels.length]);
    deliver(s, 5); // no crash in free play
    expect(s.totalDelivered).toBe(1);
    expect(chooseCard(s, 0, (type, payload) => events.push({ type, payload }))).toBe(true);
    expect(events.at(-1)).toEqual({
      type: 'cardChosen',
      payload: expect.objectContaining({ level: levels.length, final: true }),
    });
    expect(s.pendingLevels).toEqual([]);
  });
});
