import { expect, test } from '@playwright/test';

test('upgrades panel: badge, purchase and effect; delivered panel with units', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./?debug=1&seed=42&tutorial=0');

  const upgradesBtn = page.locator('.top-btn[data-action="upgrades"]');
  await expect(upgradesBtn).toBeHidden();

  // Levels 1 and 2 → upgrades unlocked.
  await page.evaluate(() => {
    window.__sumflow?.deliver(1, 10);
    window.__sumflow?.deliver(2, 20);
  });
  await expect(upgradesBtn).toBeVisible();
  await expect(upgradesBtn).not.toHaveClass(/has-badge/);

  await page.keyboard.press('u');
  const beltRow = page.locator('.upg-row[data-track="belt"]');
  await expect(beltRow).toBeVisible();
  await expect(beltRow.locator('.upg-buy')).toBeDisabled();

  // Belt t1 = 1: deliver 200 → ready, badge on, buy → level 2.
  await page.evaluate(() => window.__sumflow?.deliver(1, 200));
  await expect(upgradesBtn).toHaveClass(/has-badge/);
  await expect(beltRow.locator('.upg-buy')).toBeEnabled();
  await beltRow.locator('.upg-buy').click();
  const state = await page.evaluate(() => window.__sumflow?.getState());
  expect(state?.upgrades.belt).toBe(2);
  await expect(upgradesBtn).not.toHaveClass(/has-badge/);

  // Delivered panel replaces the upgrades panel; the unit button cycles.
  await page.keyboard.press('n');
  await expect(page.locator('.upgrades-panel')).toBeHidden();
  const unit = page.locator('.delivered-panel .unit-btn');
  await expect(unit).toHaveText('/s');
  await unit.click();
  await expect(unit).toHaveText('/min');
  await expect(page.locator('.delivered-panel tr.is-target')).toHaveCount(1);
  await expect(page.locator('.delivered-panel .chip')).toHaveCount(12);
  expect(errors).toEqual([]);
});
