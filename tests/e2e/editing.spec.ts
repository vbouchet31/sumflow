import { expect, test } from '@playwright/test';

test('copy, paste and undo with the mouse and keyboard', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./?debug=1&seed=42&tutorial=0');
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport');
  // Tile (tx, ty) centre on screen at zoom 1, camera on the hub.
  const at = (tx: number, ty: number): [number, number] => [
    viewport.width / 2 + tx * 32 + 16,
    viewport.height / 2 + ty * 32 + 16,
  ];

  await page.evaluate(() => {
    const api = window.__sumflow;
    if (!api) throw new Error('debug API missing');
    api.unlockAll();
    api.place('adder', 6, -6, 0);
    api.beltPath(6, -4, 6, -2);
  });
  const before = await page.evaluate(() => window.__sumflow?.layout() ?? '');

  // Ctrl+C, then drag over the adder and its belts.
  await page.keyboard.press('Control+c');
  await page.mouse.move(...at(6, -6));
  await page.mouse.down();
  await page.mouse.move(...at(7, -2), { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('.tool-hint')).toContainText('1 / 1');
  expect(await page.evaluate(() => window.__sumflow?.getState().tool)).toBe('paste');

  // Mirror, then click to paste further right.
  await page.keyboard.press('f');
  await page.mouse.move(...at(12, -4));
  await page.mouse.down();
  await page.mouse.up();
  const pasted = await page.evaluate(() => window.__sumflow?.getState());
  expect(pasted?.buildings).toBe(3);
  expect(pasted?.undo).toBe(3);

  // Undo with the keyboard, redo with the top bar button, undo again.
  await page.keyboard.press('Control+z');
  expect(await page.evaluate(() => window.__sumflow?.layout())).toBe(before);
  await page.locator('.top-btn[data-action="redo"]').click();
  expect(await page.evaluate(() => window.__sumflow?.getState().buildings)).toBe(3);
  await page.keyboard.press('Control+Shift+z'); // redo again: nothing left to redo
  await page.keyboard.press('Control+z');
  expect(await page.evaluate(() => window.__sumflow?.layout())).toBe(before);
  expect(errors).toEqual([]);
});

test('placing, editing and deleting a marker', async ({ page }) => {
  await page.goto('./?debug=1&seed=42&tutorial=0');
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport');
  const x = viewport.width / 2 + 8 * 32 + 16;
  const y = viewport.height / 2 + 16;

  await page.keyboard.press('b');
  await page.mouse.click(x, y);
  const input = page.locator('.marker-input');
  await expect(input).toBeFocused();
  await input.fill('Usine de 7');
  await input.press('Enter');
  await expect(input).toBeHidden();
  expect(await page.evaluate(() => window.__sumflow?.getState().markers)).toEqual([
    { x: 8, y: 0, text: 'Usine de 7' },
  ]);

  // Clicking the marker again with no tool edits it; Delete removes it.
  await page.keyboard.press('Escape');
  await page.mouse.click(x, y);
  await expect(input).toHaveValue('Usine de 7');
  await page.locator('.marker-card .danger').click();
  expect(await page.evaluate(() => window.__sumflow?.getState().markers)).toEqual([]);
  await page.keyboard.press('Control+z');
  expect(await page.evaluate(() => window.__sumflow?.getState().markers.length)).toBe(1);
});

test('without a tool, dragging a building moves it with its belts; R rotates it', async ({
  page,
}) => {
  await page.goto('./?debug=1&seed=42&tutorial=0');
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport');
  const at = (tx: number, ty: number): [number, number] => [
    viewport.width / 2 + tx * 32 + 16,
    viewport.height / 2 + ty * 32 + 16,
  ];
  await page.evaluate(() => {
    const api = window.__sumflow;
    if (!api) throw new Error('debug API missing');
    api.unlockAll();
    api.place('adder', 6, -6, 0);
    api.beltPath(3, -6, 5, -6); // → A, from the West
  });
  const layout = () => page.evaluate(() => window.__sumflow?.layout());
  const snapshot = () => page.evaluate(() => window.__sumflow?.getState());
  const before = await layout();

  await page.mouse.move(...at(6, -6));
  await page.mouse.down();
  await page.mouse.move(...at(9, -6), { steps: 6 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.__sumflow?.buildingAt(9, -6))).toEqual({
    type: 'adder',
    x: 9,
    y: -6,
    rot: 0,
  });
  // The belt followed: it now runs on to the new A port.
  const belts = await page.evaluate(() => [
    window.__sumflow?.beltAt(5, -6),
    window.__sumflow?.beltAt(8, -6),
  ]);
  expect(belts).toEqual([2, 2]);
  // The moved building is selected; R rotates it in place, belts included.
  expect((await snapshot())?.selection).toEqual({ x0: 9, y0: -6, x1: 10, y1: -5 });
  await page.keyboard.press('r');
  expect((await page.evaluate(() => window.__sumflow?.buildingAt(9, -6)))?.rot).toBe(1);
  expect((await snapshot())?.undo).toBe(4);

  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect(await layout()).toBe(before);
  // Escape drops the selection before opening the menu.
  await page.mouse.click(...at(6, -6));
  expect((await snapshot())?.selection).not.toBeNull();
  await page.keyboard.press('Escape');
  expect((await snapshot())?.selection).toBeNull();
  await expect(page.locator('.menu-card')).toBeHidden();
});

test('the bubble next to a selected building rotates, copies and deletes it', async ({ page }) => {
  await page.goto('./?debug=1&seed=42&tutorial=0');
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport');
  const at = (tx: number, ty: number): [number, number] => [
    viewport.width / 2 + tx * 32 + 16,
    viewport.height / 2 + ty * 32 + 16,
  ];
  const topRow = Math.floor(-viewport.height / 2 / 32);
  await page.evaluate((top) => {
    const api = window.__sumflow;
    if (!api) throw new Error('debug API missing');
    api.unlockAll();
    api.place('multiplier', 8, -4, 1); // vertical, (8, -4) to (8, -2)
    api.place('adder', -1, top + 1, 0); // against the top of the screen
    api.beltPath(12, 2, 14, 2);
  }, topRow);
  const bubble = page.locator('.sel-bubble');
  const action = (id: string) => bubble.locator(`[data-action="${id}"]`);
  const state = () => page.evaluate(() => window.__sumflow?.getState());
  // Every multiplier on screen, once each.
  const multipliers = () =>
    page.evaluate(() => {
      const found = new Map<string, { x: number; y: number; rot: number }>();
      for (let y = -8; y <= 8; y++) {
        for (let x = 4; x <= 18; x++) {
          const b = window.__sumflow?.buildingAt(x, y);
          if (b?.type === 'multiplier') found.set(`${b.x},${b.y}`, b);
        }
      }
      return [...found.values()];
    });

  // Select: the bubble sits above the building, with its three actions.
  await page.mouse.click(...at(8, -3));
  await expect(bubble).toBeVisible();
  await expect(action('rotate')).toBeVisible();
  await expect(action('copy')).toBeVisible();
  await expect(action('delete')).toBeVisible();
  const box = await bubble.boundingBox();
  expect(box && box.y + box.height).toBeLessThanOrEqual(at(8, -4)[1] - 16);

  // Rotate in place, twice: back to vertical (rotation 3).
  await action('rotate').click();
  await action('rotate').click();
  expect((await page.evaluate(() => window.__sumflow?.buildingAt(8, -3)))?.rot).toBe(3);

  // Copy: paste mode with the same orientation, then a click places the copy.
  await action('copy').click();
  expect((await state())?.tool).toBe('paste');
  await expect(bubble).toBeHidden();
  await page.mouse.move(...at(14, 4));
  await page.mouse.down();
  await page.mouse.up();
  await page.keyboard.press('Escape');
  const copies = await multipliers();
  expect(copies).toHaveLength(2);
  expect(copies.every((b) => b.rot === 3)).toBe(true);

  // Delete.
  await page.mouse.click(...at(8, -3));
  await action('delete').click();
  expect(await page.evaluate(() => window.__sumflow?.buildingAt(8, -3))).toBeNull();
  await expect(bubble).toBeHidden();

  // Against the top of the screen, the bubble goes below the building.
  await page.mouse.click(...at(-1, topRow + 1));
  await expect(bubble).toBeVisible();
  const below = await bubble.boundingBox();
  expect(below?.y).toBeGreaterThan(at(-1, topRow + 2)[1]);
  await expect(action('rotate')).toBeVisible();

  // A belt has no bubble: its actions stay in the bar at the bottom.
  await page.mouse.click(...at(13, 2));
  expect((await state())?.selection).not.toBeNull();
  await expect(bubble).toBeHidden();
  await expect(page.locator('.tool-hint [data-action="delete"]')).toBeVisible();
});

test('select tool: a zone, then copy with Ctrl+C or cut from the selection tray', async ({
  page,
}) => {
  await page.goto('./?debug=1&seed=42&tutorial=0');
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport');
  const at = (tx: number, ty: number): [number, number] => [
    viewport.width / 2 + tx * 32 + 16,
    viewport.height / 2 + ty * 32 + 16,
  ];
  const tray = page.locator('.sel-tray');
  const trayBtn = (a: string) => tray.locator(`.build-btn[data-action="${a}"]`);
  await page.evaluate(() => window.__sumflow?.beltPath(6, -4, 9, -4));

  // Nothing selected, empty clipboard: no tray, and no copy, cut or paste in the bar.
  await expect(tray).toBeHidden();
  await expect(page.locator('.build-bar [data-tool="copy"]')).toHaveCount(0);

  const select = async (): Promise<void> => {
    await page.locator('.build-btn[data-tool="select"]').click();
    await page.mouse.move(...at(6, -4));
    await page.mouse.down();
    await page.mouse.move(...at(9, -4), { steps: 4 });
    await page.mouse.up();
  };
  await select();
  await expect(page.locator('.tool-hint')).toContainText('4 × 1');
  await expect(trayBtn('copy')).toBeVisible();
  await expect(trayBtn('cut')).toBeVisible();
  await expect(trayBtn('paste')).toBeHidden();

  // Ctrl+C copies the selected zone at once.
  await page.keyboard.press('Control+c');
  let s = await page.evaluate(() => window.__sumflow?.getState());
  expect(s?.tool).toBe('paste');
  expect(s?.clipboard).toBe(1);
  await expect(trayBtn('paste')).toHaveAttribute('aria-pressed', 'true');

  // Cut from the tray: the belts go, a second clipboard entry.
  await select();
  await trayBtn('cut').click();
  s = await page.evaluate(() => window.__sumflow?.getState());
  expect(s?.belts).toBe(0);
  expect(s?.clipboard).toBe(2);
  expect(s?.tool).toBe('paste');

  // Paste stays offered while the clipboard holds something.
  await page.keyboard.press('Escape');
  await expect(trayBtn('paste')).toBeVisible();
  await expect(trayBtn('copy')).toBeHidden();
});

test('chalk effects: dust when building, a sponge when demolishing, never on load', async ({
  page,
}) => {
  await page.goto('./?debug=1&seed=42&tutorial=0');
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport');
  const at = (tx: number, ty: number): [number, number] => [
    viewport.width / 2 + tx * 32 + 16,
    viewport.height / 2 + ty * 32 + 16,
  ];
  const effects = () => page.evaluate(() => window.__sumflow?.effects() ?? null);
  await page.evaluate(() => window.__sumflow?.unlockAll());

  // Placing an adder with the mouse raises a puff of dust.
  await page.keyboard.press('3');
  await page.mouse.click(...at(8, -6));
  expect((await effects())?.grains).toBeGreaterThan(0);
  // Pause: the effects play all the same (they follow real time, not ticks).
  await page.keyboard.press('Escape');
  await page.keyboard.press(' ');
  await page.mouse.move(...at(8, -6));
  await page.keyboard.press('Delete');
  expect((await effects())?.effects).toBeGreaterThan(0);
  await expect.poll(effects, { timeout: 4000 }).toEqual({ effects: 0, grains: 0 });

  // Building through the debug API (as a save or an import does) plays nothing.
  await page.evaluate(() => {
    window.__sumflow?.place('adder', 8, -6, 0);
    window.__sumflow?.beltPath(8, -4, 8, 0);
  });
  expect(await effects()).toEqual({ effects: 0, grains: 0 });
  await page.evaluate(() => window.__sumflow?.save());
  await page.reload();
  await page.waitForFunction(() => window.__sumflow !== undefined);
  expect(await page.evaluate(() => window.__sumflow?.getState().buildings)).toBeGreaterThan(1);
  expect(await effects()).toEqual({ effects: 0, grains: 0 });

  // "Reduce motion": no effect at all.
  await page.evaluate(() =>
    localStorage.setItem('sumflow.settings', JSON.stringify({ reduceMotion: true })),
  );
  await page.reload();
  await page.waitForFunction(() => window.__sumflow !== undefined);
  await page.keyboard.press('x');
  await page.mouse.move(...at(6, -7));
  await page.mouse.down();
  await page.mouse.move(...at(10, 1), { steps: 4 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.__sumflow?.getState().buildings)).toBe(1);
  expect(await effects()).toEqual({ effects: 0, grains: 0 });
});
