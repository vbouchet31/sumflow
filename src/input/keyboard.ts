import { ACTION_KEYS, PAN_KEYS } from '../config/keymap';

/** True when keyboard shortcuts must be ignored (a text field has focus). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

export interface KeyboardHandlers {
  onHome: () => void;
}

/** Tracks held physical keys for camera panning and dispatches action shortcuts. */
export class Keyboard {
  private readonly held = new Set<string>();
  private shift = false;
  private modifier = false;

  constructor(
    target: Window,
    private readonly handlers: KeyboardHandlers,
  ) {
    target.addEventListener('keydown', (e) => this.onKeyDown(e));
    target.addEventListener('keyup', (e) => this.onKeyUp(e));
    target.addEventListener('blur', () => this.reset());
  }

  /** Unit-less pan direction from held keys, and whether Shift speeds it up. */
  panVector(): { dx: number; dy: number; fast: boolean } {
    if (this.modifier) return { dx: 0, dy: 0, fast: false };
    const any = (codes: readonly string[]): boolean => codes.some((c) => this.held.has(c));
    const dx = (any(PAN_KEYS.right) ? 1 : 0) - (any(PAN_KEYS.left) ? 1 : 0);
    const dy = (any(PAN_KEYS.down) ? 1 : 0) - (any(PAN_KEYS.up) ? 1 : 0);
    return { dx, dy, fast: this.shift };
  }

  private onKeyDown(e: KeyboardEvent): void {
    this.updateModifiers(e);
    if (isTypingTarget(e.target)) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    this.held.add(e.code);
    if (e.repeat) return;
    if (e.key.toLowerCase() === ACTION_KEYS.home) {
      this.handlers.onHome();
      e.preventDefault();
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.updateModifiers(e);
    this.held.delete(e.code);
  }

  private updateModifiers(e: KeyboardEvent): void {
    this.shift = e.shiftKey;
    this.modifier = e.ctrlKey || e.altKey || e.metaKey;
  }

  private reset(): void {
    this.held.clear();
    this.shift = false;
    this.modifier = false;
  }
}
