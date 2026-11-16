import { expect, test } from '@playwright/test';

test('loads the page without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('./');
  await expect(page).toHaveTitle('Sumflow');
  await expect(page.locator('.splash h1')).toHaveText('Sumflow');

  const canvas = page.locator('canvas#world');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  const viewport = page.viewportSize();
  expect(box?.width).toBe(viewport?.width);
  expect(box?.height).toBe(viewport?.height);

  // The canvas is painted with the night-blue background (#0f1422).
  const pixel = await canvas.evaluate((el: HTMLCanvasElement) => {
    const ctx = el.getContext('2d');
    return ctx ? Array.from(ctx.getImageData(1, 1, 1, 1).data) : [];
  });
  expect(pixel).toEqual([15, 20, 34, 255]);

  expect(errors).toEqual([]);
});
