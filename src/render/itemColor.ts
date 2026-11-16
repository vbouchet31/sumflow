import { ITEM_HUES, ITEM_LIGHTNESS, ITEM_SATURATION } from '../config/balance';
import { mix32 } from '../core/rng';

const cache = new Map<number, string>();

/** Item colour (PLAN §5): fixed hues for 1..9, otherwise a hue hashed from the value. */
export function itemColor(value: number): string {
  let c = cache.get(value);
  if (c === undefined) {
    const fixed = value >= 1 && value <= 9 ? ITEM_HUES[value - 1] : undefined;
    const hue = fixed ?? mix32(value) % 360;
    c = `hsl(${hue} ${ITEM_SATURATION}% ${ITEM_LIGHTNESS}%)`;
    if (cache.size > 4096) cache.clear();
    cache.set(value, c);
  }
  return c;
}
