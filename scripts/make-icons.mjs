// Renders the install icons (PNG) from the SVG artwork below, with the Chromium that
// Playwright already provides. Run `node scripts/make-icons.mjs` after changing the artwork.
// The PNG files are committed: phones need bitmaps for the home screen icon.
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const OUT = new URL('../public/', import.meta.url);

/** The favicon as it is: rounded tile, transparent corners. */
const plain = await readFile(new URL('favicon.svg', OUT), 'utf8');

/**
 * Full-bleed variant for icons the system masks itself (Android adaptive icons, iOS): the
 * artwork stays inside the central 80 % safe zone.
 */
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="#0f1422"/>
  <rect x="7" y="7" width="18" height="18" rx="4" fill="#2b6cb0"/>
  <path d="M16 11v10M11 16h10" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/>
</svg>`;

const ICONS = [
  { file: 'icon-192.png', size: 192, svg: plain },
  { file: 'icon-512.png', size: 512, svg: plain },
  { file: 'icon-maskable-512.png', size: 512, svg: maskable },
  { file: 'apple-touch-icon.png', size: 180, svg: maskable },
];

const browser = await chromium.launch();
try {
  for (const { file, size, svg } of ICONS) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    );
    await writeFile(new URL(file, OUT), await page.screenshot({ omitBackground: true }));
    await page.close();
    console.log(`${file} (${size} × ${size})`);
  }
} finally {
  await browser.close();
}
