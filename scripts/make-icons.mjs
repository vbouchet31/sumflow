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
  <rect width="32" height="32" fill="#26332b"/>
  <rect x="7" y="7" width="18" height="18" rx="2" fill="none" stroke="#f3e08a" stroke-width="1.4"/>
  <path d="M16.3 11.4Q15.8 16 16.1 20.7M11.4 16.3Q16 15.7 20.7 16.1" fill="none" stroke="#f2efe6" stroke-width="2.6" stroke-linecap="round"/>
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
