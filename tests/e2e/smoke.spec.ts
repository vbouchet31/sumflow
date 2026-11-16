import { expect, test, type Page } from '@playwright/test';

async function pixelAt(page: Page, x: number, y: number): Promise<number[]> {
  return page.locator('canvas#world').evaluate(
    (el: HTMLCanvasElement, [px, py]) => {
      const ctx = el.getContext('2d');
      const dpr = el.width / el.clientWidth;
      return ctx ? Array.from(ctx.getImageData(px * dpr, py * dpr, 1, 1).data) : [];
    },
    [x, y] as const,
  );
}

async function camera(page: Page): Promise<{ x: number; y: number; zoom: number }> {
  return page.evaluate(() => {
    const api = window.__sumflow;
    if (!api) throw new Error('debug API missing');
    return api.getState().camera;
  });
}

const BACKGROUND = [15, 20, 34, 255];
const HUB = [43, 108, 176, 255];

test('loads the page without console errors and draws the hub', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('./?debug=1');
  await expect(page).toHaveTitle('Sumflow');

  const canvas = page.locator('canvas#world');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport');
  expect(box?.width).toBe(viewport.width);
  expect(box?.height).toBe(viewport.height);

  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  await expect.poll(() => pixelAt(page, 2, 2)).toEqual(BACKGROUND);
  // Inside the hub, away from its text (hub spans ±96 px at zoom 1).
  await expect.poll(() => pixelAt(page, cx - 80, cy - 80)).toEqual(HUB);

  const { state } = await page
    .evaluate(() => window.__sumflow?.getState() ?? null)
    .then((s) => {
      if (!s) throw new Error('debug API missing');
      return s;
    });
  expect(state.level).toBe(1);
  expect(state.levelRequirement).toEqual({ value: 1, required: 10, delivered: 0 });

  expect(errors).toEqual([]);
});

test('camera zooms around the cursor, pans with the mouse and keys, and H recentres', async ({
  page,
}) => {
  await page.goto('./?debug=1');
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport');
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;

  // Zoom out under the centre: the hub shrinks and the probe point becomes background.
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, 800);
  await expect.poll(async () => (await camera(page)).zoom).toBeLessThan(0.5);
  await expect.poll(() => pixelAt(page, cx - 80, cy - 80)).toEqual(BACKGROUND);
  const zoomed = await camera(page);
  expect(zoomed.x).toBeCloseTo(0, 5);
  expect(zoomed.y).toBeCloseTo(0, 5);

  // Right-button drag pans the view.
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(cx + 100, cy + 50, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  const dragged = await camera(page);
  expect(dragged.x).toBeLessThan(-1);
  expect(dragged.y).toBeLessThan(-0.5);

  // Physical D key pans right.
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(300);
  await page.keyboard.up('KeyD');
  expect((await camera(page)).x).toBeGreaterThan(dragged.x);

  // H recentres on the hub.
  await page.keyboard.press('h');
  const home = await camera(page);
  expect(home.x).toBe(0);
  expect(home.y).toBe(0);
});
