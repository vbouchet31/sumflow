import { STREAK } from '../config/balance';
import { formatFull } from '../core/format';
import { getLocale, t } from '../i18n';
import { streakFactor, tierIndex } from '../sim/streak';
import type { GameState } from '../sim/state';
import { el } from './dom';

/** Streaks shorter than this are not shown (a few items in a row mean nothing yet). */
const SHOW_FROM = 5;

/** Card under the HUD: current streak, its bonus and the way to the next tier (proposal 08). */
export class StreakCard {
  private readonly title = el('div', 'streak-title');
  private readonly factor = el('span', 'streak-factor');
  private readonly fill = el('div', 'streak-bar-fill');
  private readonly bar = el('div', 'streak-bar', this.fill);
  private readonly info = el('div', 'streak-info');
  private readonly box = el(
    'section',
    'streak-card',
    el('div', 'streak-head', this.title, this.factor),
    this.bar,
    this.info,
  );
  private last = '';

  constructor(root: HTMLElement) {
    this.box.hidden = true;
    root.append(this.box);
  }

  update(state: GameState): void {
    const { count, best } = state.streak;
    const loc = getLocale();
    const key = count < SHOW_FROM ? '' : `${count}|${best}|${loc}`;
    if (key === this.last) return;
    this.last = key;
    this.box.hidden = key === '';
    if (!key) return;
    const tier = tierIndex(count);
    this.box.dataset['tier'] = String(tier);
    this.title.textContent = t('streak.title', { n: formatFull(count, loc) });
    this.factor.textContent = `×${streakFactor(count).toLocaleString(loc)}`;
    const next = STREAK.tiers[tier + 1];
    const cur = STREAK.tiers[tier];
    if (next && cur) {
      this.bar.hidden = false;
      this.fill.style.width = `${(100 * (count - cur.from)) / (next.from - cur.from)}%`;
      this.info.textContent = t('streak.next', {
        n: formatFull(next.from - count, loc),
        f: next.factor.toLocaleString(loc),
      });
    } else {
      this.bar.hidden = true;
      this.info.textContent = t('streak.max', { best: formatFull(best, loc) });
    }
  }
}
