import type { Page } from '@playwright/test';

export interface ContrastIssue {
  text: string;
  selector: string;
  ratio: number;
  color: string;
  background: string;
}

/**
 * Contrast of every visible piece of DOM text against its effective background (WCAG 2.1
 * relative luminance), with translucent layers composited over the canvas background.
 * Disabled controls are skipped, as WCAG does. Returns the texts under `min`.
 */
export async function contrastIssues(page: Page, min = 4.5): Promise<ContrastIssue[]> {
  // A fading toast would be measured half transparent: let animations finish first.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
  return page.evaluate((minRatio) => {
    type Rgba = [number, number, number, number];
    const parse = (css: string): Rgba => {
      const m = css.match(/rgba?\(([^)]+)\)/);
      if (!m || !m[1]) return [0, 0, 0, 0];
      const p = m[1]
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map(Number);
      return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 1];
    };
    const over = (top: Rgba, under: Rgba): Rgba => {
      const a = top[3] + under[3] * (1 - top[3]);
      if (a === 0) return [0, 0, 0, 0];
      const mix = (i: 0 | 1 | 2): number =>
        (top[i] * top[3] + under[i] * under[3] * (1 - top[3])) / a;
      return [mix(0), mix(1), mix(2), a];
    };
    const luminance = (c: Rgba): number => {
      const f = (v: number): number => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const canvasBg = parse(getComputedStyle(document.body).backgroundColor);
    const issues: ContrastIssue[] = [];
    const root = document.getElementById('ui-root');
    if (!root) return issues;
    for (const node of root.querySelectorAll<HTMLElement>('*')) {
      const text = [...node.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (!text || !node.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
        continue;
      if (node.closest(':disabled, [aria-disabled="true"]')) continue;
      // Background: every ancestor's colour, from the page up to the element.
      const chain: HTMLElement[] = [];
      for (let e: HTMLElement | null = node; e; e = e.parentElement) chain.unshift(e);
      let bg: Rgba = [canvasBg[0], canvasBg[1], canvasBg[2], 1];
      let opacity = 1;
      for (const e of chain) {
        const cs = getComputedStyle(e);
        opacity *= Number(cs.opacity);
        const c = parse(cs.backgroundColor);
        bg = over([c[0], c[1], c[2], c[3] * opacity], bg);
      }
      const fgRaw = parse(getComputedStyle(node).color);
      const fg = over([fgRaw[0], fgRaw[1], fgRaw[2], fgRaw[3] * opacity], bg);
      const l1 = luminance(fg);
      const l2 = luminance(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      if (ratio < minRatio) {
        issues.push({
          text: text.slice(0, 40),
          selector: `${node.tagName.toLowerCase()}.${node.className}`,
          ratio: Math.round(ratio * 100) / 100,
          color: getComputedStyle(node).color,
          background: `rgb(${bg.slice(0, 3).map(Math.round).join(', ')})`,
        });
      }
    }
    return issues;
  }, min);
}

export type Point = readonly [number, number];

export interface TouchDriver {
  /** Put fingers down (one per point). */
  start: (...points: Point[]) => Promise<void>;
  /** Move the fingers currently down to these points (same order as `start`). */
  move: (...points: Point[]) => Promise<void>;
  /** Lift fingers: the points given are the fingers that stay down (none = lift all). */
  end: (...remaining: Point[]) => Promise<void>;
  cancel: () => Promise<void>;
  tap: (p: Point) => Promise<void>;
  /** One finger from `from` to `to`, in `steps` moves, then lifted. */
  drag: (from: Point, to: Point, steps?: number) => Promise<void>;
  /** Two fingers around `centre`, their distance going from `from` to `to` pixels. */
  pinch: (centre: Point, from: number, to: number, steps?: number) => Promise<void>;
}

/**
 * Real multi-touch input through the DevTools protocol (Chromium only): Playwright's own
 * `touchscreen` can only tap. Moves are spaced by a frame so the game sees each of them.
 */
export async function touchDriver(page: Page): Promise<TouchDriver> {
  const cdp = await page.context().newCDPSession(page);
  const send = (
    type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel',
    points: Point[],
  ): Promise<unknown> =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map(([x, y], id) => ({ x, y, id })),
    });
  const frame = (): Promise<void> => page.waitForTimeout(16);
  const lerp = (a: Point, b: Point, k: number): Point => [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
  ];
  const driver: TouchDriver = {
    start: async (...points) => void (await send('touchStart', points)),
    move: async (...points) => {
      await send('touchMove', points);
      await frame();
    },
    end: async (...remaining) => void (await send('touchEnd', remaining)),
    cancel: async () => void (await send('touchCancel', [])),
    tap: async (p) => {
      await driver.start(p);
      await driver.end();
    },
    drag: async (from, to, steps = 8) => {
      await driver.start(from);
      for (let i = 1; i <= steps; i++) await driver.move(lerp(from, to, i / steps));
      await driver.end();
    },
    pinch: async ([cx, cy], from, to, steps = 8) => {
      const at = (d: number): Point[] => [
        [cx - d / 2, cy],
        [cx + d / 2, cy],
      ];
      await driver.start(...at(from));
      for (let i = 1; i <= steps; i++) await driver.move(...at(from + ((to - from) * i) / steps));
      await driver.end();
    },
  };
  return driver;
}

/** Screen centre of tile `(tx, ty)` at zoom 1 with the camera on the hub. */
export function tileCentre(page: Page, tx: number, ty: number): Point {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport');
  return [viewport.width / 2 + tx * 32 + 16, viewport.height / 2 + ty * 32 + 16];
}
