import { describe, expect, it } from 'vitest';
import { STREAK, TICK_RATE } from '../../src/config/balance';
import { deliver, setLevel } from '../../src/sim/progression';
import { createInitialState } from '../../src/sim/state';
import { stepStreak } from '../../src/sim/streak';

function feed(s: ReturnType<typeof createInitialState>, n: number, gapTicks = 10): void {
  const value = s.levelRequirement?.value ?? 0;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < gapTicks; k++) {
      s.tick += 1;
      stepStreak(s);
    }
    deliver(s, value);
  }
}

describe('delivery streak', () => {
  it('counts plainly below the first tier', () => {
    const s = createInitialState(1);
    setLevel(s, 20);
    feed(s, 30);
    expect(s.streak.count).toBe(30);
    expect(s.levelRequirement?.delivered).toBe(30);
  });

  it('pays the bonus once a tier is reached', () => {
    const s = createInitialState(1);
    setLevel(s, 20);
    const first = STREAK.tiers[1].from;
    feed(s, first + 40);
    // 40 items at ×1.25 credit 10 extra, the item that reached the tier included.
    expect(s.levelRequirement?.delivered).toBe(first + 40 + 10);
  });

  it('ends after a gap and keeps the record', () => {
    const s = createInitialState(1);
    setLevel(s, 20);
    feed(s, 60);
    feed(s, 1, Math.ceil(STREAK.gapSeconds * TICK_RATE) + 2);
    expect(s.streak.count).toBe(1);
    expect(s.streak.best).toBe(60);
  });
});
