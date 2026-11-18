import { expect, test } from '@playwright/test';

test('a seeded map is reproducible and shows the seed in the debug panel', async ({ page }) => {
  await page.goto('./?debug=1&seed=42&tutorial=0');
  await expect(page.locator('.debug-panel')).toContainText('42');

  const first = await page.evaluate(() => {
    const api = window.__sumflow;
    if (!api) throw new Error('debug API missing');
    return { seed: api.getState().seed, one: api.findDeposit(1), ten: api.findDeposit(10) };
  });
  expect(first.seed).toBe(42);
  expect(first.ten).toBeNull();
  if (!first.one) throw new Error('no deposit of 1');
  expect(Math.hypot(first.one.x, first.one.y)).toBeLessThan(16.5);

  await page.reload();
  const again = await page.evaluate(() => window.__sumflow?.findDeposit(1) ?? null);
  expect(again).toEqual(first.one);

  const covered = await page.evaluate(([x, y]) => window.__sumflow?.depositAt(x, y) ?? null, [
    first.one.x - 1,
    first.one.y + 1,
  ] as const);
  expect(covered).toEqual(first.one);
});
