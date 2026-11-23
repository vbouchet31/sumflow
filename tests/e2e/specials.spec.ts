import { expect, test, type Page } from '@playwright/test';
import type { DebugSnapshot } from '../../src/debug/debugApi';
import { gameUrl, tileCentre } from './helpers';

async function state(page: Page): Promise<DebugSnapshot> {
  const s = await page.evaluate(() => window.__sumflow?.getState() ?? null);
  if (!s) throw new Error('debug API missing');
  return s;
}

async function typeAt(page: Page, x: number, y: number): Promise<string | null> {
  return page.evaluate(([tx, ty]) => window.__sumflow?.buildingAt(tx, ty)?.type ?? null, [
    x,
    y,
  ] as const);
}

test('Ancient adder: tool with its counter, place, demolish, variants, paste blocked', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto(gameUrl());
  const tool = page.locator('.build-btn[data-tool="ancientAdder"]');
  const badge = tool.locator('.build-badge');
  await expect(tool).toBeHidden();
  await page.evaluate(() => window.__sumflow?.grant('ancient-adder', 'legendaire'));
  await expect(tool).toBeVisible();
  await expect(badge).toHaveText('★×1');

  // Key 0 picks the tool; a click places it, with its native edition.
  await page.keyboard.press('0');
  expect((await state(page)).tool).toBe('ancientAdder');
  await page.mouse.click(...tileCentre(page, 6, -6));
  expect(await typeAt(page, 6, -6)).toBe('ancientAdder');
  expect(await page.evaluate(() => window.__sumflow?.editionAt(6, -6))).toMatchObject({
    edition: 'legendaire',
    applied: false,
  });
  expect((await state(page)).specials['ancientAdder:legendaire']).toEqual({
    obtained: 1,
    placed: 1,
    free: 0,
  });
  await expect(badge).toHaveText('★×0');
  await expect(tool).toHaveClass(/build-btn-empty/);
  // None left: another click places nothing.
  await page.mouse.click(...tileCentre(page, 12, -6));
  expect(await typeAt(page, 12, -6)).toBeNull();

  // A second native edition owned: the variants row appears, the key cycles them.
  await page.evaluate(() => window.__sumflow?.grant('ancient-adder', 'base'));
  const base = page.locator('.variant-btn[data-native="base"]');
  const legendary = page.locator('.variant-btn[data-native="legendaire"]');
  await expect(base).toBeVisible();
  await expect(legendary).toBeDisabled();
  await expect(legendary.locator('.variant-count')).toHaveText('×0');
  await base.click();
  await expect(base).toHaveAttribute('aria-pressed', 'true');
  await expect(badge).toHaveText('×1');
  await page.keyboard.press('0');
  await expect(legendary).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('0');
  await expect(base).toHaveAttribute('aria-pressed', 'true');

  // Demolish: the légendaire copy comes back.
  await page.keyboard.press('x');
  await page.mouse.click(...tileCentre(page, 6, -6));
  expect(await typeAt(page, 6, -6)).toBeNull();
  expect((await state(page)).specials['ancientAdder:legendaire']?.free).toBe(1);
  await page.keyboard.press('Escape');
  await expect(tool).not.toHaveClass(/build-btn-empty/);

  // Paste: one copy placed, the clip pastes only while a copy is free.
  await page.evaluate(() => {
    const api = window.__sumflow;
    if (!api) throw new Error('debug API missing');
    api.place('ancientAdder', 6, -6, 0, 'legendaire');
    api.copy(6, -6, 7, -5);
  });
  expect((await state(page)).tool).toBe('paste');
  await page.mouse.click(...tileCentre(page, 14, -6));
  expect(await typeAt(page, 14, -6)).toBeNull();
  expect((await state(page)).specials['ancientAdder:legendaire']?.placed).toBe(1);
  expect(errors).toEqual([]);
});

/** Pixels of the map canvas in a CSS rectangle that match `test`. */
async function countPixels(
  page: Page,
  r: { x: number; y: number; w: number; h: number },
  kind: 'gold' | 'purple',
): Promise<number> {
  return page.locator('canvas#world').evaluate(
    (el: HTMLCanvasElement, [rect, k]) => {
      const ctx = el.getContext('2d');
      if (!ctx) return 0;
      const dpr = el.width / el.clientWidth;
      const data = ctx.getImageData(rect.x * dpr, rect.y * dpr, rect.w * dpr, rect.h * dpr).data;
      let n = 0;
      for (let i = 0; i < data.length; i += 4) {
        const [red = 0, green = 0, blue = 0] = [data[i], data[i + 1], data[i + 2]];
        const gold = red > 150 && green > 105 && blue < 110 && red > green && red - blue > 70;
        const purple = blue > green + 20 && red > green && blue > 90;
        if (k === 'gold' ? gold : purple) n++;
      }
      return n;
    },
    [r, kind] as const,
  );
}

test('an edition frames the building in its chalk, the operator keeps its colour', async ({
  page,
}) => {
  await page.goto(gameUrl());
  await page.evaluate(() => {
    const api = window.__sumflow;
    if (!api) throw new Error('debug API missing');
    api.unlockAll();
    api.grant('edition-legendaire');
    api.place('divider', 6, -6, 0);
    api.place('divider', 10, -6, 0);
    const b = api.editionAt(6, -6);
    if (b) api.applyEdition(b.id, 'legendaire');
  });
  await page.mouse.move(5, 300);
  await page.waitForTimeout(100);
  const box = (x: number, y: number) => {
    const [cx, cy] = tileCentre(page, x, y);
    return { x: cx - 16, y: cy - 16, w: 64, h: 64 };
  };
  const goldEdition = await countPixels(page, box(6, -6), 'gold');
  const goldBase = await countPixels(page, box(10, -6), 'gold');
  // The hatching inside each tile (away from the outlines and the frame).
  const inner = async (x: number, y: number): Promise<number> => {
    let n = 0;
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as const) {
      const [cx, cy] = tileCentre(page, x + dx, y + dy);
      n += await countPixels(page, { x: cx - 9, y: cy - 9, w: 18, h: 18 }, 'purple');
    }
    return n;
  };
  const purpleEdition = await inner(6, -6);
  const purpleBase = await inner(10, -6);
  // A golden frame...
  expect(goldEdition).toBeGreaterThan(150);
  expect(goldBase).toBeLessThan(goldEdition / 10);
  // ...around a divider still hatched in its own purple.
  expect(purpleBase).toBeGreaterThan(200);
  expect(purpleEdition).toBeGreaterThan(purpleBase * 0.6);
});

test('end screen: "Your picks" lists the cards level by level', async ({ page }) => {
  await page.goto(gameUrl('', 'none'));
  await page.evaluate(() => {
    const api = window.__sumflow;
    if (!api) throw new Error('debug API missing');
    const play = (cards: string[], edition?: 'legendaire') => {
      const st = api.getState();
      const r = st.levelRequirement;
      if (!r) return false;
      api.deliver(r.value, r.required - r.delivered);
      while (api.getState().pendingLevels.length > 0) {
        if (cards.length > 0) api.forceOffer(cards, edition);
        else api.offer();
        api.choose(0);
      }
      return true;
    };
    play([]);
    play([]);
    play(['ancient-adder'], 'legendaire');
    play(['edition-brillante']);
    // Then the natural cards to the end.
    for (let i = 0; i < 3000 && play([]); i++);
  });
  const end = page.locator('.end-card');
  await expect(end).toBeVisible();
  const picks = end.locator('.end-picks li');
  await expect(picks.nth(0)).toHaveText(/Lv\. 1\s*Adder/);
  await expect(picks.nth(2)).toHaveText(/Lv\. 3\s*Ancient adder \(legendary\)/);
  await expect(picks.nth(3)).toHaveText(/Lv\. 4\s*Shiny edition/);
  // Long: it scrolls inside the card, the button stays on screen.
  expect(await picks.count()).toBeGreaterThan(20);
  await expect(end.locator('.primary-btn')).toBeInViewport();
  const scrolls = await end
    .locator('.end-picks')
    .evaluate((el) => el.scrollHeight > el.clientHeight + 1);
  expect(scrolls).toBe(true);
});

test('debug panel: the weights of the next offer and the inventory', async ({ page }) => {
  await page.goto(gameUrl());
  await page.evaluate(() => {
    const api = window.__sumflow;
    if (!api) throw new Error('debug API missing');
    api.setLevel(8);
    api.grant('edition-legendaire');
    api.grant('ancient-adder', 'brillante');
  });
  const weights = page.locator('.debug-weights');
  await expect(weights).toBeHidden();
  await page.locator('.debug-toggle').click();
  await expect(weights).toBeVisible();
  await expect(weights.locator('.debug-weights-title').first()).toHaveText('Draw of level 8');
  const numbers = weights.locator('table[data-slot="nombres"]');
  await expect(numbers.locator('tr[data-card="value"]')).toBeVisible();
  await expect(
    weights.locator('table[data-slot="atelier"] tr[data-card="ancient-adder"]'),
  ).toBeVisible();
  await expect(weights.locator('.debug-inventory')).toContainText(
    'legendary edition: obtained 1, applied 0, lost 0, free 1',
  );
  await expect(weights.locator('.debug-inventory')).toContainText(
    'Ancient adder (shiny): obtained 1, placed 0, free 1',
  );
  await page.locator('.debug-toggle').click();
  await expect(weights).toBeHidden();
});
