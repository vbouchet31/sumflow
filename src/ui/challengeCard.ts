import { TICK_RATE } from '../config/balance';
import { getLocale, t } from '../i18n';
import { challengeTicks } from '../sim/challenge';
import type { GameState } from '../sim/state';
import { el } from './dom';

/** "12:07" or "1:02:07" from ticks of simulated time. */
export function formatChrono(ticks: number): string {
  const s = Math.floor(ticks / TICK_RATE);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Card under the HUD during a daily challenge: date, goal, chronometer, best (proposal 15). */
export class ChallengeCard {
  private readonly title = el('div', 'daily-title');
  private readonly chrono = el('div', 'daily-chrono');
  private readonly info = el('div', 'daily-info');
  private readonly box = el('section', 'daily-card', this.title, this.chrono, this.info);
  private last = '';

  constructor(
    root: HTMLElement,
    private readonly best: (date: string) => number | null,
  ) {
    this.box.hidden = true;
    root.append(this.box);
  }

  update(state: GameState): void {
    const c = state.challenge;
    const ticks = challengeTicks(state);
    const loc = getLocale();
    const key = c ? `${c.date}|${Math.floor(ticks / TICK_RATE)}|${c.doneTick}|${loc}` : '';
    if (key === this.last) return;
    this.last = key;
    this.box.hidden = !c;
    if (!c) return;
    const date = new Date(`${c.date}T12:00:00Z`).toLocaleDateString(loc, {
      day: 'numeric',
      month: 'long',
    });
    this.box.classList.toggle('is-done', c.doneTick !== null);
    this.title.textContent = t('daily.card', { date });
    this.chrono.textContent =
      c.doneTick === null
        ? `⏱ ${formatChrono(ticks)}`
        : t('daily.done', { time: formatChrono(ticks) });
    const best = this.best(c.date);
    this.info.textContent =
      best !== null && c.doneTick !== null
        ? t('daily.best', { time: formatChrono(best) })
        : t('daily.goal', { n: c.goalLevel });
  }
}
