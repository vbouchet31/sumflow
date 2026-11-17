import { ACTION_KEYS, CTRL_KEYS, PAN_KEYS, SPECIAL_KEYS, TOOL_CODES } from '../config/keymap';

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

/** True for a focused control that Space activates. */
function isActivatable(target: EventTarget | null): boolean {
  return target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement;
}

export type ToolKey = (typeof TOOL_CODES)[keyof typeof TOOL_CODES];

export interface KeyboardHandlers {
  onHome: () => void;
  onTool: (
    tool: ToolKey | 'demolish' | 'priority' | 'clear' | 'marker' | 'copy' | 'cut' | 'paste',
  ) => void;
  onUndo: () => void;
  onRedo: () => void;
  onPick: () => void;
  onMirror: () => void;
  onRotate: (delta: 1 | -1) => void;
  onCancel: () => void;
  onQuickDemolish: () => void;
  onTogglePause: () => void;
  onLevels: () => void;
  onUpgrades: () => void;
  onDelivered: () => void;
  onTogglePerf: () => void;
  /** `?` or `F1`: the shortcuts sheet. */
  onShortcuts?: () => void;
}

/** Tracks held physical keys for camera panning and dispatches shortcuts (PLAN §8). */
export class Keyboard {
  private readonly held = new Set<string>();
  private shift = false;
  private modifier = false;
  /** Ctrl state, readable by tools (elbow swap while dragging). */
  ctrl = false;

  /**
   * `blocked` returns true while a modal (menu, editor) is open: shortcuts are ignored then,
   * the modal handles its own keys.
   */
  constructor(
    target: Window,
    private readonly handlers: KeyboardHandlers,
    private readonly blocked: () => boolean = () => false,
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
    if (isTypingTarget(e.target) || this.blocked()) return;
    if (e.key === SPECIAL_KEYS.cancel) {
      this.handlers.onCancel();
      return;
    }
    // Space on a focused button or link activates it instead of pausing (PLAN §9.5).
    if (e.key === SPECIAL_KEYS.pause && isActivatable(e.target)) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (this.onCtrlKey(e.key.toLowerCase(), e.shiftKey, e.repeat)) e.preventDefault();
      return;
    }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    this.held.add(e.code);
    if (e.repeat) return;
    if (e.key === '?' || e.code === 'F1') {
      this.handlers.onShortcuts?.();
      e.preventDefault(); // F1 opens the browser's help otherwise
      return;
    }
    if (e.code === SPECIAL_KEYS.perf) {
      this.handlers.onTogglePerf();
      e.preventDefault(); // F3 opens the browser's search otherwise
      return;
    }
    const tool = TOOL_CODES[e.code as keyof typeof TOOL_CODES] as ToolKey | undefined;
    if (tool) {
      this.handlers.onTool(tool);
      e.preventDefault();
      return;
    }
    switch (e.key.toLowerCase()) {
      case ACTION_KEYS.home:
        this.handlers.onHome();
        break;
      case ACTION_KEYS.rotate:
        this.handlers.onRotate(e.shiftKey ? -1 : 1);
        break;
      case ACTION_KEYS.demolish:
        this.handlers.onTool('demolish');
        break;
      case ACTION_KEYS.priority:
        this.handlers.onTool('priority');
        break;
      case ACTION_KEYS.levels:
        this.handlers.onLevels();
        break;
      case ACTION_KEYS.upgrades:
        this.handlers.onUpgrades();
        break;
      case ACTION_KEYS.delivered:
        this.handlers.onDelivered();
        break;
      case ACTION_KEYS.clear:
        this.handlers.onTool('clear');
        break;
      case ACTION_KEYS.marker:
        this.handlers.onTool('marker');
        break;
      case ACTION_KEYS.pick:
        this.handlers.onPick();
        break;
      case ACTION_KEYS.mirror:
        this.handlers.onMirror();
        break;
      case SPECIAL_KEYS.quickDemolish.toLowerCase():
        this.handlers.onQuickDemolish();
        break;
      case SPECIAL_KEYS.pause:
        this.handlers.onTogglePause();
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  /** Ctrl (or Cmd) shortcuts. Returns true when handled. Undo / redo repeat when held. */
  private onCtrlKey(k: string, shift: boolean, repeat: boolean): boolean {
    switch (k) {
      case CTRL_KEYS.undo:
        if (shift) this.handlers.onRedo();
        else this.handlers.onUndo();
        return true;
      case CTRL_KEYS.redo:
        this.handlers.onRedo();
        return true;
      case CTRL_KEYS.copy:
        if (!repeat) this.handlers.onTool('copy');
        return true;
      case CTRL_KEYS.cut:
        if (!repeat) this.handlers.onTool('cut');
        return true;
      case CTRL_KEYS.paste:
        if (!repeat) this.handlers.onTool('paste');
        return true;
      default:
        return false;
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.updateModifiers(e);
    this.held.delete(e.code);
  }

  private updateModifiers(e: KeyboardEvent): void {
    this.shift = e.shiftKey;
    this.ctrl = e.ctrlKey || e.metaKey;
    this.modifier = e.ctrlKey || e.altKey || e.metaKey;
  }

  private reset(): void {
    this.held.clear();
    this.shift = false;
    this.ctrl = false;
    this.modifier = false;
  }
}
