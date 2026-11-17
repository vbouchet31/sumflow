import { STREAK, TICK_RATE } from '../config/balance';
import type { Emit } from './progression';
import type { GameState } from './state';

/** Streak bookkeeping kept in the save (proposal 08). */
export interface StreakState {
  count: number;
  /** Tick of the last target item. */
  lastTick: number;
  /** Fraction of an extra item earned and not yet credited. */
  carry: number;
  best: number;
}

export function initialStreak(): StreakState {
  return { count: 0, lastTick: -1, carry: 0, best: 0 };
}

/** Index of the tier reached by a streak of `count`. */
export function tierIndex(count: number): number {
  let i = 0;
  STREAK.tiers.forEach((t, k) => {
    if (count >= t.from) i = k;
  });
  return i;
}

export function streakFactor(count: number): number {
  return STREAK.tiers[tierIndex(count)]?.factor ?? 1;
}

/**
 * A target item reached the hub: extend the streak and return how many items it is worth
 * (1, plus the extra whole items earned by the bonus so far).
 */
export function streakCredit(state: GameState, emit?: Emit): number {
  const s = state.streak;
  const before = tierIndex(s.count);
  s.count += 1;
  s.lastTick = state.tick;
  s.best = Math.max(s.best, s.count);
  const after = tierIndex(s.count);
  if (after > before) emit?.('streakTier', { factor: streakFactor(s.count), count: s.count });
  s.carry += streakFactor(s.count) - 1;
  const extra = Math.floor(s.carry + 1e-9);
  s.carry -= extra;
  return 1 + extra;
}

/** Once per tick: a gap ends the streak. */
export function stepStreak(state: GameState, emit?: Emit): void {
  const s = state.streak;
  if (s.count === 0) return;
  if (state.tick - s.lastTick <= STREAK.gapSeconds * TICK_RATE) return;
  if (tierIndex(s.count) > 0) emit?.('streakLost', { count: s.count });
  s.count = 0;
  s.carry = 0;
}
