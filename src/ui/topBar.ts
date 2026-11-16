import { type MessageKey, t } from '../i18n';
import { el } from './dom';

export interface TopBarActions {
  home: () => void;
  levels: () => void;
}

/** Top-right buttons (PLAN §9.1). Undo/redo, markers, upgrades and menu come later. */
export function mountTopBar(root: HTMLElement, actions: TopBarActions): void {
  const bar = el('nav', 'top-bar');
  const add = (label: MessageKey, icon: string, action: () => void, id: string): void => {
    const btn = el('button', 'top-btn', icon);
    btn.type = 'button';
    btn.title = t(label);
    btn.setAttribute('aria-label', t(label));
    btn.dataset['action'] = id;
    btn.addEventListener('click', () => {
      action();
      btn.blur();
    });
    bar.append(btn);
  };
  add('btn.home', '⌂', actions.home, 'home');
  add('btn.levels', '☰', actions.levels, 'levels');
  root.append(bar);
}
