import { t } from '../i18n';

/** Bottom-right status: pause indicator (save status and cursor come later). */
export class StatusBar {
  private readonly pause: HTMLElement;

  constructor(root: HTMLElement) {
    const el = document.createElement('div');
    el.className = 'status-bar';
    this.pause = document.createElement('span');
    this.pause.className = 'status-paused';
    this.pause.textContent = t('status.paused');
    this.pause.hidden = true;
    el.append(this.pause);
    root.append(el);
  }

  setPaused(paused: boolean): void {
    this.pause.hidden = !paused;
  }
}
