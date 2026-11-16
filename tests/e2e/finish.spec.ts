import { expect, test, type Page } from '@playwright/test';

async function pixelAt(page: Page, x: number, y: number): Promise<number[]> {
  return page.locator('canvas#world').evaluate(
    (el: HTMLCanvasElement, [px, py]) => {
      const ctx = el.getContext('2d');
      const dpr = el.width / el.clientWidth;
      return ctx ? Array.from(ctx.getImageData(px * dpr, py * dpr, 1, 1).data) : [];
    },
    [x, y] as const,
  );
}

test('a 1 + 1 chain feeds the hub, and survives a save and a reload (PLAN M11)', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./?debug=1&seed=42');

  const before = await page.evaluate(async () => {
    const api = window.__sumflow;
    if (!api) throw new Error('debug API missing');
    api.unlockAll();
    const d = api.findDeposit(1);
    if (!d) throw new Error('no deposit of 1');
    if (!api.place('extractor', d.x, d.y)) throw new Error('extractor refused');
    // Two faces of the extractor feed A and B of an adder placed on the hub's side of it.
    const down = d.y < 0;
    const beltY = down ? d.y + 2 : d.y - 2;
    api.place('belt', d.x - 1, beltY, down ? 1 : 3);
    api.place('belt', d.x, beltY, down ? 1 : 3);
    if (!api.place('adder', d.x - 1, down ? d.y + 3 : d.y - 4, down ? 0 : 2))
      throw new Error('adder refused');
    // From the adder's output to the hub; the path ends on a hub tile, which is skipped.
    const sx = d.x - 1;
    const sy = down ? d.y + 5 : d.y - 5;
    if (sy < -3 || sy > 2) {
      const ey = sy < 0 ? -3 : 2;
      api.beltPath(sx, sy, 0, ey, Math.abs(sx) < Math.abs(ey - sy)); // horizontal first
    } else {
      const ex = sx > 0 ? 2 : -3;
      api.beltPath(sx, sy, ex, sy);
    }
    api.step(90);
    api.setTimeScale(1);
    await api.save();
    return { hash: api.stateHash(), layout: api.layout(), state: api.getState() };
  });

  // 1 + 1 = 2 reached the hub: level 1 (ten 1s) is still open, only 2s were delivered.
  expect(before.state.buildings).toBe(3); // hub, extractor, adder
  expect(before.state.totalDelivered).toBeGreaterThan(10);
  expect(before.state.level).toBe(1);
  expect(before.state.levelRequirement?.delivered).toBe(0);
  await page.keyboard.press('n');
  await expect(page.locator('.delivered-panel')).toContainText('2');

  await page.reload();
  const after = await page.evaluate(() => {
    const api = window.__sumflow;
    if (!api) throw new Error('debug API missing');
    return { hash: api.stateHash(), layout: api.layout(), state: api.getState() };
  });
  expect(after.layout).toBe(before.layout);
  expect(after.state.buildings).toBe(before.state.buildings);
  expect(after.state.belts).toBe(before.state.belts);
  expect(after.state.totalDelivered).toBeGreaterThanOrEqual(before.state.totalDelivered);
  expect(after.state.tick).toBeGreaterThanOrEqual(before.state.tick);
  if (after.state.tick === before.state.tick) expect(after.hash).toBe(before.hash);
  // The reloaded factory keeps running.
  const later = await page.evaluate(() => {
    window.__sumflow?.step(10);
    return window.__sumflow?.getState().totalDelivered ?? 0;
  });
  expect(later).toBeGreaterThan(after.state.totalDelivered);
  expect(errors).toEqual([]);
});

test('F3 toggles the performance overlay', async ({ page }) => {
  await page.goto('./?seed=42'); // no debug mode needed
  const overlay = page.locator('.perf-overlay');
  await expect(overlay).toBeHidden();
  await page.keyboard.press('F3');
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText(/FPS ?: \d+/);
  await expect(overlay).toContainText(/Ticks ?: \d+/);
  await expect(overlay).toContainText(/Items ?: 0/);
  await page.keyboard.press('F3');
  await expect(overlay).toBeHidden();
});

test('time spent in a hidden tab is caught up when it comes back', async ({ page }) => {
  await page.goto('./?debug=1&seed=42');
  await page.clock.install();
  await page.evaluate(() => window.__sumflow?.getState()); // page is running
  const setVisibility = (state: 'hidden' | 'visible'): Promise<void> =>
    page.evaluate((s) => {
      Object.defineProperty(document, 'visibilityState', { value: s, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);
  const tick = async (): Promise<number> =>
    (await page.evaluate(() => window.__sumflow?.getState().tick)) ?? 0;

  const start = await tick();
  // The bar only shows for a few frames on an empty map: record that it appeared.
  await page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>('.catch-up');
    if (!bar) throw new Error('no catch-up bar');
    const seen: string[] = [];
    (window as unknown as { catchUpSeen: string[] }).catchUpSeen = seen;
    new MutationObserver(() => {
      if (!bar.hidden) seen.push(bar.textContent ?? '');
    }).observe(bar, { attributes: true, childList: true, subtree: true });
  });
  await setVisibility('hidden');
  await page.clock.fastForward(30_000);
  await setVisibility('visible');
  // 30 s owed = 1 800 ticks, on top of the frames that ran meanwhile.
  await expect.poll(tick).toBeGreaterThanOrEqual(start + 1800);
  await expect(page.locator('.catch-up')).toBeHidden();
  const seen = await page.evaluate(
    () => (window as unknown as { catchUpSeen: string[] }).catchUpSeen,
  );
  expect(seen.length).toBeGreaterThan(0);
  expect(seen.join(' ')).toMatch(/\d+ ?%/);
  expect(await tick()).toBeLessThan(start + 1800 + 600);
});

test('panels and the menu work with the keyboard alone (PLAN §9.5)', async ({ page }) => {
  await page.goto('./?debug=1&seed=42');
  // Panel: opens focused, Escape closes it.
  await page.keyboard.press('l');
  const panel = page.locator('.levels-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.panel-close')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();

  // Menu: focus stays inside while tabbing, Enter activates, Escape goes back then closes.
  await page.keyboard.press('Escape');
  const menu = page.locator('.menu-card');
  await expect(menu).toBeVisible();
  const buttons = menu.locator('.menu-btn');
  await expect(buttons.first()).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(buttons.last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(buttons.first()).toBeFocused();
  for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
  await expect(buttons.nth(5)).toBeFocused(); // Options
  await page.keyboard.press('Enter');
  await expect(menu).toHaveAttribute('data-view', 'options');
  await expect(menu.locator(':focus')).toHaveCount(1); // focus moved into the new view
  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('data-view', 'main');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  // A top-bar button activated from the keyboard keeps the focus; Space activates it too.
  const home = page.locator('.top-btn[data-action="home"]');
  await home.focus();
  await page.keyboard.press('Space');
  await expect(home).toBeFocused();
  expect(await page.evaluate(() => window.__sumflow?.getState().paused)).toBe(false);
});

test('zoomed out, the cached belt layer follows edits', async ({ page }) => {
  await page.goto('./?debug=1&seed=42');
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport');
  const zoom = 0.45;
  const scale = 32 * zoom;
  await page.evaluate((z) => window.__sumflow?.lookAt(60, 60, z), zoom);
  // Top middle of tile (60, 60): on the belt's base, clear of its chevrons.
  const px = Math.round(viewport.width / 2 + 0.5 * scale);
  const py = Math.round(viewport.height / 2 + 0.15 * scale);
  const BELT_BASE = [35, 43, 61, 255];
  await page.waitForTimeout(200); // let the zoom settle so the caches are in use
  expect(await pixelAt(page, px, py)).not.toEqual(BELT_BASE);

  await page.evaluate(() => window.__sumflow?.place('belt', 60, 60, 0));
  await expect.poll(() => pixelAt(page, px, py)).toEqual(BELT_BASE);
  await page.evaluate(() => window.__sumflow?.demolishArea(60, 60, 60, 60));
  await expect.poll(() => pixelAt(page, px, py)).not.toEqual(BELT_BASE);
  // Panning reuses the bitmaps: the belt-free tile stays belt-free elsewhere on screen.
  await page.evaluate(() => window.__sumflow?.place('belt', 61, 60, 0));
  await expect.poll(() => pixelAt(page, px + Math.round(scale), py)).toEqual(BELT_BASE);
});
