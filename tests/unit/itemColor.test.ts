import { describe, expect, it } from 'vitest';
import { ITEM_CHALKS } from '../../src/config/colors';
import { itemColor, oklchHex } from '../../src/render/itemColor';

describe('item colours', () => {
  it('converts OKLCH to #rrggbb', () => {
    expect(oklchHex(1, 0, 0)).toBe('#ffffff');
    expect(oklchHex(0, 0, 0)).toBe('#000000');
    // sRGB red is oklch(0.628 0.2577 29.23).
    expect(oklchHex(0.62796, 0.25768, 29.2339)).toBe('#ff0000');
  });

  it('gives 1..9 their own chalk, all different', () => {
    for (let v = 1; v <= 9; v++) expect(itemColor(v)).toBe(ITEM_CHALKS[v - 1]);
    expect(new Set(ITEM_CHALKS).size).toBe(9);
  });

  it('spreads the other values one golden angle apart, odd ones lighter', () => {
    // Values of the reviewed palette.
    expect(itemColor(11)).toBe('#d6d09b');
    expect(itemColor(12)).toBe('#74b3de');
    expect(itemColor(30)).toBe('#5ebdbd');
    expect(itemColor(13)).toBe('#f8bcbd');
  });

  it('gives every other value a stable #rrggbb (extractors shade it)', () => {
    for (const v of [0, -3, 10, 47, 80, 123_456, -2_000_000_000]) {
      expect(itemColor(v)).toMatch(/^#[0-9a-f]{6}$/);
      expect(itemColor(v)).toBe(itemColor(v));
    }
  });
});
