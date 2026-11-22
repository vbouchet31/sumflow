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

test('from level 3 an offer waits; ?pick=none keeps it across a reload, then a choice takes it', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./?debug=1&seed=42&tutorial=0&pick=none');
  const offer = await page.evaluate(() => {
    const api = window.__sumflow;
    if (!api) throw new Error('debug API missing');
    api.deliver(1, 10);
    api.deliver(2, 20);
    api.deliver(3, 35);
    return api.offer();
  });
  expect(offer.pendingLevels).toEqual([3]);
  expect(offer.current?.level).toBe(3);
  expect(offer.current?.cards).toHaveLength(2);
  expect(offer.slots.map((s) => s.slot)).toEqual(['nombres', 'atelier']);
  await page.evaluate(() => window.__sumflow?.save());

  await page.reload();
  const after = await page.evaluate(() => window.__sumflow?.offer());
  expect(after?.current).toEqual(offer.current);
  expect(await page.evaluate(() => window.__sumflow?.choose(0))).toBe(true);
  await expect(page.locator('.toast', { hasText: /Obtained|Obtenu/ })).toBeVisible();
  const state = await page.evaluate(() => window.__sumflow?.getState());
  expect(state?.pendingLevels).toEqual([]);
  expect(state?.picks).toBe(3);
  expect(errors).toEqual([]);
});

test('without ?pick= the natural card is taken by itself', async ({ page }) => {
  await page.goto('./?debug=1&seed=42&tutorial=0');
  await page.evaluate(() => {
    const api = window.__sumflow;
    api?.deliver(1, 10);
    api?.deliver(2, 20);
    api?.deliver(3, 35);
  });
  await expect
    .poll(() => page.evaluate(() => window.__sumflow?.getState().pendingLevels.length))
    .toBe(0);
  const state = await page.evaluate(() => window.__sumflow?.getState());
  expect(state?.picks).toBe(3);
  expect(state?.level).toBe(4);
});
