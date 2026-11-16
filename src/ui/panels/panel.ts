import { type MessageKey, t } from '../../i18n';
import { el } from '../dom';

let nextId = 0;

/** Side panel shell (PLAN §9): title, close button, Escape to close, keyboard friendly. */
export abstract class Panel {
  protected readonly root: HTMLElement;
  protected readonly content = el('div', 'panel-content');
  private readonly closeBtn: HTMLButtonElement;
  /** Called when the panel opens (so a manager can close the others). */
  onOpen: (() => void) | null = null;

  constructor(parent: HTMLElement, title: MessageKey, className: string) {
    const id = `panel-title-${nextId++}`;
    const h = el('h2', undefined, t(title));
    h.id = id;
    this.closeBtn = el('button', 'panel-close', '✕');
    this.closeBtn.type = 'button';
    this.closeBtn.setAttribute('aria-label', t('btn.close'));
    this.closeBtn.addEventListener('click', () => this.close());
    this.root = el(
      'section',
      `panel ${className}`,
      el('header', 'panel-header', h, this.closeBtn),
      this.content,
    );
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-labelledby', id);
    this.root.hidden = true;
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.close();
      }
    });
    parent.append(this.root);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    this.onOpen?.();
    this.update(true);
    this.root.hidden = false;
    this.closeBtn.focus();
  }

  close(): void {
    this.root.hidden = true;
  }

  /** Refresh the content; `force` after opening. Called every frame while open. */
  abstract update(force?: boolean): void;
}
