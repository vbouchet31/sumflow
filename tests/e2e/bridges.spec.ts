import { expect, test } from '@playwright/test';

test('drawing across a straight belt creates a bridge (once unlocked)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./?debug=1&seed=42&tutorial=0');
  await page.evaluate(() => {
    window.__sumflow?.unlockAll();
    window.__sumflow?.beltPath(12, -4, 12, 4); // vertical line, straight through (12, 0)
  });

  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport');
  const tile = (tx: number, ty: number) => ({
    x: viewport.width / 2 + tx * 32 + 16,
    y: viewport.height / 2 + ty * 32 + 16,
  });
  await page.keyboard.press('Digit1');
  const a = tile(9, 0);
  const b = tile(15, 0);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();

  const state = await page.evaluate(() => window.__sumflow?.getState());
  expect(state?.bridges).toBe(1);
  expect(state?.belts).toBe(9 - 1 + 6); // vertical 9 minus the bridged tile, plus 6 new
  await expect(page.locator('.build-btn[data-tool="bridge"]')).toBeVisible();
  expect(errors).toEqual([]);
});
