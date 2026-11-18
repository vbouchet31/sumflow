import { beforeEach, describe, expect, it } from 'vitest';
import { CURIOSITIES, codexFactor, resetCodexCache } from '../../src/sim/codex';
import { deliver } from '../../src/sim/progression';
import { createInitialState } from '../../src/sim/state';
import { currentBeltSpeed } from '../../src/sim/upgrades';

const has = (id: string, v: number): boolean =>
  CURIOSITIES.find((c) => c.id === id)?.test(v) ?? false;

describe('curiosities', () => {
  beforeEach(() => resetCodexCache());

  it('recognise their numbers', () => {
    expect(has('prime3', 101)).toBe(true);
    expect(has('prime3', 111)).toBe(false);
    expect(has('square', 144)).toBe(true);
    expect(has('cube', 343)).toBe(true);
    expect(has('palindrome3', 12_321)).toBe(true);
    expect(has('palindrome5', 1_221)).toBe(false);
    expect(has('repdigit', 7_777)).toBe(true);
    expect(has('staircase', 3_456)).toBe(true);
    expect(has('staircase', 3_457)).toBe(false);
    expect(has('fibonacci', 144)).toBe(true);
    expect(has('factorial', 5_040)).toBe(true);
    expect(has('perfect', 496)).toBe(true);
    expect(has('power2', 4_096)).toBe(true);
    expect(has('negative', -3)).toBe(true);
  });

  it('are recorded once, announced, and speed the belts up', () => {
    const s = createInitialState(3);
    const base = currentBeltSpeed(s);
    const events: string[] = [];
    deliver(s, 1_729, (type, p) => {
      if (type === 'curiosity') events.push((p as { id: string }).id);
    });
    deliver(s, 1_729);
    expect(events).toEqual(['taxicab']);
    expect(s.codex).toEqual([{ id: 'taxicab', value: 1_729 }]);
    deliver(s, 144); // square and fibonacci at once
    expect(s.codex.map((e) => e.id)).toEqual(['taxicab', 'square', 'fibonacci']);
    expect(codexFactor(s)).toBeCloseTo(1.03);
    expect(currentBeltSpeed(s)).toBeCloseTo(base * 1.03);
  });
});
