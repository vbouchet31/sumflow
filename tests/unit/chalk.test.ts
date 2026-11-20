import { describe, expect, it } from 'vitest';
import { hash01, rng, shade, tileSeed } from '../../src/render/chalk';

describe('chalk helpers', () => {
  it('the generator repeats itself for a seed, so a sketch does not flicker', () => {
    const a = rng(42);
    const b = rng(42);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect(rng(43)()).not.toBe(first[0]);
  });

  it('draws in [0, 1)', () => {
    const r = rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('the tile hash is stable and tells neighbours apart', () => {
    expect(hash01(3, -5)).toBe(hash01(3, -5));
    expect(tileSeed(1, 0)).not.toBe(tileSeed(0, 1));
    const values = new Set<number>();
    for (let x = -5; x <= 5; x++) for (let y = -5; y <= 5; y++) values.add(hash01(x, y));
    expect(values.size).toBe(121);
  });

  it('shades a colour toward white or black', () => {
    expect(shade('#000000', 0.5)).toBe('rgb(128, 128, 128)');
    expect(shade('#ffffff', -0.5)).toBe('rgb(128, 128, 128)');
    expect(shade('#3f6f7a', 0)).toBe('rgb(63, 111, 122)');
  });
});
