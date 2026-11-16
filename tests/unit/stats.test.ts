import { describe, expect, it } from 'vitest';
import { DeliveryStats } from '../../src/sim/stats';

describe('DeliveryStats', () => {
  it('averages over the elapsed time, then over a sliding 60 s window', () => {
    const s = new DeliveryStats();
    for (let tick = 0; tick < 60 * 120; tick++) {
      s.advance(tick);
      if (tick % 30 === 0) s.record(7); // 2 per second
      if (tick < 60 * 30 && tick % 60 === 0) s.record(3); // 1/s during the first 30 s only
    }
    expect(s.rate(7)).toBeCloseTo(2, 1);
    expect(s.rate(3)).toBe(0);
    expect([...s.rates().keys()]).toEqual([7]);
  });
});
