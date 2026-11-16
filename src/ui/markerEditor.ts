import { EDIT } from '../config/balance';
import { t } from '../i18n';
import { el, releaseFocus, trapTab } from './dom';

/**
 * Small dialog to type a marker's text (PLAN §8.2). Enter validates, Escape cancels;
 * an existing marker can be deleted. Empty text deletes too.
 */
export class MarkerEditor {
  private readonly overlay: HTMLElement;
  private readonly input = el('input', 'marker-input');
  private readonly deleteBtn = el('button', 'secondary-btn danger', t('marker.delete'));
  private onDone: ((text: string | null) => void) | null = null;

  constructor(root: HTMLElement) {
    this.input.type = 'text';
    this.input.maxLength = EDIT.markerMaxLength;
    this.input.placeholder = t('marker.placeholder');
    this.input.setAttribute('aria-label', t('marker.placeholder'));
    const ok = el('button', 'primary-btn', t('marker.ok'));
    ok.type = 'submit';
    const cancel = el('button', 'secondary-btn', t('marker.cancel'));
    cancel.type = 'button';
    this.deleteBtn.type = 'button';
    const form = el(
      'form',
      'marker-card',
      el('h2', undefined, t('marker.title')),
      this.input,
      el('div', 'marker-actions', this.deleteBtn, cancel, ok),
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.finish(this.input.value);
    });
    cancel.addEventListener('click', () => this.finish(undefined));
    this.deleteBtn.addEventListener('click', () => this.finish(''));
    form.addEventListener('keydown', (e) => {
      trapTab(form, e);
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.finish(undefined);
      }
    });
    this.overlay = el('div', 'overlay marker-overlay', form);
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-label', t('marker.title'));
    this.overlay.hidden = true;
    this.overlay.addEventListener('pointerdown', (e) => {
      if (e.target === this.overlay) this.finish(undefined);
    });
    root.append(this.overlay);
  }

  get isOpen(): boolean {
    return !this.overlay.hidden;
  }

  /** Open with the current text (null for a new marker). `done` gets the text, or null if cancelled. */
  open(text: string | null, done: (text: string | null) => void): void {
    this.onDone = done;
    this.input.value = text ?? '';
    this.deleteBtn.hidden = text === null;
    this.overlay.hidden = false;
    this.input.focus();
    this.input.select();
  }

  /** `undefined` = cancelled; a string (maybe empty) = validated. */
  private finish(text: string | undefined): void {
    if (this.overlay.hidden) return;
    releaseFocus(this.overlay);
    this.overlay.hidden = true;
    const done = this.onDone;
    this.onDone = null;
    done?.(text === undefined ? null : text);
  }
}
