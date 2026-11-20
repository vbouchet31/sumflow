import { ITEM_CHALK_TONE, ITEM_CHALKS } from '../config/colors';
import { mix32 } from '../core/rng';

const cache = new Map<number, string>();

/** `#rrggbb` of an HSL colour (h in degrees, s and l in %). */
export function hslHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lig = l / 100;
  const a = sat * Math.min(lig, 1 - lig);
  const channel = (n: number): string => {
    const k = (n + h / 30) % 12;
    const v = lig - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/**
 * Item colour (PLAN §5), as `#rrggbb`: a fixed chalk for 1..9, otherwise a hue hashed from
 * the value in the same chalk tone. Extractors use it too, so they match their items.
 */
export function itemColor(value: number): string {
  let c = cache.get(value);
  if (c === undefined) {
    const fixed = value >= 1 && value <= 9 ? ITEM_CHALKS[value - 1] : undefined;
    c = fixed ?? hslHex(mix32(value) % 360, ITEM_CHALK_TONE.saturation, ITEM_CHALK_TONE.lightness);
    if (cache.size > 4096) cache.clear();
    cache.set(value, c);
  }
  return c;
}
