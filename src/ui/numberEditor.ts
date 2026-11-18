import { INT_MAX, INT_MIN } from '../core/intmath';
import { t } from '../i18n';
import { el, releaseFocus, trapTab } from './dom';

/** Small dialog asking for a whole number (Source of the sandbox, proposal 19). */
export class NumberEditor {
  private readonly overlay: HTMLElement;
  private readonly input = el('input', 'marker-input');
  private onDone: ((n: number | null) => void) | null = null;

  constructor(root: HTMLElement) {
    this.input.type = 'number';
    this.input.step = '1';
    this.input.setAttribute('aria-label', t('source.title'));
    const ok = el('button', 'primary-btn', t('source.ok'));
    ok.type = 'submit';
    const cancel = el('button', 'secondary-btn', t('source.cancel'));
    cancel.type = 'button';
    const form = el(
      'form',
      'marker-card',
      el('h2', undefined, t('source.title')),
      this.input,
      el('div', 'marker-actions', cancel, ok),
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const n = Math.trunc(Number(this.input.value));
      this.finish(Number.isFinite(n) ? Math.min(INT_MAX, Math.max(INT_MIN, n)) : null);
    });
    cancel.addEventListener('click', () => this.finish(null));
    form.addEventListener('keydown', (e) => {
      trapTab(form, e);
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.finish(null);
      }
    });
    this.overlay = el('div', 'overlay marker-overlay', form);
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.hidden = true;
    this.overlay.addEventListener('pointerdown', (e) => {
      if (e.target === this.overlay) this.finish(null);
    });
    root.append(this.overlay);
  }

  get isOpen(): boolean {
    return !this.overlay.hidden;
  }

  open(value: number, done: (n: number | null) => void): void {
    this.onDone = done;
    this.input.value = String(value);
    this.overlay.hidden = false;
    this.input.focus();
    this.input.select();
  }

  private finish(n: number | null): void {
    if (this.overlay.hidden) return;
    releaseFocus(this.overlay);
    this.overlay.hidden = true;
    const done = this.onDone;
    this.onDone = null;
    done?.(n);
  }
}
