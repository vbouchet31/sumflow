import { t } from '../i18n';
import { el } from './dom';

/** Non-blocking "Catching up…" bar shown while missed time is simulated (PLAN §11.1). */
export class CatchUpBar {
  private readonly label = el('span', 'catch-up-label');
  private readonly fill = el('div', 'catch-up-fill');
  private readonly box = el('div', 'catch-up', this.label, el('div', 'catch-up-track', this.fill));
  private last = -1;

  constructor(root: HTMLElement) {
    this.box.setAttribute('role', 'status');
    this.box.hidden = true;
    root.append(this.box);
  }

  /** `progress` in [0, 1], or null when there is nothing to catch up. */
  update(progress: number | null): void {
    if (progress === null) {
      if (!this.box.hidden) this.box.hidden = true;
      this.last = -1;
      return;
    }
    const pct = Math.floor(progress * 100);
    if (pct === this.last) return;
    this.last = pct;
    this.label.textContent = t('catchUp.label', { pct });
    this.fill.style.width = `${pct}%`;
    this.box.hidden = false;
  }
}
