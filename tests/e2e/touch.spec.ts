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

  // On the map the game zooms instead, around the fingers.
  const centre = tileCentre(page, 6, 0);
  await touch.pinch(centre, 60, 180);
  expect(await pageScale(page)).toBe(1);
  const zoomed = (await state(page)).camera;
  expect(zoomed.zoom).toBeCloseTo(3, 1);
  // Tile (6.5, 0.5) was under the midpoint and still is.
  expect((centre[0] - viewport.width / 2) / (32 * zoomed.zoom) + zoomed.x).toBeCloseTo(6.5, 1);
  expect((centre[1] - viewport.height / 2) / (32 * zoomed.zoom) + zoomed.y).toBeCloseTo(0.5, 1);

  // Starting on the build bar.
  const bar = await page.locator('.build-bar').boundingBox();
  if (!bar) throw new Error('no build bar');
  await touch.pinch([viewport.width / 2, bar.y + bar.height / 2], 40, 200);
  expect(await pageScale(page)).toBe(1);
  expect((await state(page)).camera.zoom).toBe(zoomed.zoom);
});

test('without a tool one finger moves the map, two fingers move it too', async ({ page }) => {
  await page.goto('./?debug=1&seed=42');
  const touch = await touchDriver(page);
  const from = tileCentre(page, 6, 0);

  await touch.drag(from, [from[0] - 96, from[1] - 32]);
  const panned = (await state(page)).camera;
  expect(panned.x).toBeCloseTo(3, 5);
  expect(panned.y).toBeCloseTo(1, 5);
  expect(panned.zoom).toBe(1);
  expect((await state(page)).belts).toBe(0);

  // Two fingers at a constant distance: pan only.
  await touch.start([200, 150], [300, 150]);
  await touch.move([232, 182], [332, 182]);
  await touch.end();
  const moved = (await state(page)).camera;
  expect(moved.x).toBeCloseTo(2, 5);
  expect(moved.y).toBeCloseTo(0, 5);
  expect(moved.zoom).toBeCloseTo(1, 5);
});

test('a tap with a tool acts like a click', async ({ page }) => {
  await page.goto('./?debug=1&seed=42');
  const touch = await touchDriver(page);
  await page.locator('.build-btn[data-tool="belt"]').tap();
  expect((await state(page)).tool).toBe('belt');
  await touch.tap(tileCentre(page, 6, 0));
  await expect.poll(async () => (await state(page)).belts).toBe(1);
  // No finger, no hovered tile: the ghost does not stay behind.
  expect((await state(page)).hover).toBeNull();
});

test('with a tool one finger draws, and the map stays still', async ({ page }) => {
  await page.goto('./?debug=1&seed=42');
  const touch = await touchDriver(page);
  await page.locator('.build-btn[data-tool="belt"]').tap();

  await touch.drag(tileCentre(page, 5, 0), tileCentre(page, 8, 0));
  const drawn = await state(page);
  expect(drawn.belts).toBe(4);
  expect(drawn.camera).toEqual({ x: 0, y: 0, zoom: 1 });
  expect(drawn.hover).toBeNull();
});

test('a second finger abandons the drawing and takes the map', async ({ page }) => {
  await page.goto('./?debug=1&seed=42');
  const touch = await touchDriver(page);
  await page.locator('.build-btn[data-tool="belt"]').tap();
  const a = tileCentre(page, 5, 0);
  const b = tileCentre(page, 8, 0);

  await touch.start(a);
  await touch.move([a[0] + 40, a[1]]);
  await touch.move(b);
  // Second finger down: the drawing is dropped, then both fingers spread.
  await touch.start(b, [b[0], b[1] + 60]);
  await touch.move(b, [b[0], b[1] + 120]);
  // Lifting one finger must not build with the other.
  await touch.end(b);
  await touch.move([b[0] + 32, b[1]]);
  await touch.end();

  const after = await state(page);
  expect(after.belts).toBe(0);
  expect(after.undo).toBe(0);
  expect(after.camera.zoom).toBeCloseTo(2, 1);
  expect(after.tool).toBe('belt');
});

test('the mouse still works on a touch device', async ({ page }) => {
  await page.goto('./?debug=1&seed=42');
  await page.keyboard.press('1');
  const [x, y] = tileCentre(page, 5, 0);
  await page.mouse.move(x, y);
  expect((await state(page)).hover).toEqual({ x: 5, y: 0 });
  await page.mouse.down();
  await page.mouse.move(x + 64, y, { steps: 4 });
  await page.mouse.up();
  expect((await state(page)).belts).toBe(3);
});
