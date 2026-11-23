import { devices, expect, type Page, test } from '@playwright/test';
import { gameUrl } from './helpers';

/**
 * Reward choice screen (PLAN-recompenses §4.2, §4.4, §5.5): opening rules, flipping and
 * choosing with the mouse, the keyboard and a finger, "See the map" and the badge, several
 * offers in a row, reload, and the phone layout.
 */
test.use({ locale: 'fr-FR' });

const URL = gameUrl('', 'none');

/** Complete the next `n` levels at once (as many deliveries as each requires). */
async function completeLevels(page: Page, n: number): Promise<void> {
  await page.evaluate((count) => {
    const api = window.__sumflow;
    if (!api) throw new Error('debug API missing');
    for (let i = 0; i < count; i++) {
      const r = api.getState().levelRequirement;
      if (!r) throw new Error('no level to complete');
      api.deliver(r.value, r.required - r.delivered);
    }
  }, n);
}

const pending = (page: Page): Promise<number[] | undefined> =>
  page.evaluate(() => window.__sumflow?.getState().pendingLevels);

/** Let a few frames run: the screen opens (or not) on the next frame. */
const frames = (page: Page): Promise<void> => page.waitForTimeout(300);

test('opens at the end of level 3, not after levels 1 and 2', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto(URL);
  const screen = page.locator('.offer-overlay');

  await completeLevels(page, 1);
  await frames(page);
  await expect(screen).toBeHidden();
  await completeLevels(page, 1);
  await frames(page);
  await expect(screen).toBeHidden();
  expect(await pending(page)).toEqual([]);

  await completeLevels(page, 1);
  await expect(screen).toBeVisible();
  await expect(screen).toHaveAttribute('role', 'dialog');
  await expect(screen).toHaveAttribute('aria-modal', 'true');
  await expect(screen.locator('.offer-kicker')).toHaveText('Niveau 3 terminé');
  await expect(screen.locator('.offer-title')).toHaveText('Choisis ta récompense');
  await expect(screen.locator('.offer-intro')).toBeVisible();
  await expect(screen.locator('.offer-count')).toBeHidden(); // a single offer waits
  const cards = screen.locator('.offer-card');
  await expect(cards).toHaveCount(2);
  // The game keeps running behind (no pause), and the first card has the focus.
  expect(await page.evaluate(() => window.__sumflow?.getState().paused)).toBe(false);
  await expect(cards.first()).toBeFocused();

  // Each card: a button named after it, its back as description, and its own Choose button.
  const offer = await page.evaluate(() => window.__sumflow?.offer().current);
  expect(offer?.level).toBe(3);
  for (let i = 0; i < 2; i++) {
    const card = cards.nth(i);
    await expect(card).toHaveAttribute('data-card', offer?.cards[i]?.card ?? '');
    await expect(card).toHaveAttribute('aria-pressed', 'false');
    const name = (await card.getAttribute('aria-label')) ?? '';
    const back = page.locator(`#${await card.getAttribute('aria-describedby')}`);
    await expect(back).toContainText(name);
    await expect(screen.locator('.offer-choose').nth(i)).toHaveAttribute(
      'aria-label',
      `Choisir ${name}`,
    );
  }
  expect(errors).toEqual([]);
});

test('Choose stays off for about 400 ms, then one click takes the card', async ({ page }) => {
  await page.goto(URL);
  await completeLevels(page, 2);
  // Measured in the page: the buttons are off as the screen appears, a click does nothing.
  const timing = await page.evaluate(async () => {
    const api = window.__sumflow;
    if (!api) throw new Error('debug API missing');
    const r = api.getState().levelRequirement;
    if (!r) throw new Error('no level');
    api.deliver(r.value, r.required);
    const overlay = document.querySelector<HTMLElement>('.offer-overlay');
    await new Promise<void>((resolve) => {
      const wait = (): void =>
        overlay?.hidden === false ? resolve() : void requestAnimationFrame(wait);
      wait();
    });
    const opened = performance.now();
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.offer-choose')];
    const offAtOpen = buttons.map((b) => b.disabled);
    buttons[0]?.click();
    const pendingAfterClick = api.getState().pendingLevels.length;
    await new Promise<void>((resolve) => {
      const wait = (): void =>
        buttons[0]?.disabled ? void requestAnimationFrame(wait) : resolve();
      wait();
    });
    return { offAtOpen, pendingAfterClick, enabledAfter: performance.now() - opened };
  });
  expect(timing.offAtOpen).toEqual([true, true]);
  expect(timing.pendingAfterClick).toBe(1);
  expect(timing.enabledAfter).toBeGreaterThanOrEqual(350);
  expect(timing.enabledAfter).toBeLessThan(2000);

  const name = await page.locator('.offer-card').first().getAttribute('aria-label');
  await page.locator('.offer-choose').first().click();
  await expect(page.locator('.offer-overlay')).toBeHidden();
  await expect(page.locator('.toast', { hasText: `Obtenu : ${name}` })).toBeVisible();
  expect(await pending(page)).toEqual([]);
  expect(await page.evaluate(() => window.__sumflow?.getState().picks)).toBe(3);
});

test('a card turns over with a click, Enter or Space, and back; Choose works turned over', async ({
  page,
}) => {
  await page.goto(URL);
  await completeLevels(page, 3);
  const cards = page.locator('.offer-card');
  const first = cards.first();
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(first).toHaveClass(/is-flipped/);
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'false');

  await first.focus();
  await page.keyboard.press('Enter');
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect(first).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => window.__sumflow?.getState().paused)).toBe(false);

  // The second card, turned over: its back shows the slot, what it gives and its tags.
  const second = cards.nth(1);
  await second.click();
  const back = second.locator('.offer-back');
  await expect(back.locator('.offer-slot-name')).not.toBeEmpty();
  await expect(back.locator('.offer-gives')).not.toBeEmpty();
  await expect(back.locator('.offer-tag-new')).toHaveText('Nouveau');
  const name = await second.getAttribute('aria-label');
  await page.locator('.offer-choose').nth(1).click();
  await expect(page.locator('.offer-overlay')).toBeHidden();
  await expect(page.locator('.toast', { hasText: `Obtenu : ${name}` })).toBeVisible();
});

test('keyboard: Tab order, digits never choose, Escape shows the map, the badge and the hub reopen', async ({
  page,
}) => {
  await page.goto(URL);
  await completeLevels(page, 3);
  const screen = page.locator('.offer-overlay');
  const cards = screen.locator('.offer-card');
  const choose = screen.locator('.offer-choose');
  await expect(choose.first()).toBeEnabled();

  // Tab: card, its button, the next card, its button, See the map, then round again.
  await expect(cards.first()).toBeFocused();
  for (const next of [
    choose.first(),
    cards.nth(1),
    choose.nth(1),
    screen.locator('.offer-later'),
  ]) {
    await page.keyboard.press('Tab');
    await expect(next).toBeFocused();
  }
  await page.keyboard.press('Tab');
  await expect(cards.first()).toBeFocused();

  // Digits are building shortcuts: they neither choose a card nor reach the game.
  for (let d = 1; d <= 9; d++) await page.keyboard.press(`Digit${d}`);
  await choose.first().focus();
  for (let d = 1; d <= 9; d++) await page.keyboard.press(`Digit${d}`);
  await frames(page);
  await expect(screen).toBeVisible();
  expect(await pending(page)).toEqual([3]);
  expect(await page.evaluate(() => window.__sumflow?.getState().tool)).toBe('none');

  // Escape = See the map: the offer stays pending, the badge appears, nothing reopens alone.
  await page.keyboard.press('Escape');
  await expect(screen).toBeHidden();
  const badge = page.locator('.top-reward');
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute('aria-label', 'Récompense à choisir');
  await frames(page);
  await expect(screen).toBeHidden();
  expect(await pending(page)).toEqual([3]);
  // Digits work again on the map.
  await page.keyboard.press('Digit1');
  expect(await page.evaluate(() => window.__sumflow?.getState().tool)).toBe('belt');
  await page.keyboard.press('Escape');

  await badge.click();
  await expect(screen).toBeVisible();
  await expect(badge).toBeHidden();
  await expect(screen.locator('.offer-intro')).toBeHidden(); // shown once only
  await expect(screen.locator('.offer-later')).toBeEnabled();
  await screen.locator('.offer-later').click();
  await expect(screen).toBeHidden();

  // A click on the hub (centre of the screen) opens it again too.
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport');
  await page.mouse.click(viewport.width / 2, viewport.height / 2);
  await expect(screen).toBeVisible();
});

test('two offers waiting: 1 / 2, then 2 / 2 drawn after the first choice', async ({ page }) => {
  await page.goto(URL);
  await page.evaluate(() => window.__sumflow?.setLevel(6));
  await completeLevels(page, 2);
  // The first offer offers Éventail: taking it gives the next offer a third card.
  await page.evaluate(() => window.__sumflow?.forceOffer(['value', 'eventail']));
  const screen = page.locator('.offer-overlay');
  await expect(screen).toBeVisible();
  await expect(screen.locator('.offer-count')).toHaveText('1 / 2');
  await expect(screen.locator('.offer-kicker')).toHaveText('Niveau 6 terminé');
  await expect(screen.locator('.offer-card')).toHaveCount(2);
  await expect(screen.locator('.offer-card').nth(1)).toHaveAttribute('data-card', 'eventail');
  await screen.locator('.offer-card').nth(1).click();
  await expect(screen.locator('.offer-tag-unique')).toHaveText('Unique');
  let state = await page.evaluate(() => window.__sumflow?.offer());
  expect(state?.pendingLevels).toEqual([6, 7]);
  expect(state?.current?.level).toBe(6);

  await expect(screen.locator('.offer-choose').nth(1)).toBeEnabled();
  // The next offer comes at once, its buttons off again (a double click must not take it).
  const offAgain = await page.evaluate(() => {
    document.querySelectorAll<HTMLButtonElement>('.offer-choose')[1]?.click();
    return [...document.querySelectorAll<HTMLButtonElement>('.offer-choose')].map(
      (b) => b.disabled,
    );
  });
  expect(offAgain).toEqual([true, true, true]);
  await expect(screen).toBeVisible();
  await expect(screen.locator('.offer-count')).toHaveText('2 / 2');
  await expect(screen.locator('.offer-kicker')).toHaveText('Niveau 7 terminé');
  await expect(screen.locator('.offer-card')).toHaveCount(3);
  state = await page.evaluate(() => window.__sumflow?.offer());
  expect(state?.pendingLevels).toEqual([7]);
  expect(state?.current?.cards).toHaveLength(3);
  await expect(screen.locator('.offer-choose').first()).toBeEnabled();
  await screen.locator('.offer-choose').first().click();
  await expect(screen).toBeHidden();
  expect(await pending(page)).toEqual([]);
});

test('a reload shows the same offer again', async ({ page }) => {
  await page.goto(URL);
  await completeLevels(page, 3);
  const screen = page.locator('.offer-overlay');
  await expect(screen).toBeVisible();
  const ids = await screen
    .locator('.offer-card')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-card')));
  await page.evaluate(() => window.__sumflow?.save());
  await page.reload();
  await expect(screen).toBeVisible();
  expect(
    await screen
      .locator('.offer-card')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-card'))),
  ).toEqual(ids);
  await expect(screen.locator('.offer-intro')).toBeHidden();
});

test('waits while the menu is open, then while a belt is being drawn', async ({ page }) => {
  await page.goto(URL);
  await completeLevels(page, 2);
  const screen = page.locator('.offer-overlay');

  // Menu open: the screen waits until it closes.
  await page.keyboard.press('Escape');
  await expect(page.locator('.menu-card')).toBeVisible();
  await completeLevels(page, 1);
  await frames(page);
  await expect(screen).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('.menu-card')).toBeHidden();
  await expect(screen).toBeVisible();
  await page.locator('.offer-choose').first().click();
  await expect(screen).toBeHidden();

  // A belt drag in progress: the screen waits for the button to be released.
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport');
  const y = viewport.height / 2 + 32 * 4 + 16;
  const x0 = viewport.width / 2 + 32 * 6 + 16;
  await page.keyboard.press('Digit1');
  await page.mouse.move(x0, y);
  await page.mouse.down();
  await page.mouse.move(x0 + 64, y, { steps: 4 });
  await completeLevels(page, 1);
  await frames(page);
  await expect(screen).toBeHidden();
  await page.mouse.move(x0 + 128, y, { steps: 4 });
  await page.mouse.up();
  await expect(screen).toBeVisible();
  // The drag was not interrupted: its belts were built.
  expect(await page.evaluate(() => window.__sumflow?.getState().belts)).toBeGreaterThanOrEqual(5);
});

test('reduced motion: the card swaps faces at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(URL);
  await completeLevels(page, 3);
  const inner = page.locator('.offer-card-inner').first();
  await expect(inner).toBeVisible();
  expect(await inner.evaluate((e) => getComputedStyle(e).transitionDuration)).toBe('0s');
  expect(
    await page.locator('.offer-sheet').evaluate((e) => getComputedStyle(e).animationName),
  ).toBe('none');
});

test.describe('on a phone held sideways', () => {
  // The device without its browser type (the project's Chromium runs it).
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } =
    devices['iPhone 13 landscape'];
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

  test('a tap turns a card over and back, another chooses it', async ({ page }) => {
    await page.goto(URL);
    await completeLevels(page, 3);
    const card = page.locator('.offer-card').first();
    await card.tap();
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    await card.tap();
    await expect(card).toHaveAttribute('aria-pressed', 'false');
    const choose = page.locator('.offer-choose').first();
    await expect(choose).toBeEnabled();
    await choose.tap();
    await expect(page.locator('.offer-overlay')).toBeHidden();
    expect(await pending(page)).toEqual([]);
  });

  test('fits in 342 px, three cards included, without horizontal scroll', async ({ page }) => {
    await page.goto(URL);
    await page.evaluate(() => window.__sumflow?.setLevel(8));
    await completeLevels(page, 1);
    await page.evaluate(() =>
      window.__sumflow?.forceOffer(['value', 'edition-legendaire', 'ancient-adder'], 'legendaire'),
    );
    const screen = page.locator('.offer-overlay');
    await expect(screen.locator('.offer-card')).toHaveCount(3);
    await expect(screen.locator('.offer-choose').first()).toBeEnabled();
    // Every card turned over: the back is the taller face.
    for (const card of await screen.locator('.offer-card').all()) await card.tap();
    const box = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      width: innerWidth,
      height: innerHeight,
      sheetScroll: (() => {
        const s = document.querySelector('.offer-sheet');
        return s ? s.scrollHeight - s.clientHeight : -1;
      })(),
    }));
    expect(box.height).toBe(342);
    expect(box.scroll).toBeLessThanOrEqual(box.width);
    expect(box.sheetScroll).toBeLessThanOrEqual(0);
    for (const el of await screen
      .locator('.offer-card, .offer-choose, .offer-later, .offer-art')
      .all()) {
      const b = await el.boundingBox();
      if (!b) throw new Error('not laid out');
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(box.width);
      expect(b.y + b.height).toBeLessThanOrEqual(box.height);
    }
    // Finger-sized buttons; the front keeps its picture.
    const chooseBox = await screen.locator('.offer-choose').first().boundingBox();
    expect(chooseBox?.height).toBeGreaterThanOrEqual(44);
    const art = await screen.locator('.offer-art').first().boundingBox();
    expect(art?.height).toBeGreaterThanOrEqual(48);
  });
});

test('tutorial cards come first: the offer waits for them, the next offer for the new one', async ({
  page,
}) => {
  await page.goto('./?debug=1&seed=42&pick=none');
  const tutorial = page.locator('.tut-overlay');
  const screen = page.locator('.offer-overlay');
  /** Close the tutorial cards one after the other. */
  const closeCards = async (): Promise<void> => {
    while (await tutorial.isVisible()) {
      await page.locator('.tut-ok').click();
      await frames(page);
    }
  };
  // Levels 1 and 2 bring the adder and the upgrades: their cards wait, with the start card.
  await page.evaluate(() => window.__sumflow?.setLevel(3));
  await completeLevels(page, 2);
  await expect(tutorial).toBeVisible();
  await frames(page);
  await expect(screen).toBeHidden();
  await closeCards();
  await expect(screen).toBeVisible();
  await expect(screen.locator('.offer-count')).toHaveText('1 / 2');

  // Taking the bridge brings its card: it shows before the second offer.
  await page.evaluate(() => window.__sumflow?.forceOffer(['value', 'bridge']));
  await expect(screen.locator('.offer-card').nth(1)).toHaveAttribute('data-card', 'bridge');
  await expect(screen.locator('.offer-choose').nth(1)).toBeEnabled();
  await screen.locator('.offer-choose').nth(1).click();
  await expect(screen).toBeHidden();
  await expect(page.locator('.tut-card')).toHaveAttribute('data-tip', 'bridge');
  await closeCards();
  await expect(screen).toBeVisible();
  await expect(screen.locator('.offer-count')).toHaveText('2 / 2');
});

test('after See the map, the next completed level opens the screen again', async ({ page }) => {
  await page.goto(URL);
  await completeLevels(page, 3);
  const screen = page.locator('.offer-overlay');
  await expect(screen).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(screen).toBeHidden();
  await completeLevels(page, 1);
  await expect(screen).toBeVisible();
  // The oldest offer comes first.
  await expect(screen.locator('.offer-kicker')).toHaveText('Niveau 3 terminé');
  await expect(screen.locator('.offer-count')).toHaveText('1 / 2');
});

test.describe('tutorial cards after a choice (PLAN-recompenses §4.3)', () => {
  // The cards open by themselves here (no `tutorial=0`).
  const TIPS_URL = './?debug=1&seed=42&pick=none';

  /** Close the tutorial cards one after the other. */
  const closeCards = async (page: Page): Promise<void> => {
    const tutorial = page.locator('.tut-overlay');
    await frames(page);
    while (await tutorial.isVisible()) {
      await page.locator('.tut-ok').click();
      await frames(page);
    }
  };

  /** Level 3 reached with the cards of levels 1 and 2 read, then `n` levels completed. */
  const openOffers = async (page: Page, n: number): Promise<void> => {
    await page.goto(TIPS_URL);
    await page.evaluate(() => window.__sumflow?.setLevel(3));
    await closeCards(page);
    await completeLevels(page, n);
    await expect(page.locator('.offer-overlay')).toBeVisible();
  };

  /** Force an offer on the open screen and click "Choose" under card `index`. */
  const forceAndChoose = async (page: Page, cards: string[], index: number): Promise<void> => {
    const screen = page.locator('.offer-overlay');
    await page.evaluate((ids) => window.__sumflow?.forceOffer(ids), cards);
    await expect(screen.locator('.offer-card').nth(index)).toHaveAttribute(
      'data-card',
      cards[index] ?? '',
    );
    const choose = screen.locator('.offer-choose').nth(index);
    await expect(choose).toBeEnabled();
    await choose.click();
  };

  test('the first value opens its card once the screen closes, the second one nothing', async ({
    page,
  }) => {
    await openOffers(page, 1);
    const screen = page.locator('.offer-overlay');
    const card = page.locator('.tut-card');
    await forceAndChoose(page, ['value', 'bridge'], 0);
    await expect(screen).toBeHidden();
    await expect(card).toHaveAttribute('data-tip', 'value');
    await expect(card.locator('h2')).toHaveText('Nouvelle valeur');
    await expect(card.locator('.tut-text')).toContainText('Les gisements de 2 sont maintenant');
    // The value is drawn as on the reward card.
    await expect(card.locator('canvas.tut-art')).toHaveCount(1);
    await closeCards(page);

    await completeLevels(page, 1);
    await expect(screen).toBeVisible();
    await forceAndChoose(page, ['value', 'bridge'], 0);
    await expect(screen).toBeHidden();
    await frames(page);
    await expect(page.locator('.tut-overlay')).toBeHidden();
    expect(await page.evaluate(() => window.__sumflow?.getState().maxExtraction)).toBe(3);
  });

  test('an edition card opens the card of its edition', async ({ page }) => {
    await openOffers(page, 1);
    await forceAndChoose(page, ['value', 'edition-legendaire'], 1);
    await expect(page.locator('.offer-overlay')).toBeHidden();
    const card = page.locator('.tut-card');
    await expect(card).toHaveAttribute('data-tip', 'edition.legendaire');
    await expect(card.locator('h2')).toHaveText('Édition légendaire');
    await expect(card.locator('.tut-text')).toContainText('le démolir te la rend');
  });

  test('with two offers waiting, the card of the first choice comes before the second offer', async ({
    page,
  }) => {
    await openOffers(page, 2);
    const screen = page.locator('.offer-overlay');
    await expect(screen.locator('.offer-count')).toHaveText('1 / 2');
    // A choice made without the screen's button (debug) waits for its card as well.
    await page.evaluate(() => {
      window.__sumflow?.forceOffer(['value', 'edition-brillante']);
      window.__sumflow?.choose(1);
    });
    await expect(screen).toBeHidden();
    await expect(page.locator('.tut-card')).toHaveAttribute('data-tip', 'edition.brillante');
    await closeCards(page);
    await expect(screen).toBeVisible();
    await expect(screen.locator('.offer-count')).toHaveText('2 / 2');
  });

  test('the Help menu lists the new cards once met, and replays them', async ({ page }) => {
    await openOffers(page, 2);
    await forceAndChoose(page, ['value', 'edition-brillante'], 0);
    await closeCards(page);
    await forceAndChoose(page, ['value', 'edition-brillante'], 1);
    await closeCards(page);
    await expect(page.locator('.offer-overlay')).toBeHidden();

    await page.keyboard.press('Escape');
    await page.locator('.menu-card .menu-btn').nth(6).click(); // Help
    const tips = page.locator('.menu-card .help-tip');
    await expect(tips.first()).toBeVisible();
    const ids = await tips.evaluateAll((list) =>
      list.map((b) => (b as HTMLElement).dataset['tip']),
    );
    expect(ids).toEqual(['start', 'adder', 'upgrades', 'value', 'edition.brillante']);
    await page.locator('.menu-card .help-tip[data-tip="value"]').click();
    const card = page.locator('.tut-card');
    await expect(card).toHaveAttribute('data-tip', 'value');
    await expect(card.locator('.tut-text')).toContainText('Les gisements de 2');
  });
});
