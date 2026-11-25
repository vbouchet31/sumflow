import { expect, test } from '@playwright/test';

// Zoomed far out, a one-tile operator is smaller than its chalk outline: its hatching used
// to be drawn from a 0×0 picture, `drawImage` threw and the frame loop stopped for good
// (map, zoom and objective counter frozen).
test('zooming out to the minimum keeps the game running', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./?debug=1&tutorial=0');
  await page.evaluate(() => {
    const api = window.__sumflow;
    if (!api) throw new Error('debug API missing');
    api.unlockAll();
    api.place('adder', 5, -3, 0);
    api.place('multiplier', 8, -3, 0);
  });
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('no canvas');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  // Every zoom on the way down, to the minimum.
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(30);
  }
  const zoom = () => page.evaluate(() => window.__sumflow?.getState().camera.zoom ?? 0);
  const tick = () => page.evaluate(() => window.__sumflow?.getState().tick ?? 0);
  expect(await zoom()).toBe(0.05);

  // The frames go on: the simulation advances and the zoom still answers.
  const before = await tick();
  await expect.poll(tick).toBeGreaterThan(before + 10);
  await page.mouse.wheel(0, -600);
  await expect.poll(zoom).toBeGreaterThan(0.1);
  expect(errors).toEqual([]);
});
