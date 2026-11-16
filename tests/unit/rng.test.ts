import { describe, expect, it } from 'vitest';
import { hash2, mix32, mulberry32, randInt, toSeed } from '../../src/core/rng';

describe('rng', () => {
  it('mulberry32 is deterministic and in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('different seeds diverge', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('is roughly uniform', () => {
    const rng = mulberry32(7);
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 100_000; i++) {
      const b = Math.floor(rng() * 10);
      buckets[b] = (buckets[b] ?? 0) + 1;
    }
    for (const n of buckets) expect(Math.abs(n - 10_000)).toBeLessThan(500);
  });

  it('hash2 is deterministic, 32-bit and sensitive to each input', () => {
    const h = hash2(123, 4, 5);
    expect(h).toBe(hash2(123, 4, 5));
    expect(Number.isInteger(h) && h >= 0 && h < 2 ** 32).toBe(true);
    expect(hash2(124, 4, 5)).not.toBe(h);
    expect(hash2(123, 5, 4)).not.toBe(h);
    expect(hash2(123, -4, 5)).not.toBe(h);
  });

  it('helpers', () => {
    expect(mix32(0)).toBe(0);
    expect(toSeed(-1)).toBe(2 ** 32 - 1);
    const rng = mulberry32(3);
    for (let i = 0; i < 100; i++) {
      const n = randInt(rng, -2, 2);
      expect(n).toBeGreaterThanOrEqual(-2);
      expect(n).toBeLessThanOrEqual(2);
    }
  });
});
