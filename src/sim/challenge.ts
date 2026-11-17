import { mix32 } from '../core/rng';
import type { Emit } from './progression';
import type { GameState } from './state';

/** Daily challenge (proposal 15): everyone gets the same map on the same day. */
export interface ChallengeState {
  /** UTC day, `YYYY-MM-DD`. */
  date: string;
  /** Completing this level wins the challenge. */
  goalLevel: number;
  startTick: number;
  /** Tick at which the goal was reached, or null. */
  doneTick: number | null;
}

export const CHALLENGE_GOAL = 10;

/** `YYYY-MM-DD` of a date, in UTC (the same day for everyone at once). */
export function challengeDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Seed of a day's challenge: a hash of the date, the same in every browser. */
export function challengeSeed(day: string): number {
  return mix32(Number(day.replaceAll('-', '')) ^ 0x44415953); // "DAYS"
}

/** Ticks spent on the challenge so far (frozen once it is won). */
export function challengeTicks(state: GameState): number {
  const c = state.challenge;
  if (!c) return 0;
  return (c.doneTick ?? state.tick) - c.startTick;
}

/** After a level is completed: did that win the challenge? */
export function checkChallenge(state: GameState, completed: number, emit?: Emit): void {
  const c = state.challenge;
  if (!c || c.doneTick !== null || completed < c.goalLevel) return;
  c.doneTick = state.tick;
  emit?.('challengeDone', { ticks: c.doneTick - c.startTick, date: c.date });
}
