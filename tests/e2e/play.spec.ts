import { expect, test } from '@playwright/test';

test('extractor + belts via the debug API complete level 1', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./?debug=1&seed=42');

  const result = await page.evaluate(() => {
    const api = window.__sumflow;
    if (!api) throw new Error('debug API missing');
    const d = api.findDeposit(1);
    if (!d) throw new Error('no deposit of 1');
    if (!api.place('extractor', d.x, d.y)) throw new Error('extractor refused');
    // Leave the extractor on the side facing the hub, then route into the hub's edge.
    if (Math.abs(d.x) >= Math.abs(d.y)) {
      const sx = d.x > 0 ? d.x - 2 : d.x + 2;
      const ex = d.x > 0 ? 2 : -3; // a hub tile: skipped, so the last belt points into it
      api.beltPath(sx, d.y, ex, 0, Math.abs(ex - sx) >= Math.abs(d.y)); // vertical first
    } else {
      const sy = d.y > 0 ? d.y - 2 : d.y + 2;
      const ey = d.y > 0 ? 2 : -3;
      api.beltPath(d.x, sy, 0, ey, Math.abs(d.x) < Math.abs(ey - sy)); // horizontal first
    }
    api.step(60);
    return api.getState();
  });

  expect(result.level).toBe(2);
  expect(result.levelRequirement).toEqual({ value: 2, required: 20, delivered: 0 });
  expect(errors).toEqual([]);
});

test('drawing a belt with the mouse places an L-shaped path', async ({ page }) => {
  await page.goto('./?debug=1&seed=42');
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport');
  // Hub is centred; draw well to the right of it (tiles are 32 px at zoom 1).
  const x0 = viewport.width / 2 + 32 * 6 + 16;
  const y0 = viewport.height / 2 + 16;

  await page.keyboard.press('Digit1');
  await expect(page.locator('.build-btn[data-tool="belt"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x0 + 32 * 4, y0 + 32 * 2, { steps: 8 });
  await page.mouse.up();

  const belts = await page.evaluate(() => window.__sumflow?.getState().belts ?? 0);
  expect(belts).toBe(7); // 4 horizontal + 2 vertical + the start tile

  // Tooltip describes the hovered belt.
  await expect(page.locator('.tooltip')).toBeVisible();
});
