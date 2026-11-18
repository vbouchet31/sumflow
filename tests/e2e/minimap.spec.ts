import { expect, type Page, test } from '@playwright/test';

/** Wait until the game loop runs and the minimap has drawn at least once. */
async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => (window.__sumflow?.getState().tick ?? 0) > 2);
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))),
  );
}

test('the minimap moves the camera and leaves the map clickable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./?debug=1&seed=42');
  await ready(page);
  const canvas = page.locator('.minimap-canvas');
  // Open from the start on a large screen.
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no minimap');
  expect(box.width).toBe(180);

  // The empty part of the box, left of its buttons, belongs to the map.
  const btn = await page.locator('.minimap-size').boundingBox();
  if (!btn) throw new Error('no size button');
  const beside = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest('.minimap') === null,
    { x: btn.x - 20, y: btn.y + btn.height / 2 },
  );
  expect(beside).toBe(true);

  // A press near the top-left corner sends the camera up and to the left.
  await page.mouse.click(box.x + 10, box.y + 10);
  const cam = await page.evaluate(() => window.__sumflow?.getState().camera);
  expect(cam?.x).toBeLessThan(0);
  expect(cam?.y).toBeLessThan(0);
  expect(errors).toEqual([]);
});

test('the minimap shrinks, closes, reopens, and remembers it', async ({ page }) => {
  await page.goto('./?debug=1&seed=42');
  await ready(page);
  const canvas = page.locator('.minimap-canvas');
  const size = page.locator('.minimap-size');
  const close = page.locator('.minimap-close');
  const open = page.locator('.minimap-open');
  await expect(open).toBeHidden();

  await size.click();
  expect((await canvas.boundingBox())?.width).toBe(112);
  await close.click();
  await expect(canvas).toBeHidden();
  await expect(open).toBeVisible();

  // Closed and small after a reload.
  await page.reload();
  await ready(page);
  await expect(canvas).toBeHidden();
  await page.keyboard.press('m');
  await expect(canvas).toBeVisible();
  expect((await canvas.boundingBox())?.width).toBe(112);
  await size.click();
  expect((await canvas.boundingBox())?.width).toBe(180);
  await page.keyboard.press('m');
  await expect(canvas).toBeHidden();
  await open.click();
  await expect(canvas).toBeVisible();
});

test('a panel opening at its spot hides the minimap until it closes', async ({ page }) => {
  await page.goto('./?debug=1&seed=42');
  await ready(page);
  const canvas = page.locator('.minimap-canvas');
  await expect(canvas).toBeVisible();
  await page.keyboard.press('l');
  await expect(page.locator('.panel:not([hidden])')).toHaveCount(1);
  await expect(canvas).toBeHidden();
  await page.keyboard.press('l');
  await expect(page.locator('.panel:not([hidden])')).toHaveCount(0);
  await expect(canvas).toBeVisible();
});
