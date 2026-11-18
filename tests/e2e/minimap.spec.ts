import { expect, test } from '@playwright/test';

test('the minimap moves the camera, hides with M, and leaves the map clickable', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./?debug=1&seed=42');
  const canvas = page.locator('.minimap-canvas');
  // Open from the start on a large screen.
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no minimap');
  expect(box.width).toBe(180);

  // The empty part of the box, left of the toggle button, belongs to the map.
  const btn = await page.locator('.minimap-toggle').boundingBox();
  if (!btn) throw new Error('no toggle');
  const beside = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest('.minimap') === null,
    { x: btn.x - 20, y: btn.y + btn.height / 2 },
  );
  expect(beside).toBe(true);

  // A press near the top-left corner sends the camera up and to the left (once drawn).
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  await page.mouse.click(box.x + 10, box.y + 10);
  const cam = await page.evaluate(() => window.__sumflow?.getState().camera);
  expect(cam?.x).toBeLessThan(0);
  expect(cam?.y).toBeLessThan(0);

  await page.keyboard.press('m');
  await expect(canvas).toBeHidden();
  await page.keyboard.press('m');
  await expect(canvas).toBeVisible();
  expect(errors).toEqual([]);
});
