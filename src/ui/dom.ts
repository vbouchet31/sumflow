/** Small DOM helper: `el('div', 'class', ...children)`. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  return node;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Keep Tab and Shift+Tab inside `container` (modal dialogs, PLAN §9.5). Call it from the
 * dialog's `keydown` handler.
 */
export function trapTab(container: HTMLElement, e: KeyboardEvent): void {
  if (e.key !== 'Tab') return;
  const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (n) => !n.hasAttribute('disabled') && n.checkVisibility(),
  );
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) {
    e.preventDefault();
    return;
  }
  const active = document.activeElement;
  const inside = active instanceof HTMLElement && items.includes(active);
  if (e.shiftKey && (active === first || !inside)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !inside)) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * Drop the focus if it is inside `container`. Call it when hiding a dialog or a panel:
 * a hidden element that keeps the focus would still receive the next key presses.
 */
export function releaseFocus(container: HTMLElement): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement && container.contains(active)) active.blur();
}
