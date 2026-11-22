import { expect, test } from '@playwright/test';

test('a game survives a save and a reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./?debug=1&seed=42&tutorial=0');
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
  await page.goto('./?debug=1&seed=42&tutorial=0');
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
  await page.goto('./?debug=1&seed=7&tutorial=0');
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

test('a tutorial card opens on a new game, then one per unlock, and is not shown twice', async ({
  page,
}) => {
  await page.goto('./?debug=1&seed=42');
  const card = page.locator('.tut-card');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-tip', 'start');
  await expect(card.locator('.tut-canvas')).toBeVisible();
  await expect(card.locator('.tut-ok')).toBeFocused();
  // The demo moves on through its steps.
  await expect(card.locator('.tut-caption')).toHaveText('Draw a belt to the hub', {
    timeout: 8000,
  });
  // Shortcuts wait while it is open.
  await page.keyboard.press('Digit1');
  expect((await page.evaluate(() => window.__sumflow?.getState()))?.tool).toBe('none');
  await page.keyboard.press('Enter');
  await expect(card).toBeHidden();

  // Seen cards are saved with the game.
  await page.evaluate(() => window.__sumflow?.save());
  await page.reload();
  await page.evaluate(() => window.__sumflow?.getState());
  await page.waitForTimeout(300);
  await expect(card).toBeHidden();

  // Each unlock brings its card; Escape closes one and the next follows.
  await page.evaluate(() => window.__sumflow?.unlockAll());
  await expect(card).toHaveAttribute('data-tip', 'adder');
  await expect(card.locator('.tut-count')).toHaveText('1 / 10');
  await expect(card.locator('.tut-ok')).toHaveText('Next');
  await page.keyboard.press('Escape');
  await expect(card).toHaveAttribute('data-tip', 'upgrades');
  await expect(card.locator('.tut-count')).toHaveText('2 / 10');
  await expect(card.locator('.tut-canvas')).toHaveCount(0);
  await card.locator('.tut-ok').click();
  // The values given by `unlockAll` bring their card, with the highest one.
  await expect(card).toHaveAttribute('data-tip', 'value');
  await expect(card.locator('.tut-text')).toContainText('Deposits of 80');
  await card.locator('.tut-ok').click();
  await expect(card).toHaveAttribute('data-tip', 'bridge');
  // A click on the backdrop closes it as well.
  await page.mouse.click(5, 5);
  await expect(card).toHaveAttribute('data-tip', 'multiplier');
});

test('the Help menu replays any card already met', async ({ page }) => {
  await page.goto('./?debug=1&seed=42&tutorial=0');
  await page.evaluate(() => window.__sumflow?.unlockAll());
  await page.keyboard.press('Escape');
  await page.locator('.menu-card .menu-btn').nth(6).click(); // Help
  const tips = page.locator('.menu-card .help-tip');
  await expect(tips).toHaveCount(11); // the buildings, the features and the first value
  await tips.filter({ hasText: 'Divider' }).click();
  const card = page.locator('.tut-card');
  await expect(card).toHaveAttribute('data-tip', 'divider');
  await expect(page.locator('.menu-card')).toBeHidden();
  await expect(card.locator('.tut-ok')).toHaveText('Got it');
  await expect(card.locator('.tut-caption')).toHaveText('7 ÷ 2 = 3, remainder 1', {
    timeout: 15000,
  });
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  // Back to the game: shortcuts work again.
  await page.keyboard.press('Digit1');
  expect((await page.evaluate(() => window.__sumflow?.getState()))?.tool).toBe('belt');
});

test('New game from the menu starts a fresh game with the chosen seed', async ({ page }) => {
  await page.goto('./?debug=1&seed=42&tutorial=0');
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

test('New game from the menu accepts a word as seed, such as a name', async ({ page }) => {
  await page.goto('./?debug=1&seed=42&tutorial=0');
  await page.keyboard.press('Escape');
  await page.locator('.menu-card .menu-btn').nth(1).click(); // New game
  await page.locator('#new-seed').fill('Vincent');
  await Promise.all([page.waitForEvent('load'), page.locator('#new-seed').press('Enter')]);
  const s = await page.evaluate(() => window.__sumflow?.getState());
  // Frozen value: same as `parseSeed('vincent')` in the unit tests.
  expect(s?.seed).toBe(3201794912);
  expect(s?.level).toBe(1);
});

test('?seed= accepts a word as well as a number', async ({ page }) => {
  await page.goto('./?debug=1&seed=Vincent&tutorial=0');
  expect((await page.evaluate(() => window.__sumflow?.getState()))?.seed).toBe(3201794912);
});
