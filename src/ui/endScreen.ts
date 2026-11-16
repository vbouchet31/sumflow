import { TICK_RATE } from '../config/balance';
import { formatFull } from '../core/format';
import { getLocale, t } from '../i18n';
import type { GameState } from '../sim/state';
import { el, releaseFocus, trapTab } from './dom';
import { formatDuration } from './labels';

/** "Game complete" overlay (PLAN §7.2) with play time and items delivered. */
export class EndScreen {
  private readonly overlay: HTMLElement;
  private readonly stats = el('div', 'end-stats');
  private readonly button: HTMLButtonElement;

  constructor(root: HTMLElement) {
    this.button = el('button', 'primary-btn', t('end.continue'));
    this.button.type = 'button';
    this.button.addEventListener('click', () => this.hide());
    const title = el('h2', undefined, t('end.title'));
    title.id = 'end-title';
    this.overlay = el(
      'div',
      'overlay',
      el('section', 'end-card', title, el('p', undefined, t('end.body')), this.stats, this.button),
    );
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-labelledby', 'end-title');
    this.overlay.hidden = true;
    this.overlay.addEventListener('keydown', (e) => {
      trapTab(this.overlay, e);
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.hide();
      }
    });
    root.append(this.overlay);
  }

  show(state: GameState): void {
    const ms = ((state.finishedAtTick ?? state.tick) * 1000) / TICK_RATE;
    this.stats.replaceChildren(
      el('div', undefined, t('end.playTime', { time: formatDuration(ms) })),
      el('div', undefined, t('end.items', { n: formatFull(state.totalDelivered, getLocale()) })),
    );
    this.overlay.hidden = false;
    this.button.focus();
  }

  hide(): void {
    releaseFocus(this.overlay);
    this.overlay.hidden = true;
  }

  get isOpen(): boolean {
    return !this.overlay.hidden;
  }
}
