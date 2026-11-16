import { expect, test } from '@playwright/test';
import { contrastIssues } from './helpers';

test('DOM text keeps a contrast of at least 4.5:1 in every screen (PLAN §9.5)', async ({
  page,
}) => {
  await page.goto('./?debug=1&seed=42');
  await page.evaluate(() => {
    const api = window.__sumflow;
    if (!api) throw new Error('debug API missing');
    api.unlockAll();
    api.deliver(1, 10);
    api.place('belt', 4, 4, 0);
    api.copy(4, 4, 4, 4);
    api.setMarker(6, 6, 'ici');
  });
  await page.keyboard.press('F3');
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport');
  await page.mouse.move(viewport.width / 2, viewport.height / 2); // tooltip of the hub
  await expect(page.locator('.tooltip')).toBeVisible();
  expect(await contrastIssues(page), 'main screen').toEqual([]);

  for (const key of ['u', 'l', 'n']) {
    await page.keyboard.press(key);
    await expect(page.locator('.panel:visible')).toHaveCount(1);
    expect(await contrastIssues(page), `panel ${key}`).toEqual([]);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('.panel:visible')).toHaveCount(0);

  await page.locator('.top-btn[data-action="menu"]').click();
  const menu = page.locator('.menu-card');
  await expect(menu).toBeVisible();
  expect(await contrastIssues(page), 'menu').toEqual([]);
  // New game, options, help, about: buttons 1, 5, 6, 7 of the main view.
  for (const index of [1, 5, 6, 7]) {
    await menu.locator('.menu-btn').nth(index).click();
    expect(await contrastIssues(page), `menu view ${index}`).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(menu.locator('.menu-btn').first()).toBeVisible();
  }
});
