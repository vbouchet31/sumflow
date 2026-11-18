import { t } from '../i18n';
import { el } from './dom';

/** "12 s" under a minute, then "3 min", "1 h 05 min". */
export function formatAgo(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return t('time.s', { s });
  const m = Math.floor(s / 60);
  if (m < 60) return t('time.m', { m });
  return t('time.hm', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') });
}

/** Bottom-right status (PLAN §9.1): pause, save state, cursor coordinates. */
export class StatusBar {
  private readonly pause = el('span', 'status-paused', t('status.paused'));
  private readonly speed = el('span', 'status-paused status-speed');
  private readonly saved = el('span', 'status-chip status-saved');
  private readonly cursor = el('span', 'status-chip status-cursor');
  private last = '';

  constructor(root: HTMLElement) {
    this.pause.hidden = true;
    this.speed.hidden = true;
    root.append(el('div', 'status-bar', this.speed, this.pause, this.saved, this.cursor));
  }

  /** "Speed ×4" chip while the game runs faster than normal. */
  setSpeed(scale: number): void {
    this.speed.hidden = scale <= 1;
    this.speed.textContent = t('status.speed', { n: scale });
  }

  setPaused(paused: boolean): void {
    this.pause.hidden = !paused;
  }

  /** `sinceSaveMs` = time since the last save, or null if never saved in this session. */
  update(sinceSaveMs: number | null, cursor: { x: number; y: number } | null): void {
    const saved =
      sinceSaveMs === null
        ? t('status.notSaved')
        : t('status.savedAgo', { time: formatAgo(sinceSaveMs) });
    const pos = cursor ? t('status.cursor', cursor) : '';
    const key = `${saved}|${pos}`;
    if (key === this.last) return;
    this.last = key;
    this.saved.textContent = saved;
    this.cursor.textContent = pos;
    this.cursor.hidden = pos === '';
  }
}
