import { TICK_RATE } from '../config/balance';
import { formatFull } from '../core/format';
import { getLocale, t } from '../i18n';
import type { GameState } from '../sim/state';
import { el, releaseFocus, trapTab } from './dom';
import { cardLabel, formatDuration } from './labels';

/**
 * "Your picks" (PLAN-recompenses §4.6, PLAN-paliers §4.3): every card obtained, in order,
 * with its edition and value, as items of a list: the level for its reward, the level and the
 * palier for a choice. A card given outside an offer (debug) says so.
 */
export function picksRecap(state: GameState): { level: string; card: string }[] {
  return state.picks.map((p) => ({
    level:
      p.level <= 0
        ? t('end.pickGranted')
        : p.palier !== undefined
          ? t('end.pickPalier', { n: p.level, i: p.palier })
          : t('end.pickLevel', { n: p.level }),
    card: cardLabel(p),
  }));
}

/** "Game complete" overlay (PLAN §7.2) with play time, items delivered and the picks. */
export class EndScreen {
  private readonly overlay: HTMLElement;
  private readonly stats = el('div', 'end-stats');
  private readonly picks = el('ol', 'end-picks');
  private readonly button: HTMLButtonElement;

  constructor(root: HTMLElement) {
    this.button = el('button', 'primary-btn', t('end.continue'));
    this.button.type = 'button';
    this.button.addEventListener('click', () => this.hide());
    const title = el('h2', undefined, t('end.title'));
    title.id = 'end-title';
    const picksTitle = el('h3', 'end-picks-title', t('end.picks'));
    picksTitle.id = 'end-picks-title';
    this.overlay = el(
      'div',
      'overlay',
      el(
        'section',
        'end-card',
        title,
        el('p', undefined, t('end.body')),
        this.stats,
        picksTitle,
        this.picks,
        this.button,
      ),
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
    const recap = picksRecap(state);
    this.picks.replaceChildren(
      ...(recap.length === 0
        ? [el('li', 'end-pick-none', t('end.noPicks'))]
        : recap.map((p) =>
            el(
              'li',
              'end-pick',
              el('span', 'end-pick-level', p.level),
              el('span', 'end-pick-card', p.card),
            ),
          )),
    );
    // Scrollable with the keyboard too when it is long.
    this.picks.tabIndex = 0;
    this.picks.setAttribute('aria-labelledby', 'end-picks-title');
    this.overlay.hidden = false;
    this.picks.scrollTop = 0;
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
