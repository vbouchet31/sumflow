import { describe, expect, it } from 'vitest';
import {
  beltSpeed,
  extractorCapacity,
  operatorSpeed,
  TRACKS,
  UPGRADE_SEQUENCES,
} from '../../src/config/balance';
import { deliver, setAutoBuy } from '../../src/sim/progression';
import { grantCard } from '../../src/sim/rewards';
import { createInitialState, type GameState } from '../../src/sim/state';
import {
  buildUpgradeRequirements,
  buyUpgrade,
  ensureSequence,
  isTrackMaxed,
  isTrackUnlocked,
  isUpgradeReady,
  setUpgradeLevel,
  windowTerms,
} from '../../src/sim/upgrades';

function withUpgrades(seed = 42): GameState {
  const s = createInitialState(seed);
  grantCard(s, 'upgrades');
  return s;
}

function fill(s: GameState, track: (typeof TRACKS)[number]): void {
  for (const r of s.upgradeReqs[track])
    for (let i = r.delivered; i < r.required; i++) deliver(s, r.value);
}

describe('upgrade sequences', () => {
  it('keep small values, stay strictly increasing, never contain 10, deterministic', () => {
    for (const track of TRACKS) {
      const a = ensureSequence(42, track, [], 60);
      const b = ensureSequence(42, track, [], 60);
      expect(a).toEqual(b);
      expect(a).not.toContain(10);
      for (let i = 1; i < a.length; i++) expect(a[i] ?? 0).toBeGreaterThan(a[i - 1] ?? 0);
      UPGRADE_SEQUENCES[track].forEach((base, i) => {
        if (base < 30) expect(a[i]).toBe(base);
        else {
          expect(a[i]).toBeGreaterThanOrEqual(Math.round(base * 0.85) - 1);
          expect(a[i]).toBeLessThanOrEqual(Math.round(base * 1.15) + 1);
        }
      });
    }
    expect(ensureSequence(43, 'multiplier', [], 10)).not.toEqual(
      ensureSequence(42, 'multiplier', [], 10),
    );
  });

  it('is the same whether generated at once or step by step', () => {
    const step: number[] = [];
    for (let n = 1; n <= 40; n += 3) ensureSequence(7, 'adder', step, n);
    ensureSequence(7, 'adder', step, 40);
    expect(step).toEqual(ensureSequence(7, 'adder', [], 40));
  });
});

describe('upgrade requirements', () => {
  it('use the sliding windows [t1], [t1, t2], [t(L-2), t(L-1), t(L)]', () => {
    expect(windowTerms(1)).toEqual([1]);
    expect(windowTerms(2)).toEqual([1, 2]);
    expect(windowTerms(3)).toEqual([1, 2, 3]);
    expect(windowTerms(7)).toEqual([5, 6, 7]);
    const s = withUpgrades();
    const seq = ensureSequence(s.seed, 'belt', [], 10);
    expect(s.upgradeReqs.belt.map((r) => r.value)).toEqual([seq[0]]);
    setUpgradeLevel(s, 'belt', 2);
    expect(s.upgradeReqs.belt.map((r) => r.value)).toEqual([seq[0], seq[1]]);
    setUpgradeLevel(s, 'belt', 6);
    expect(s.upgradeReqs.belt.map((r) => r.value)).toEqual([seq[3], seq[4], seq[5]]);
  });

  it('quantities: C(L), 0.8 C(L), 0.6 C(L) rounded to 50, × track factor', () => {
    const s = withUpgrades();
    expect(s.upgradeReqs.belt.map((r) => r.required)).toEqual([200]);
    setUpgradeLevel(s, 'belt', 2);
    expect(s.upgradeReqs.belt.map((r) => r.required)).toEqual([1000, 800]);
    setUpgradeLevel(s, 'adder', 3);
    expect(s.upgradeReqs.adder.map((r) => r.required)).toEqual([4800, 3850, 2900]);
    setUpgradeLevel(s, 'belt', 20);
    expect(s.upgradeReqs.belt[0]?.required).toBe(23_000);
  });

  it('one item counts for every active requirement of the same value', () => {
    const s = withUpgrades();
    // Belt t1 = 1 and level 1 target = 1.
    deliver(s, 1);
    expect(s.levelRequirement?.delivered).toBe(1);
    expect(s.upgradeReqs.belt[0]?.delivered).toBe(1);
  });

  it('a new requirement always starts at 0, and buying applies immediately', () => {
    const s = withUpgrades();
    fill(s, 'belt');
    expect(isUpgradeReady(s, 'belt')).toBe(true);
    expect(buyUpgrade(s, 'belt')).toBe(true);
    expect(s.upgrades.belt).toBe(2);
    expect(s.upgradeReqs.belt.every((r) => r.delivered === 0)).toBe(true);
    expect(buyUpgrade(s, 'belt')).toBe(false);
  });

  it('emits upgradeReady and auto-buys when enabled', () => {
    const s = withUpgrades();
    const events: string[] = [];
    const emit = (type: string) => events.push(type);
    setAutoBuy(s, true);
    for (const r of s.upgradeReqs.extractor)
      for (let i = 0; i < r.required; i++) deliver(s, r.value, emit);
    expect(events).toContain('upgradeReady');
    expect(events).toContain('upgradeBought');
    expect(s.upgrades.extractor).toBe(2);
  });

  it('tracks unlock with their buildings', () => {
    const s = createInitialState(1);
    expect(isTrackUnlocked(s, 'belt')).toBe(false);
    expect(s.upgradeReqs.belt).toEqual([]);
    grantCard(s, 'upgrades');
    expect(isTrackUnlocked(s, 'adder')).toBe(true);
    expect(isTrackUnlocked(s, 'multiplier')).toBe(false);
    grantCard(s, 'mult');
    expect(s.upgradeReqs.multiplier.length).toBe(1);
    expect(buildUpgradeRequirements(s, 'exponent')).toEqual([]);
  });
});

describe('caps', () => {
  it('extractor is capped at 12', () => {
    expect(extractorCapacity(12)).toBe(12);
    expect(extractorCapacity(30)).toBe(12);
    const s = withUpgrades();
    setUpgradeLevel(s, 'extractor', 12);
    expect(isTrackMaxed(s, 'extractor')).toBe(true);
    expect(s.upgradeReqs.extractor).toEqual([]);
    setUpgradeLevel(s, 'extractor', 11);
    expect(isTrackMaxed(s, 'extractor')).toBe(false);
  });

  it('soft caps: belt 20 tiles/s, adder 4 op/s, others 3 op/s', () => {
    expect(beltSpeed(8)).toBe(8);
    expect(beltSpeed(9)).toBeCloseTo(8.1);
    expect(beltSpeed(500)).toBe(20);
    expect(operatorSpeed('adder', 9)).toBeCloseTo(2.02);
    expect(operatorSpeed('adder', 1000)).toBe(4);
    expect(operatorSpeed('multiplier', 1000)).toBe(3);
    const s = withUpgrades();
    setUpgradeLevel(s, 'belt', 128); // 20 tiles/s
    expect(isTrackMaxed(s, 'belt')).toBe(true);
  });

  it('a track is maxed as soon as its next number would exceed 2 000 000 000', () => {
    const s = withUpgrades();
    const seq = ensureSequence(s.seed, 'belt', s.upgradeSeqs.belt, 1000);
    const first = seq.findIndex((t) => t > 2_000_000_000) + 1; // 1-based term index
    expect(first).toBeGreaterThan(10);
    setUpgradeLevel(s, 'belt', first - 1);
    expect(isTrackMaxed(s, 'belt')).toBe(false);
    setUpgradeLevel(s, 'belt', first);
    expect(isTrackMaxed(s, 'belt')).toBe(true);
    expect(s.upgradeReqs.belt).toEqual([]);
  });
});
