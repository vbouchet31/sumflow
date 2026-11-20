import type { Page } from '@playwright/test';

/** RGBA (0-255, alpha 0-1) of a `#rrggbb` or `rgba(r, g, b, a)` colour from the palette. */
export function rgba(css: string): [number, number, number, number] {
  if (css.startsWith('#')) {
    const n = parseInt(css.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (!m?.[1]) throw new Error(`unknown colour ${css}`);
  const [r = 0, g = 0, b = 0, a = 1] = m[1].split(',').map(Number);
  return [r, g, b, a];
}

/** Opaque pixel of `top` painted over the opaque colour `under`, as read back from a canvas. */
export function over(top: string, under: string): number[] {
  const t = rgba(top);
  const u = rgba(under);
  const a = t[3];
  return [0, 1, 2]
    .map((i) => Math.round((t[i] as number) * a + (u[i] as number) * (1 - a)))
    .concat(255);
}

/** Same colour, give or take rounding (blending is done in 8 bits). */
export function near(
  pixel: readonly number[],
  expected: readonly number[],
  tolerance = 2,
): boolean {
  return (
    pixel.length === expected.length &&
    pixel.every((v, i) => Math.abs(v - (expected[i] ?? 0)) <= tolerance)
  );
}

/** Pixel of the map canvas at CSS position (x, y). */
export async function pixelAt(page: Page, x: number, y: number): Promise<number[]> {
  return page.locator('canvas#world').evaluate(
    (el: HTMLCanvasElement, [px, py]) => {
      const ctx = el.getContext('2d');
      const dpr = el.width / el.clientWidth;
      return ctx ? Array.from(ctx.getImageData(px * dpr, py * dpr, 1, 1).data) : [];
    },
    [x, y] as const,
  );
}

/**
 * Number of pixels of the map canvas in the CSS rectangle that stand out from `background`
 * (chalk marks), ignoring faint ones such as the grid.
 */
export async function inkIn(
  page: Page,
  rect: { x: number; y: number; w: number; h: number },
  background: readonly number[],
): Promise<number> {
  return page.locator('canvas#world').evaluate(
    (el: HTMLCanvasElement, [r, bg]) => {
      const ctx = el.getContext('2d');
      if (!ctx) return 0;
      const dpr = el.width / el.clientWidth;
      const data = ctx.getImageData(r.x * dpr, r.y * dpr, r.w * dpr, r.h * dpr).data;
      let n = 0;
      for (let i = 0; i < data.length; i += 4) {
        const d =
          Math.abs((data[i] ?? 0) - (bg[0] ?? 0)) +
          Math.abs((data[i + 1] ?? 0) - (bg[1] ?? 0)) +
          Math.abs((data[i + 2] ?? 0) - (bg[2] ?? 0));
        if (d > 40) n++;
      }
      return n;
    },
    [rect, background] as const,
  );
}
