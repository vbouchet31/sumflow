import { expect, test, type Page } from '@playwright/test';
import type { DebugSnapshot } from '../../src/debug/debugApi';
import { tileCentre, touchDriver } from './helpers';

async function pageScale(page: Page): Promise<number> {
  return page.evaluate(() => window.visualViewport?.scale ?? 1);
}

async function state(page: Page): Promise<DebugSnapshot> {
  const s = await page.evaluate(() => window.__sumflow?.getState() ?? null);
  if (!s) throw new Error('debug API missing');
  return s;
}

test('pinching never zooms the page, on the map or on the interface', async ({ page }) => {
  await page.goto('./?debug=1&seed=42');
  const touch = await touchDriver(page);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport');

  await touch.pinch(tileCentre(page, 6, 0), 60, 220);
  expect(await pageScale(page)).toBe(1);

  // Starting on the build bar.
  const bar = await page.locator('.build-bar').boundingBox();
  if (!bar) throw new Error('no build bar');
  await touch.pinch([viewport.width / 2, bar.y + bar.height / 2], 40, 200);
  expect(await pageScale(page)).toBe(1);
});

test('a tap with a tool acts like a click', async ({ page }) => {
  await page.goto('./?debug=1&seed=42');
  const touch = await touchDriver(page);
  await page.locator('.build-btn[data-tool="belt"]').tap();
  expect((await state(page)).tool).toBe('belt');
  await touch.tap(tileCentre(page, 6, 0));
  await expect.poll(async () => (await state(page)).belts).toBe(1);
});
