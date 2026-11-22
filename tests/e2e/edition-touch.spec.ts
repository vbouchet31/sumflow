import { expect, test } from '@playwright/test';
import { gameUrl, tileCentre, touchDriver } from './helpers';

test('Edition tool with a finger: tap the tool, tap a building', async ({ page }) => {
  await page.goto(gameUrl());
  const touch = await touchDriver(page);
  await page.evaluate(() => {
    const api = window.__sumflow;
    if (!api) throw new Error('debug API missing');
    api.unlockAll();
    api.grant('edition-brillante');
    api.place('multiplier', 6, -6, 0);
  });
  const button = page.locator('.build-btn[data-tool="edition"]');
  await expect(button).toBeVisible();
  await button.tap();
  expect(await page.evaluate(() => window.__sumflow?.getState().tool)).toBe('edition');
  await touch.tap(tileCentre(page, 7, -6));
  expect(await page.evaluate(() => window.__sumflow?.buildingAt(7, -6)?.edition)).toBe('brillante');
  expect(await page.evaluate(() => window.__sumflow?.getState().editions.free.brillante)).toBe(0);
});
