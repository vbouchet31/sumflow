import { expect, test } from '@playwright/test';

test('a game survives a save and a reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./?debug=1&seed=42');
  const before = await page.evaluate(async () => {
    const api = window.__sumflow;
    if (!api) throw new Error('debug API missing');
    api.unlockAll();
    const d = api.findDeposit(1);
    if (!d) throw new Error('no deposit');
    api.place('extractor', d.x, d.y);
    api.place('adder', 8, -6, 1);
    api.beltPath(8, 4, 8, 10);
    api.setMarker(9, 9, 'ici');
    api.step(5);
    api.setTimeScale(1);
    await api.save();
    return { hash: api.stateHash(), state: api.getState() };
  });
  await expect(page.locator('.status-saved')).not.toContainText(/^Pas encore|^Not saved/);

  await page.reload();
  const after = await page.evaluate(() => window.__sumflow?.stateHash());
  // The game kept running between the save and the reload: compare the layout instead
  // when ticks differ, and the full hash when they match.
  const state = await page.evaluate(() => window.__sumflow?.getState());
  expect(state?.buildings).toBe(before.state.buildings);
  expect(state?.belts).toBe(before.state.belts);
  expect(state?.markers).toEqual(before.state.markers);
  expect(state?.unlockedBuildings).toEqual(before.state.unlockedBuildings);
  expect(state?.tick).toBeGreaterThanOrEqual(before.state.tick);
  if (state?.tick === before.state.tick) expect(after).toBe(before.hash);
  expect(errors).toEqual([]);
});

test('the menu opens with Escape; an invalid import changes nothing', async ({ page }) => {
  await page.goto('./?debug=1&seed=42');
  await page.evaluate(() => window.__sumflow?.place('belt', 10, 10, 0));
  const hash = await page.evaluate(() => window.__sumflow?.layout());

  await page.keyboard.press('Escape');
  const menu = page.locator('.menu-card');
  await expect(menu).toBeVisible();
  await page.locator('.menu-overlay input[type="file"]').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version": 1, "seed": "nope"}'),
  });
  await expect(page.locator('.toast')).toBeVisible();
  expect(await page.evaluate(() => window.__sumflow?.layout())).toBe(hash);
  await expect(menu).toBeHidden();
});

test('options: switching to English reloads in English and keeps the game', async ({ page }) => {
  await page.goto('./?debug=1&seed=7');
  await page.evaluate(() => window.__sumflow?.place('belt', 12, 12, 0));
  await page.locator('.top-btn[data-action="menu"]').click();
  await page.locator('.menu-card .menu-btn').nth(5).click(); // Options
  await page.locator('#opt-lang').selectOption('en');
  await page.waitForLoadState('load');
  await expect(page.locator('.build-btn[data-tool="belt"] .build-label')).toHaveText('Belt');
  const s = await page.evaluate(() => window.__sumflow?.getState());
  expect(s?.seed).toBe(7);
  expect(s?.belts).toBe(1);

  // Grid option is stored too.
  await page.keyboard.press('Escape');
  await page.locator('.menu-card .menu-btn').nth(5).click();
  await page.locator('#opt-grid').uncheck();
  const stored = await page.evaluate(() => localStorage.getItem('sumflow.settings'));
  expect(JSON.parse(stored ?? '{}')).toMatchObject({ locale: 'en', showGrid: false });
});

test('the first help bubble shows on a new game and can be dismissed', async ({ page }) => {
  await page.goto('./?debug=1&seed=42');
  const bubble = page.locator('.help-bubble');
  await expect(bubble).toBeVisible();
  await bubble.locator('button').click();
  await expect(bubble).toBeHidden();
  await page.evaluate(() => window.__sumflow?.unlockAll());
  await expect(bubble).toBeVisible(); // next tip: the adder
});

test('New game from the menu starts a fresh game with the chosen seed', async ({ page }) => {
  await page.goto('./?debug=1&seed=42');
  await page.evaluate(() => window.__sumflow?.place('belt', 10, 10, 0));
  await page.keyboard.press('Escape');
  await page.locator('.menu-card .menu-btn').nth(1).click(); // New game
  await page.locator('#new-seed').fill('123');
  await Promise.all([page.waitForEvent('load'), page.locator('#new-seed').press('Enter')]);
  const s = await page.evaluate(() => window.__sumflow?.getState());
  expect(s?.seed).toBe(123);
  expect(s?.belts).toBe(0);
  expect(s?.level).toBe(1);
});
