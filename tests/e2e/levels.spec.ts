import { expect, test } from '@playwright/test';
import { gameUrl } from './helpers';

test('HUD, levels panel and level-complete toast', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto(gameUrl());

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
  // No palier before level 6: no mark, no next palier.
  await expect(page.locator('.hud-tick')).toHaveCount(0);
  await expect(page.locator('.hud-palier')).toBeHidden();

  expect(errors).toEqual([]);
});

test('the paliers of a level: marks on the HUD bar, the next one, the Levels panel', async ({
  page,
}) => {
  await page.goto(gameUrl('', 'none'));
  await page.evaluate(() => window.__sumflow?.setLevel(16));
  // Level 16: 3 000 items, paliers at 750, 1 500 and 2 250.
  const ticks = page.locator('.hud-bar .hud-tick');
  await expect(ticks).toHaveCount(3);
  await expect(page.locator('.hud-palier')).toHaveText(/750 \(1 \/ 3\)/);
  await page.evaluate(() => {
    const r = window.__sumflow?.getState().levelRequirement;
    if (r) window.__sumflow?.deliver(r.value, 800);
  });
  await expect(page.locator('.hud-tick.is-reached')).toHaveCount(1);
  await expect(page.locator('.hud-palier')).toHaveText(/1[\s,.]?500 \(2 \/ 3\)/);
  await expect(page.locator('.toast', { hasText: /1 \/ 3/ })).toBeVisible();

  await expect(page.locator('.offer-overlay')).toBeVisible();
  await page.keyboard.press('Escape'); // See the map
  await page.keyboard.press('l');
  const first = page.locator('.levels-panel tbody tr').first();
  await expect(first).toContainText('3 choi');
});

test('from the first palier an offer waits across a reload; a debug choice takes it and the screen follows', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto(gameUrl('', 'none'));
  const offer = await page.evaluate(() => {
    const api = window.__sumflow;
    if (!api) throw new Error('debug API missing');
    api.deliver(1, 10);
    api.deliver(2, 20);
    api.deliver(3, 35);
    api.setLevel(6);
    const st = api.getState();
    const r = st.levelRequirement;
    if (!r) throw new Error('no level');
    api.deliver(r.value, st.paliers[0] ?? 0);
    return api.offer();
  });
  expect(offer.pendingOffers).toEqual([{ level: 6, palier: 1 }]);
  expect(offer.current).toMatchObject({ level: 6, palier: 1 });
  expect(offer.current?.cards).toHaveLength(2);
  expect(offer.draws).toHaveLength(2);
  await page.evaluate(() => window.__sumflow?.save());

  await page.reload();
  const after = await page.evaluate(() => window.__sumflow?.offer());
  expect(after?.current).toEqual(offer.current);
  const screen = page.locator('.offer-overlay');
  await expect(screen).toBeVisible();
  expect(await page.evaluate(() => window.__sumflow?.choose(0))).toBe(true);
  await expect(screen).toBeHidden();
  await expect(page.locator('.toast', { hasText: /Obtained|Obtenu/ })).toBeVisible();
  const state = await page.evaluate(() => window.__sumflow?.getState());
  expect(state?.pendingOffers).toEqual([]);
  expect(state?.picks).toBe(6);
  expect(errors).toEqual([]);
});

test('levels give their reward at once; with ?pick=natural a palier offer is taken by itself', async ({
  page,
}) => {
  await page.goto(gameUrl());
  await page.evaluate(() => {
    const api = window.__sumflow;
    api?.deliver(1, 10);
    api?.deliver(2, 20);
    api?.deliver(3, 35);
  });
  let state = await page.evaluate(() => window.__sumflow?.getState());
  expect(state?.picks).toBe(3);
  expect(state?.maxExtraction).toBe(2);
  expect(state?.level).toBe(4);
  await page.evaluate(() => {
    const api = window.__sumflow;
    api?.setLevel(6);
    const r = api?.getState().levelRequirement;
    if (r) api?.deliver(r.value, r.required);
  });
  await expect
    .poll(() => page.evaluate(() => window.__sumflow?.getState().pendingOffers.length))
    .toBe(0);
  state = await page.evaluate(() => window.__sumflow?.getState());
  expect(state?.picks).toBe(7); // levels 1 to 6, and the palier of level 6
  expect(state?.level).toBe(7);
  await expect(page.locator('.offer-overlay')).toBeHidden();
});
