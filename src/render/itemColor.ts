import { ITEM_CHALK_TONE, ITEM_CHALKS } from '../config/colors';

const cache = new Map<number, string>();

/** Hue step between consecutive values: the golden angle, so neighbours never look alike. */
const GOLDEN_ANGLE = 137.50776405;

/** sRGB transfer curve of a linear channel, clamped to [0, 1], as two hex digits. */
function srgbHex(linear: number): string {
  const c = Math.min(1, Math.max(0, linear));
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(v * 255)
    .toString(16)
    .padStart(2, '0');
}

/**
 * `#rrggbb` of an OKLCH colour (Björn Ottosson's OKLab, polar form): `l` in 0..1, `c` the
 * chroma, `h` in degrees. Equal steps of hue look like equal changes of colour, unlike HSL
 * where greens take a third of the wheel. Out-of-gamut channels are clamped.
 */
export function oklchHex(l: number, c: number, h: number): string {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;
  return `#${srgbHex(r)}${srgbHex(g)}${srgbHex(bl)}`;
}

/**
 * Item colour (PLAN §5), as `#rrggbb`: a fixed chalk for 1..9; otherwise the hue turns one
 * golden angle per value, odd values in a light chalk tone and even values in a darker one.
 * Extractors use it too, so they match their items.
 */
export function itemColor(value: number): string {
  let c = cache.get(value);
  if (c === undefined) {
    const fixed = value >= 1 && value <= 9 ? ITEM_CHALKS[value - 1] : undefined;
    if (fixed !== undefined) c = fixed;
    else {
      const tone = Math.abs(value) % 2 === 1 ? ITEM_CHALK_TONE.odd : ITEM_CHALK_TONE.even;
      const hue = (((ITEM_CHALK_TONE.hueOffset + value * GOLDEN_ANGLE) % 360) + 360) % 360;
      c = oklchHex(tone.lightness, tone.chroma, hue);
    }
    if (cache.size > 4096) cache.clear();
    cache.set(value, c);
  }
  return c;
}
