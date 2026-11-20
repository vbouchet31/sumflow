import { describe, expect, it } from 'vitest';
import { ITEM_CHALKS } from '../../src/config/colors';
import { hslHex, itemColor } from '../../src/render/itemColor';

describe('item colours', () => {
  it('converts HSL to #rrggbb', () => {
    expect(hslHex(0, 100, 50)).toBe('#ff0000');
    expect(hslHex(120, 100, 50)).toBe('#00ff00');
    expect(hslHex(240, 100, 50)).toBe('#0000ff');
    expect(hslHex(0, 0, 100)).toBe('#ffffff');
  });

  it('gives 1..9 their own chalk, all different', () => {
    for (let v = 1; v <= 9; v++) expect(itemColor(v)).toBe(ITEM_CHALKS[v - 1]);
    expect(new Set(ITEM_CHALKS).size).toBe(9);
  });

  it('gives every other value a stable #rrggbb (extractors shade it)', () => {
    for (const v of [0, -3, 11, 47, 80, 123_456]) {
      expect(itemColor(v)).toMatch(/^#[0-9a-f]{6}$/);
      expect(itemColor(v)).toBe(itemColor(v));
    }
  });
});
