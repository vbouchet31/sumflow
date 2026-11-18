import { expect, test } from '@playwright/test';

test('HUD, levels panel and level-complete toast', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./?debug=1&seed=42&tutorial=0');

  await expect(page.locator('.hud-target')).toHaveText('1');
  await expect(page.locator('.hud-count')).toHaveText('0 / 10');

  // L opens the panel with 12 levels, the current one first.
  await page.keyboard.press('l');
  const rows = page.locator('.levels-panel tbody tr');
  await expect(rows).toHaveCount(12);
  await expect(rows.first()).toHaveClass(/current/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.levels-panel')).toBeHidden();

  // Completing level 1 shows a toast and unlocks the adder.
  await page.evaluate(() => window.__sumflow?.deliver(1, 10));
  await expect(page.locator('.toast').first()).toBeVisible();
  const state = await page.evaluate(() => window.__sumflow?.getState());
  expect(state?.level).toBe(2);
  expect(state?.unlockedBuildings).toContain('adder');
  await expect(page.locator('.hud-target')).toHaveText('2');

  expect(errors).toEqual([]);
});
