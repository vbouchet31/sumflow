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
