import { expect, test } from '@playwright/test';

interface Manifest {
  name: string;
  start_url: string;
  display: string;
  icons: { src: string; sizes: string; type: string; purpose: string }[];
}

test('the game can be installed: manifest, icons and home screen tags', async ({
  page,
  request,
}) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const manifestUrl = new URL(href ?? '', page.url());
  const response = await request.get(manifestUrl.href);
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as Manifest;
  expect(manifest.name).toBe('Sumflow');
  expect(manifest.display).toBe('fullscreen');
  // Relative, so the game installs from any path (GitHub Pages serves it under /sumflow/).
  expect(manifest.start_url).toBe('./');

  // Every icon exists, with the type and the size it claims.
  const purposes = new Set<string>();
  for (const icon of manifest.icons) {
    purposes.add(icon.purpose);
    const file = await request.get(new URL(icon.src, manifestUrl).href);
    expect(file.ok(), icon.src).toBe(true);
    expect(file.headers()['content-type'], icon.src).toContain(icon.type);
    if (icon.type !== 'image/png') continue;
    const size = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      return `${img.naturalWidth}x${img.naturalHeight}`;
    }, new URL(icon.src, manifestUrl).href);
    expect(size, icon.src).toBe(icon.sizes);
  }
  expect([...purposes].sort()).toEqual(['any', 'maskable']);
  expect(manifest.icons.some((i) => i.sizes === '192x192')).toBe(true);
  expect(manifest.icons.some((i) => i.sizes === '512x512')).toBe(true);

  const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect((await request.get(new URL(apple ?? '', page.url()).href)).ok()).toBe(true);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    'content',
    /viewport-fit=cover/,
  );
});
