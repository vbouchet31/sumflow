import { expect, test, type Page } from '@playwright/test';
import { tileCentre, touchDriver } from './helpers';

/** Blocks that must never cover one another on the main screen. */
const BLOCKS = [
  '.hud',
  '.top-bar',
  '.build-bar',
  '.tool-hint',
  '.tooltip',
  '.status-bar',
  '.minimap',
];

/**
 * Layout problems of the screen as it is now (PLAN-tactile §7.2), as readable strings:
 * - a control outside the screen and outside any scrollable area;
 * - a control smaller than a finger (44 px; 24 px for a checkbox, whose label is the target);
 * - a control covered by something else;
 * - two blocks of the main screen overlapping (`blocks`);
 * - the page itself scrolling sideways.
 */
async function layoutIssues(page: Page, blocks = true): Promise<string[]> {
  return page.evaluate(
    ([blockSelectors, checkBlocks]) => {
      const issues: string[] = [];
      const root = document.getElementById('ui-root');
      if (!root) return ['no #ui-root'];
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const EPS = 0.5;
      const name = (e: Element): string => {
        const data = e instanceof HTMLElement ? (e.dataset['action'] ?? e.dataset['tool']) : '';
        const text = (e.textContent ?? '').trim().slice(0, 16);
        return `${e.tagName.toLowerCase()}.${e.className}${data ? `[${data}]` : ''} "${text}"`;
      };
      const inScreen = (r: DOMRect): boolean =>
        r.left >= -EPS && r.top >= -EPS && r.right <= vw + EPS && r.bottom <= vh + EPS;
      /** Nearest ancestor that really scrolls. */
      const scroller = (e: Element): Element | null => {
        for (let p = e.parentElement; p && p !== root; p = p.parentElement) {
          const cs = getComputedStyle(p);
          const x = /auto|scroll/.test(cs.overflowX) && p.scrollWidth > p.clientWidth + 1;
          const y = /auto|scroll/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 1;
          if (x || y) return p;
        }
        return null;
      };

      const controls = root.querySelectorAll<HTMLElement>(
        'button, a[href], select, input:not([type="file"])',
      );
      for (const c of controls) {
        if (!c.checkVisibility({ visibilityProperty: true })) continue;
        const r = c.getBoundingClientRect();
        const box = scroller(c);
        const frame = box?.getBoundingClientRect();
        if (frame ? !inScreen(frame) : !inScreen(r)) {
          issues.push(`off screen: ${name(c)} at ${Math.round(r.left)},${Math.round(r.top)}`);
        }
        const checkbox = c instanceof HTMLInputElement && c.type === 'checkbox';
        const min = checkbox ? 24 : 44;
        if (r.width < min - EPS || r.height < min - EPS) {
          issues.push(`too small: ${name(c)} ${Math.round(r.width)}×${Math.round(r.height)}`);
        }
        // Covered? Only where the control is actually on screen.
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const visible =
          cx >= 0 &&
          cy >= 0 &&
          cx <= vw &&
          cy <= vh &&
          (!frame ||
            (cx >= frame.left && cx <= frame.right && cy >= frame.top && cy <= frame.bottom));
        if (visible) {
          const top = document.elementFromPoint(cx, cy);
          const label = c.id ? root.querySelector(`label[for="${c.id}"]`) : null;
          if (top && !c.contains(top) && !top.contains(c) && top !== label) {
            issues.push(`covered: ${name(c)} by ${name(top)}`);
          }
        }
      }

      if (checkBlocks) {
        const rects = blockSelectors
          .map((sel) => ({ sel, node: root.querySelector<HTMLElement>(sel) }))
          .filter(({ node }) => node?.checkVisibility({ visibilityProperty: true }))
          .map(({ sel, node }) => ({ sel, r: (node as HTMLElement).getBoundingClientRect() }));
        // An empty block (a status bar with nothing to say) takes no room.
        for (let i = rects.length - 1; i >= 0; i--) {
          const r = rects[i]?.r;
          if (r && (r.width === 0 || r.height === 0)) rects.splice(i, 1);
        }
        for (const { sel, r } of rects) {
          if (!inScreen(r)) issues.push(`block off screen: ${sel}`);
        }
        for (let i = 0; i < rects.length; i++) {
          for (let j = i + 1; j < rects.length; j++) {
            const a = rects[i];
            const b = rects[j];
            if (!a || !b) continue;
            const apart =
              a.r.right <= b.r.left + EPS ||
              b.r.right <= a.r.left + EPS ||
              a.r.bottom <= b.r.top + EPS ||
              b.r.bottom <= a.r.top + EPS;
            if (!apart) issues.push(`overlap: ${a.sel} and ${b.sel}`);
          }
        }
      }
      if (document.documentElement.scrollWidth > vw + 1) issues.push('the page scrolls sideways');
      return issues;
    },
    [BLOCKS, blocks] as const,
  );
}

async function prepare(page: Page): Promise<void> {
  await page.goto('./?debug=1&seed=42&tutorial=0');
  await page.evaluate(() => {
    const api = window.__sumflow;
    if (!api) throw new Error('debug API missing');
    api.unlockAll();
    api.setUpgrade('belt', 1);
    // Tiles that are on screen on every device, next to the hub.
    api.place('belt', 3, -2, 0);
    api.place('belt', 4, -2, 0);
    api.setMarker(4, -3, 'ici');
  });
  // The build bar shows the newly unlocked buildings on the next frame.
  await expect(page.locator('.build-btn[data-tool="bridge"]')).toBeVisible();
}

/** Layout problems of a modal dialog: what is behind it is covered on purpose. */
async function dialogIssues(page: Page): Promise<string[]> {
  return (await layoutIssues(page, false)).filter((issue) => !issue.startsWith('covered'));
}

test('new game: the tutorial card fits, then nothing overlaps and every control is reachable', async ({
  page,
}) => {
  await page.goto('./?debug=1&seed=42');
  const card = page.locator('.tut-card');
  await expect(card).toBeVisible();
  expect(await dialogIssues(page), 'tutorial card').toEqual([]);
  // The whole card is on screen, its button included.
  const box = await card.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error('no card');
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  await card.locator('.tut-ok').tap();
  await expect(card).toBeHidden();

  expect(await layoutIssues(page)).toEqual([]);
  // The compact HUD unfolds and folds back.
  const toggle = page.locator('.hud-toggle');
  if (await toggle.isVisible()) {
    await toggle.tap();
    await expect(page.locator('.hud-reward')).toBeVisible();
    expect(await layoutIssues(page)).toEqual([]);
    await toggle.tap();
    await expect(page.locator('.hud-reward')).toBeHidden();
  }
});

test('everything unlocked: tools, action bar, tooltip and pause chip all fit', async ({ page }) => {
  await prepare(page);
  const touch = await touchDriver(page);
  expect(await layoutIssues(page), 'no tool').toEqual([]);

  // Every tool of the bar can be brought into view and chosen, down to the last one.
  for (const tool of ['belt', 'exponent', 'priority', 'cut', 'marker']) {
    await page.locator(`.build-btn[data-tool="${tool}"]`).tap();
    expect(await page.evaluate(() => window.__sumflow?.getState().tool)).toBe(tool);
    expect(await layoutIssues(page), `tool ${tool}`).toEqual([]);
  }
  await page.locator('.hint-btn[data-action="quit"]').tap();

  // Paste mode with two clipboard entries: the action bar at its widest.
  await page.evaluate(() => {
    window.__sumflow?.copy(3, -2, 3, -2);
    window.__sumflow?.copy(3, -2, 4, -2);
  });
  await expect(page.locator('.hint-btn[data-action="nextClip"]')).toBeVisible();
  expect(await layoutIssues(page), 'paste').toEqual([]);
  await page.locator('.hint-btn[data-action="quit"]').tap();

  // Pinned tooltip and pause chip.
  await page.locator('.top-btn[data-action="pause"]').tap();
  await touch.tap(tileCentre(page, 3, -2));
  await expect(page.locator('.tooltip')).toBeVisible();
  await expect(page.locator('.status-paused')).toBeVisible();
  expect(await layoutIssues(page), 'tooltip and pause').toEqual([]);

  // Everything at once, with the minimap opened by its button.
  await page.locator('.minimap-open').tap();
  await expect(page.locator('.minimap-canvas')).toBeVisible();
  expect(await layoutIssues(page), 'minimap open').toEqual([]);
});

test('panels open as sheets inside the screen', async ({ page }) => {
  await prepare(page);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport');
  for (const action of ['levels', 'upgrades', 'delivered']) {
    const button = page.locator(`.top-btn[data-action="${action}"]`);
    // On a narrow screen these buttons are folded behind "more".
    if (!(await button.isVisible())) await page.locator('.top-more-btn').tap();
    await button.tap();
    const panel = page.locator('.panel:visible');
    await expect(panel).toHaveCount(1);
    const box = await panel.boundingBox();
    if (!box) throw new Error('no panel');
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    // Inside the panel everything is reachable; what it covers is checked once it closes.
    const inside = await layoutIssues(page, false);
    expect(
      inside.filter((issue) => !issue.startsWith('covered')),
      `panel ${action}`,
    ).toEqual([]);
    await panel.locator('.panel-close').tap();
    await expect(page.locator('.panel:visible')).toHaveCount(0);
  }
  expect(await layoutIssues(page)).toEqual([]);
});

test('menu, options and the marker editor fit and are finger sized', async ({ page }) => {
  await prepare(page);
  const touch = await touchDriver(page);
  const controls = async (label: string): Promise<void> => {
    const issues = await layoutIssues(page, false);
    // Whatever is behind a modal dialog is covered on purpose.
    expect(
      issues.filter((issue) => !issue.startsWith('covered')),
      label,
    ).toEqual([]);
  };

  await page.locator('.top-btn[data-action="menu"]').tap();
  const menu = page.locator('.menu-card');
  await expect(menu).toBeVisible();
  await controls('menu');
  // New game, options, help, about: buttons 1, 5, 6, 7 of the main view.
  for (const index of [1, 5, 6, 7]) {
    await menu.locator('.menu-btn').nth(index).tap();
    await controls(`menu view ${index}`);
    await menu.locator('.menu-header .secondary-btn').tap();
    await expect(menu.locator('.menu-btn').first()).toBeVisible();
  }
  await menu.locator('.menu-btn').first().tap();
  await expect(menu).toBeHidden();

  // Every tutorial card can be replayed from the Help view, and fits.
  await page.locator('.top-btn[data-action="menu"]').tap();
  await menu.locator('.menu-btn').nth(6).tap();
  const tips = menu.locator('.help-tip');
  expect(await tips.count()).toBeGreaterThan(5);
  for (const tip of ['start', 'divider', 'upgrades']) {
    await menu.locator(`.help-tip[data-tip="${tip}"]`).tap();
    const card = page.locator(`.tut-card[data-tip="${tip}"]`);
    await expect(card).toBeVisible();
    await controls(`tutorial ${tip}`);
    await card.locator('.tut-ok').tap();
    await expect(card).toBeHidden();
    await page.locator('.top-btn[data-action="menu"]').tap();
    await menu.locator('.menu-btn').nth(6).tap();
  }
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  // Editing the marker: the dialog sits where an on-screen keyboard would not hide it.
  await touch.tap(tileCentre(page, 4, -3));
  const input = page.locator('.marker-input');
  await expect(input).toBeFocused();
  await controls('marker editor');
  const box = await input.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error('no marker input');
  expect(box.y + box.height).toBeLessThan(Math.max(viewport.height / 2, 120));
  // No zoom on focus: the field text is at least 16 px.
  expect(await input.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBe(16);
});
