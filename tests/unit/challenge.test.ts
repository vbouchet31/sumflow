import { describe, expect, it } from 'vitest';
import {
  CHALLENGE_GOAL,
  challengeDay,
  challengeSeed,
  challengeTicks,
} from '../../src/sim/challenge';
import { completeLevel, setLevel } from '../../src/sim/progression';
import { createInitialState } from '../../src/sim/state';

describe('daily challenge', () => {
  it('gives everyone the same seed on the same UTC day', () => {
    const day = challengeDay(new Date('2026-11-17T23:30:00Z'));
    expect(day).toBe('2026-11-17');
    expect(challengeSeed(day)).toBe(challengeSeed('2026-11-17'));
    expect(challengeSeed(day)).not.toBe(challengeSeed('2026-11-18'));
  });

  it('stops the clock when the goal level is completed', () => {
    const s = createInitialState(challengeSeed('2026-11-17'));
    s.challenge = { date: '2026-11-17', goalLevel: CHALLENGE_GOAL, startTick: 0, doneTick: null };
    setLevel(s, CHALLENGE_GOAL);
    s.tick = 5_000;
    const events: string[] = [];
    completeLevel(s, (type) => events.push(type));
    expect(events).toContain('challengeDone');
    expect(s.challenge.doneTick).toBe(5_000);
    s.tick = 9_000;
    expect(challengeTicks(s)).toBe(5_000);
  });
});
