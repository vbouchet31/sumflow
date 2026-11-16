import { t } from '../i18n';

export interface DebugInfo {
  seed: number;
  cursorX: number;
  cursorY: number;
  zoom: number;
  deposit: number | null;
}

/** Small read-only debug box (seed, cursor tile, zoom), shown with `?debug=1` or in dev. */
export class DebugPanel {
  private readonly el: HTMLElement;
  private last = '';

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'debug-panel';
    this.el.setAttribute('aria-label', t('debug.title'));
    root.append(this.el);
  }

  update(info: DebugInfo): void {
    const lines = [
      t('debug.seed', { seed: info.seed }),
      t('debug.cursor', { x: info.cursorX, y: info.cursorY }),
      t('debug.zoom', { zoom: info.zoom.toFixed(2) }),
    ];
    if (info.deposit !== null) lines.push(t('debug.deposit', { value: info.deposit }));
    const text = lines.join('\n');
    if (text === this.last) return;
    this.last = text;
    this.el.textContent = text;
  }
}
