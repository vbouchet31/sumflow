import { type MessageKey, t } from '../i18n';
import { el } from './dom';

export type TopAction = 'undo' | 'redo' | 'home' | 'marker' | 'delivered' | 'levels' | 'upgrades';

/** Top-right buttons (PLAN §9.1). The menu comes in M10. */
export class TopBar {
  private readonly buttons = new Map<TopAction, HTMLButtonElement>();

  constructor(root: HTMLElement, actions: Record<TopAction, () => void>) {
    const bar = el('nav', 'top-bar');
    const add = (id: TopAction, label: MessageKey, icon: string): void => {
      const btn = el('button', 'top-btn', icon);
      btn.type = 'button';
      btn.title = t(label);
      btn.setAttribute('aria-label', t(label));
      btn.dataset['action'] = id;
      btn.addEventListener('click', () => {
        actions[id]();
        btn.blur();
      });
      bar.append(btn);
      this.buttons.set(id, btn);
    };
    add('undo', 'btn.undo', '↶');
    add('redo', 'btn.redo', '↷');
    add('home', 'btn.home', '⌂');
    add('marker', 'btn.marker', '⚑');
    add('delivered', 'btn.delivered', '∑');
    add('levels', 'btn.levels', '☰');
    add('upgrades', 'btn.upgrades', '⇧');
    root.append(bar);
  }

  setVisible(id: TopAction, visible: boolean): void {
    const btn = this.buttons.get(id);
    if (btn) btn.hidden = !visible;
  }

  setEnabled(id: TopAction, enabled: boolean): void {
    const btn = this.buttons.get(id);
    if (btn) btn.disabled = !enabled;
  }

  /** Pressed state (toggle buttons such as the marker tool). */
  setPressed(id: TopAction, pressed: boolean): void {
    this.buttons.get(id)?.setAttribute('aria-pressed', String(pressed));
  }

  /** Green badge (an upgrade is ready, PLAN §7.3). */
  setBadge(id: TopAction, on: boolean): void {
    this.buttons.get(id)?.classList.toggle('has-badge', on);
  }
}
