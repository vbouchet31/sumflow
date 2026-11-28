import { cardArt, drawCardArt } from '../render/cardArt';
import { t } from '../i18n';
import { el, releaseFocus, trapTab } from './dom';
import type { OfferCardView, OfferView } from './offerInfo';

/**
 * Time the "Choose" buttons stay off after the screen opens or shows the next offer (they
 * fade in meanwhile): the screen opens while the player builds, and a click meant for the
 * map, or a double click, must not take a reward (PLAN-recompenses §4.2).
 */
export const CHOOSE_DELAY_MS = 400;
/**
 * Size of the card pictures, in CSS pixels, before the layout scales them. Wider than tall
 * (5:4, as `--art-w` and `--art` in the style sheet), so a long building fills the card.
 */
const ART_W = 160;
const ART_H = 128;

export interface OfferScreenHandlers {
  /** Card `index` of the offer was chosen. */
  choose: (index: number) => void;
  /** "See the map" (or Escape): closed without choosing. */
  later: () => void;
  /** A card was turned over (for the sound). */
  flip?: () => void;
}

/**
 * Reward choice screen (PLAN-recompenses §4.2): one card per slot, its picture and name on
 * the front, its explanation on the back (a click, a tap, Enter or Space turns it over), a
 * "Choose" button under each card, and "See the map" to look at the factory first. A modal
 * dialog: Tab stays inside, Escape is "See the map", and no game shortcut gets through.
 */
export class OfferScreen {
  private readonly overlay: HTMLElement;
  private readonly sheet = el('section', 'offer-sheet');
  private readonly kicker = el('p', 'offer-kicker');
  private readonly intro = el('p', 'offer-intro', t('offer.intro'));
  private readonly count = el('span', 'offer-count');
  private readonly row = el('div', 'offer-cards');
  private readonly laterBtn: HTMLButtonElement;
  private chooseBtns: HTMLButtonElement[] = [];
  private cardBtns: HTMLButtonElement[] = [];
  private armTimer: ReturnType<typeof setTimeout> | null = null;
  /** What is on screen, to redraw only when the offer changes. */
  private key = '';
  /** Level of the offer on screen. */
  level: number | null = null;

  constructor(
    root: HTMLElement,
    private readonly handlers: OfferScreenHandlers,
  ) {
    const title = el('h2', 'offer-title', t('offer.title'));
    title.id = 'offer-title';
    this.laterBtn = el('button', 'secondary-btn offer-later', t('offer.later'));
    this.laterBtn.type = 'button';
    this.laterBtn.addEventListener('click', () => this.handlers.later());
    this.count.setAttribute('aria-live', 'polite');
    this.sheet.tabIndex = -1;
    this.sheet.append(
      el('header', 'offer-head', this.kicker, title, this.intro, this.count),
      this.row,
      el('footer', 'offer-foot', this.laterBtn),
    );
    this.overlay = el('div', 'overlay offer-overlay', this.sheet);
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-labelledby', 'offer-title');
    this.overlay.hidden = true;
    this.overlay.addEventListener('keydown', (e) => this.onKey(e));
    root.append(this.overlay);
  }

  get isOpen(): boolean {
    return !this.overlay.hidden;
  }

  /**
   * Show `view` (open the screen, or move to another offer). The same offer already on
   * screen is left as it is, cards turned over included. The buttons wait CHOOSE_DELAY_MS
   * each time a new offer appears.
   */
  show(view: OfferView): void {
    const key = JSON.stringify([
      view.level,
      view.palier,
      view.index,
      view.total,
      view.cards.map((c) => c.card),
    ]);
    const opening = !this.isOpen;
    if (!opening && key === this.key) return;
    this.key = key;
    this.level = view.level;
    this.kicker.textContent = t('offer.kicker', { n: view.level, i: view.palier, m: view.paliers });
    this.intro.hidden = !view.intro;
    this.count.hidden = view.total <= 1;
    this.count.textContent = t('offer.count', { n: view.index, total: view.total });
    this.row.replaceChildren(...view.cards.map((c, i) => this.slot(c, i)));
    this.row.dataset['cards'] = String(view.cards.length);
    this.overlay.classList.toggle('is-opening', opening);
    this.overlay.hidden = false;
    this.arm();
    this.cardBtns[0]?.focus({ preventScroll: true });
  }

  /** Close without choosing (the offer stays pending). */
  close(): void {
    if (!this.isOpen) return;
    this.disarm();
    releaseFocus(this.overlay);
    this.overlay.hidden = true;
    this.key = '';
    this.level = null;
  }

  /** The "Choose" buttons accept a click (the delay after opening is over). */
  get armed(): boolean {
    return this.armTimer === null && this.isOpen;
  }

  private arm(): void {
    this.disarm();
    this.sheet.classList.add('is-arming');
    for (const b of this.chooseBtns) b.disabled = true;
    this.laterBtn.disabled = true;
    this.armTimer = setTimeout(() => {
      this.armTimer = null;
      this.sheet.classList.remove('is-arming');
      for (const b of this.chooseBtns) b.disabled = false;
      this.laterBtn.disabled = false;
    }, CHOOSE_DELAY_MS);
  }

  private disarm(): void {
    if (this.armTimer !== null) clearTimeout(this.armTimer);
    this.armTimer = null;
  }

  private onKey(e: KeyboardEvent): void {
    trapTab(this.sheet, e);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.handlers.later();
      return;
    }
    // Left and right move from card to card (Tab also reaches the buttons).
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const at = this.cardBtns.findIndex((b) => b === document.activeElement);
      const next = this.cardBtns[at + (e.key === 'ArrowLeft' ? -1 : 1)];
      if (at >= 0 && next) {
        e.preventDefault();
        next.focus();
      }
    }
  }

  /** One card and its "Choose" button. */
  private slot(view: OfferCardView, index: number): HTMLElement {
    if (index === 0) {
      this.cardBtns = [];
      this.chooseBtns = [];
    }
    const backId = `offer-back-${index}`;
    const canvas = document.createElement('canvas');
    canvas.className = 'offer-art';
    canvas.setAttribute('aria-hidden', 'true');
    this.paint(canvas, view);

    const front = el(
      'span',
      'offer-face offer-front',
      canvas,
      el('span', 'offer-name', view.name),
      this.flipMark(),
    );
    const tags = el('span', 'offer-tags');
    for (const tag of view.tags) {
      tags.append(el('span', `offer-tag offer-tag-${tag}`, t(`offer.tag.${tag}`)));
    }
    const back = el(
      'span',
      'offer-face offer-back',
      el('span', 'offer-genre', view.genre),
      el('span', 'offer-full-name', view.fullName),
      el('span', 'offer-gives', view.gives),
      ...view.effects.map((line) => el('span', 'offer-effect', line)),
      el('span', 'offer-text', view.text),
      tags,
      this.flipMark(),
    );
    back.id = backId;
    if (view.tags.length === 0) tags.hidden = true;

    const card = el('button', 'offer-card', el('span', 'offer-card-inner', front, back));
    card.type = 'button';
    card.dataset['card'] = view.card.card;
    card.dataset['silent'] = '';
    card.setAttribute('aria-label', view.name);
    card.setAttribute('aria-pressed', 'false');
    card.setAttribute('aria-describedby', backId);
    card.title = t('offer.flipHint');
    card.addEventListener('click', () => {
      const flipped = card.getAttribute('aria-pressed') !== 'true';
      card.setAttribute('aria-pressed', String(flipped));
      card.classList.toggle('is-flipped', flipped);
      this.handlers.flip?.();
    });

    const choose = el('button', 'primary-btn offer-choose', t('offer.choose'));
    choose.type = 'button';
    choose.dataset['silent'] = '';
    choose.setAttribute('aria-label', t('offer.chooseNamed', { name: view.fullName }));
    choose.addEventListener('click', () => {
      if (this.armed) this.handlers.choose(index);
    });
    this.cardBtns.push(card);
    this.chooseBtns.push(choose);
    const slot = el('div', 'offer-slot', card, choose);
    slot.style.setProperty('--deal', String(index));
    return slot;
  }

  /** Small "turn over" mark in the corner of both faces. */
  private flipMark(): HTMLElement {
    const mark = el('span', 'offer-flip-mark', '↻');
    mark.setAttribute('aria-hidden', 'true');
    return mark;
  }

  /** Draw the card picture at the device resolution (the style sheet sets its size). */
  private paint(canvas: HTMLCanvasElement, view: OfferCardView): void {
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = ART_W * dpr;
    canvas.height = ART_H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawCardArt(ctx, cardArt(view.icon, view.card.edition, view.card.value), ART_W, ART_H);
  }
}
