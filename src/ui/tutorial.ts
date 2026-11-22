import { t } from '../i18n';
import { type CardArt, drawCardArt } from '../render/cardArt';
import { el, releaseFocus, trapTab } from './dom';
import type { HelpTip } from './help';
import { TutorialDemo } from './tutorialDemo';

export interface TutorialShowOptions {
  /** Position in a series of cards shown one after the other (1-based), and its length. */
  index?: number;
  total?: number;
  /** Called once the card is closed (button, Escape or a tap outside). */
  onClose?: () => void;
  /** Reward card picture instead of the icon glyph (tips without a demo). */
  art?: CardArt;
  /** Parameters of the tip text. */
  params?: Record<string, string | number>;
}

/** Size of a reward card picture on a tutorial card, in CSS pixels (drawn at this size). */
const ART_PX = 120;

/**
 * Tutorial card (PLAN §7.5): a modal dialog with an animated demo of the tip, a title and
 * one or two sentences. Shown on a new game and whenever a building or a feature is
 * unlocked; the Help menu replays any of them. Works with a mouse, a finger and the
 * keyboard (Enter, Escape, Tab stays inside).
 */
export class TutorialCard {
  private readonly overlay: HTMLElement;
  private readonly card = el('section', 'tut-card');
  private demo: TutorialDemo | null = null;
  private onClose: (() => void) | undefined;
  /** Whether demos draw a finger (touch screen) or a mouse arrow. */
  touch = false;
  /** Still pictures instead of animations (option "Reduce animations"). */
  still = false;

  constructor(root: HTMLElement) {
    // Clicking the card itself keeps the focus inside the dialog (Escape still works).
    this.card.tabIndex = -1;
    this.overlay = el('div', 'overlay tut-overlay', this.card);
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-labelledby', 'tut-title');
    this.overlay.setAttribute('aria-describedby', 'tut-text');
    this.overlay.hidden = true;
    this.overlay.addEventListener('pointerdown', (e) => {
      if (e.target === this.overlay) this.close();
    });
    this.overlay.addEventListener('keydown', (e) => {
      trapTab(this.card, e);
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
    });
    root.append(this.overlay);
  }

  get isOpen(): boolean {
    return !this.overlay.hidden;
  }

  /** Id of the tip on screen, or null. */
  current: string | null = null;

  show(tip: HelpTip, options: TutorialShowOptions = {}): void {
    this.demo?.stop();
    this.current = tip.id;
    this.onClose = options.onClose;
    const total = options.total ?? 1;
    const index = options.index ?? 1;
    const more = index < total;

    const kicker = el(
      'p',
      'tut-kicker',
      t(tip.id === 'start' ? 'help.kicker.start' : 'help.kicker.new'),
    );
    const title = el('h2', undefined, t(tip.title));
    title.id = 'tut-title';
    const text = el('p', 'tut-text', t(tip.text, options.params));
    text.id = 'tut-text';

    let visual: HTMLElement;
    if (tip.demo) {
      this.demo = new TutorialDemo(tip.demo, { touch: this.touch, still: this.still });
      visual = this.demo.element;
    } else {
      this.demo = null;
      const icon = options.art ? artCanvas(options.art) : el('span', 'tut-big-icon', tip.icon);
      icon.setAttribute('aria-hidden', 'true');
      visual = el('div', 'tut-demo tut-demo-icon', icon);
    }

    const ok = el('button', 'primary-btn tut-ok', t(more ? 'help.next' : 'help.dismiss'));
    ok.type = 'button';
    ok.addEventListener('click', () => this.close());
    const footer = el('div', 'tut-footer');
    if (total > 1) footer.append(el('span', 'tut-count', t('help.count', { n: index, total })));
    footer.append(ok);

    this.card.dataset['tip'] = tip.id;
    this.card.dataset['pointer'] = this.touch ? 'touch' : 'mouse';
    this.card.replaceChildren(
      visual,
      el('div', 'tut-body', el('div', 'tut-heading', kicker, title), text, footer),
    );
    this.overlay.hidden = false;
    this.demo?.start();
    ok.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.isOpen) return;
    this.demo?.stop();
    this.demo = null;
    this.current = null;
    releaseFocus(this.overlay);
    this.overlay.hidden = true;
    const done = this.onClose;
    this.onClose = undefined;
    done?.();
  }
}

/** A reward card picture, drawn as on the front of the card. */
function artCanvas(art: CardArt): HTMLElement {
  const canvas = document.createElement('canvas');
  canvas.className = 'tut-art';
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  canvas.width = ART_PX * dpr;
  canvas.height = ART_PX * dpr;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawCardArt(ctx, art, ART_PX);
  }
  return el('span', 'tut-big-icon tut-big-art', canvas);
}
