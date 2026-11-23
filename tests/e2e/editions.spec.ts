import { expect, test, type Page } from '@playwright/test';
import type { DebugSnapshot } from '../../src/debug/debugApi';
import { gameUrl, tileCentre } from './helpers';

async function state(page: Page): Promise<DebugSnapshot> {
  const s = await page.evaluate(() => window.__sumflow?.getState() ?? null);
  if (!s) throw new Error('debug API missing');
  return s;
}

async function editionAt(page: Page, x: number, y: number): Promise<string | null> {
  return page.evaluate(([tx, ty]) => window.__sumflow?.editionAt(tx, ty)?.edition ?? null, [
    x,
    y,
  ] as const);
}

/** Pixels of the map canvas in a CSS rectangle that look like golden chalk. */
async function goldIn(page: Page, r: { x: number; y: number; w: number; h: number }) {
  return page.locator('canvas#world').evaluate((el: HTMLCanvasElement, rect) => {
    const ctx = el.getContext('2d');
    if (!ctx) return 0;
    const dpr = el.width / el.clientWidth;
    const data = ctx.getImageData(rect.x * dpr, rect.y * dpr, rect.w * dpr, rect.h * dpr).data;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [red = 0, green = 0, blue = 0] = [data[i], data[i + 1], data[i + 2]];
      if (red > 150 && green > 105 && blue < 110 && red > green && red - blue > 70) n++;
    }
    return n;
  }, r);
}

test('Edition tool: apply on a multiplier, undo, redo, demolish gives the card back', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto(gameUrl());
  const button = page.locator('.build-btn[data-tool="edition"]');
  await page.evaluate(() => {
    const api = window.__sumflow;
    if (!api) throw new Error('debug API missing');
    api.unlockAll();
    api.place('multiplier', 6, -6, 0);
  });
  // Hidden until the first edition card.
  await expect(button).toBeHidden();
  await page.evaluate(() => window.__sumflow?.grant('edition-legendaire'));
  await expect(button).toBeVisible();
  await expect(button.locator('.build-badge')).toHaveText('★1');

  await page.keyboard.press('g');
  expect((await state(page)).tool).toBe('edition');
  const legendary = page.locator('.variant-btn[data-variant="legendaire"]');
  const shiny = page.locator('.variant-btn[data-variant="brillante"]');
  await expect(legendary).toHaveAttribute('aria-pressed', 'true');
  await expect(legendary.locator('.variant-count')).toHaveText('1');
  await expect(shiny).toBeDisabled(); // none obtained: greyed at 0

  await page.mouse.click(...tileCentre(page, 7, -6));
  expect(await editionAt(page, 7, -6)).toBe('legendaire');
  expect((await state(page)).editions.free.legendaire).toBe(0);
  await expect(button.locator('.build-badge')).toHaveText('★0');
  await expect(legendary).toBeDisabled();

  // Undo and redo the application.
  await page.keyboard.press('Control+z');
  expect(await editionAt(page, 7, -6)).toBeNull();
  expect((await state(page)).editions.free.legendaire).toBe(1);
  await page.keyboard.press('Control+y');
  expect(await editionAt(page, 7, -6)).toBe('legendaire');
  expect((await state(page)).editions.free.legendaire).toBe(0);

  // The tooltip names the edition and its effect.
  await page.keyboard.press('Escape');
  await page.mouse.move(...tileCentre(page, 7, -6));
  await expect(page.locator('.tooltip')).toContainText('Legendary edition: speed × 1.5');
  await expect(page.locator('.tooltip')).toContainText('demolishing gives the card back');

  // Demolishing gives the card back.
  await page.keyboard.press('x');
  await page.mouse.click(...tileCentre(page, 7, -6));
  expect(await editionAt(page, 7, -6)).toBeNull();
  expect((await state(page)).editions.free.legendaire).toBe(1);
  await expect(button.locator('.build-badge')).toHaveText('★1');
  expect(errors).toEqual([]);
});

test('selection bubble: apply an edition, swap it, take it back', async ({ page }) => {
  await page.goto(gameUrl());
  await page.evaluate(() => {
    const api = window.__sumflow;
    if (!api) throw new Error('debug API missing');
    api.unlockAll();
    api.grant('edition-brillante');
    api.grant('edition-legendaire');
    api.place('adder', 6, -6, 0);
  });
  await page.mouse.click(...tileCentre(page, 6, -6));
  const bubble = page.locator('.sel-bubble');
  const btn = (action: string) => bubble.locator(`[data-action="${action}"]`);
  await expect(btn('editionBrillante')).toBeVisible();
  await expect(btn('editionLegendaire')).toBeVisible();
  await expect(btn('removeEdition')).toBeHidden();

  await btn('editionLegendaire').click();
  expect(await editionAt(page, 6, -6)).toBe('legendaire');
  await expect(btn('editionLegendaire')).toBeHidden();
  await expect(btn('removeEdition')).toBeVisible();

  // Swap: the légendaire card comes back.
  await btn('editionBrillante').click();
  expect(await editionAt(page, 6, -6)).toBe('brillante');
  expect((await state(page)).editions.free).toEqual({ brillante: 0, legendaire: 1 });

  await btn('removeEdition').click();
  expect(await editionAt(page, 6, -6)).toBeNull();
  expect((await state(page)).editions.free).toEqual({ brillante: 1, legendaire: 1 });
  await page.keyboard.press('Control+z');
  expect(await editionAt(page, 6, -6)).toBe('brillante');
});

test('a légendaire building is drawn in golden chalk', async ({ page }) => {
  await page.goto(gameUrl());
  await page.evaluate(() => {
    const api = window.__sumflow;
    if (!api) throw new Error('debug API missing');
    api.unlockAll();
    api.grant('edition-legendaire');
    api.place('adder', 6, -6, 0);
    api.place('adder', 10, -6, 0);
    const b = api.editionAt(6, -6);
    if (b) api.applyEdition(b.id, 'legendaire');
  });
  await page.mouse.move(5, 300); // no hover over them
  await page.waitForTimeout(100);
  const [gx, gy] = tileCentre(page, 6, -6);
  const [bx, by] = tileCentre(page, 10, -6);
  const golden = await goldIn(page, { x: gx - 16, y: gy - 16, w: 64, h: 64 });
  const base = await goldIn(page, { x: bx - 16, y: by - 16, w: 64, h: 64 });
  expect(golden).toBeGreaterThan(150);
  expect(base).toBeLessThan(golden / 10);
});
