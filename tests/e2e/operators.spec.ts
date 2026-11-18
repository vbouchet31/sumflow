import { expect, test } from '@playwright/test';

test('the adder appears after level 1 and can be placed with the keyboard and mouse', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./?debug=1&seed=42&tutorial=0');

  const adderBtn = page.locator('.build-btn[data-tool="adder"]');
  await expect(adderBtn).toBeHidden();
  await page.keyboard.press('Digit3'); // locked: no effect
  await expect(page.locator('.build-btn[aria-pressed="true"]')).toHaveCount(0);

  await page.evaluate(() => window.__sumflow?.deliver(1, 10));
  await expect(adderBtn).toBeVisible();

  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport');
  await page.keyboard.press('Digit3');
  await expect(adderBtn).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.click(viewport.width / 2 + 32 * 8 + 16, viewport.height / 2 + 16);

  const state = await page.evaluate(() => window.__sumflow?.getState());
  expect(state?.buildings).toBe(2); // hub + adder
  await expect(page.locator('.tooltip')).toContainText(/Adder|Additionneur/);
  expect(errors).toEqual([]);
});
