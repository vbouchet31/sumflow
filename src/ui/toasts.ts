import { el } from './dom';

/** Transient notifications (PLAN §9.1). */
export class Toasts {
  private readonly box = el('div', 'toasts');

  constructor(root: HTMLElement) {
    this.box.setAttribute('role', 'status');
    this.box.setAttribute('aria-live', 'polite');
    root.append(this.box);
  }

  show(title: string, detail?: string, durationMs = 3500): void {
    const toast = el('div', 'toast', el('strong', undefined, title));
    if (detail) toast.append(el('div', undefined, detail));
    this.box.append(toast);
    while (this.box.children.length > 4) this.box.firstElementChild?.remove();
    setTimeout(() => toast.remove(), durationMs);
  }
}
