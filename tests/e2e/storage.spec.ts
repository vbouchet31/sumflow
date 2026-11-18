import { expect, test } from '@playwright/test';

test('storage unlocks at level 23 and can be placed with key 8', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./?debug=1&seed=42&tutorial=0');
  const btn = page.locator('.build-btn[data-tool="storage"]');
  await expect(btn).toBeHidden();
  await page.evaluate(() => window.__sumflow?.setLevel(23));
  await expect(btn).toBeVisible();

  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport');
  await page.keyboard.press('Digit8');
  await page.mouse.click(viewport.width / 2 + 32 * 9 + 16, viewport.height / 2 + 16);
  expect(await page.evaluate(() => window.__sumflow?.getState().buildings)).toBe(2);
  await expect(page.locator('.tooltip')).toContainText(/Storage|Stockage/);
  expect(errors).toEqual([]);
});
