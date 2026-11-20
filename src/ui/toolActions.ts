import type { ToolController } from '../build/tools';
import { type MessageKey, t } from '../i18n';
import { el } from './dom';

type ActionId =
  | 'rotate'
  | 'mirror'
  | 'elbow'
  | 'prevClip'
  | 'nextClip'
  | 'removeClip'
  | 'place'
  | 'quit'
  | 'pick'
  | 'delete'
  | 'deselect';

interface ActionDef {
  id: ActionId;
  label: MessageKey;
  /** Symbol, or null to show the label as text. */
  icon: string | null;
  run: (tools: ToolController) => void;
  shown: (tools: ToolController) => boolean;
  /** Toggle buttons report their state. */
  pressed?: (tools: ToolController) => boolean;
}

const ACTIONS: readonly ActionDef[] = [
  {
    id: 'rotate',
    label: 'act.rotate',
    icon: '↻',
    run: (tools) => tools.rotate(1),
    shown: (tools) => tools.canRotate,
  },
  {
    id: 'mirror',
    label: 'act.mirror',
    icon: '⇄',
    run: (tools) => tools.mirror(),
    shown: (tools) => tools.tool === 'paste',
  },
  {
    id: 'elbow',
    label: 'act.elbow',
    icon: '↳',
    run: (tools) => tools.toggleElbow(),
    shown: (tools) => tools.tool === 'belt' && tools.beltMode === 'l',
    pressed: (tools) => tools.elbowSwap,
  },
  {
    id: 'prevClip',
    label: 'act.prevClip',
    icon: '‹',
    run: (tools) => tools.cycleClip(-1),
    shown: (tools) => tools.tool === 'paste' && tools.clipboardSize > 1,
  },
  {
    id: 'nextClip',
    label: 'act.nextClip',
    icon: '›',
    run: (tools) => tools.cycleClip(1),
    shown: (tools) => tools.tool === 'paste' && tools.clipboardSize > 1,
  },
  {
    id: 'removeClip',
    label: 'act.removeClip',
    icon: '⌫',
    run: (tools) => tools.removeClip(),
    shown: (tools) => tools.tool === 'paste',
  },
  {
    id: 'place',
    label: 'act.place',
    icon: null,
    run: (tools) => tools.confirmPaste(),
    shown: (tools) => tools.pastePending,
  },
  {
    id: 'quit',
    label: 'act.quit',
    icon: null,
    run: (tools) => tools.setTool('none'),
    shown: (tools) => tools.tool !== 'none',
  },
  // Without a tool: what can be done to the selected object.
  {
    id: 'pick',
    label: 'act.pick',
    icon: null,
    run: (tools) => tools.pickSelection(),
    shown: (tools) => tools.tool === 'none' && tools.canPickSelection,
  },
  {
    id: 'delete',
    label: 'act.delete',
    icon: '⌫',
    run: (tools) => tools.deleteSelection(),
    shown: (tools) => tools.tool === 'none' && tools.canDeleteSelection,
  },
  {
    id: 'deselect',
    label: 'act.deselect',
    icon: '✕',
    run: (tools) => tools.clearSelection(),
    shown: (tools) => tools.tool === 'none',
  },
];

/**
 * Contextual action bar above the build bar (PLAN-tactile §4.1): the name or hint of the
 * active tool, and a button for everything that otherwise needs a key (rotate, mirror,
 * elbow, clipboard history, quit). Without a tool, it shows the selected object and what
 * can be done to it. Shown for every kind of pointer.
 */
export class ToolActions {
  private readonly box = el('div', 'tool-hint');
  private readonly label = el('span', 'tool-hint-text');
  private readonly buttons = new Map<ActionId, HTMLButtonElement>();
  private last = '';

  constructor(
    root: HTMLElement,
    private readonly tools: ToolController,
    /** Name of the object on a tile (the tooltip title). */
    private readonly describe: (x: number, y: number) => string = () => '',
  ) {
    this.box.setAttribute('role', 'toolbar');
    this.box.setAttribute('aria-label', t('act.label'));
    this.label.setAttribute('role', 'status');
    this.box.append(this.label);
    for (const def of ACTIONS) {
      const btn = el('button', 'hint-btn', def.icon ?? t(def.label));
      btn.type = 'button';
      btn.dataset['action'] = def.id;
      if (def.icon === null) btn.classList.add('hint-btn-text');
      if (def.id === 'place') btn.classList.add('hint-btn-primary');
      btn.title = t(`${def.label}Title` as MessageKey);
      btn.setAttribute('aria-label', t(def.label));
      btn.addEventListener('click', (e) => {
        def.run(tools);
        // Mouse clicks give the keyboard back to the game; keyboard users keep their place.
        if (e.detail > 0) btn.blur();
      });
      this.box.append(btn);
      this.buttons.set(def.id, btn);
    }
    this.box.hidden = true;
    root.append(this.box);
    // Its height, for what has to stay clear of it on a small screen (the tooltip).
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => {
        if (this.box.offsetHeight > 0) {
          root.style.setProperty('--hint-h', `${this.box.offsetHeight}px`);
        }
      }).observe(this.box);
    }
  }

  private text(): string {
    const { tools } = this;
    switch (tools.tool) {
      case 'none': {
        const at = tools.selectionTile;
        return at ? this.describe(at.x, at.y) : '';
      }
      case 'paste':
        return t('hint.paste', { i: tools.clipIndex + 1, n: tools.clipboardSize });
      case 'demolish':
      case 'clear':
      case 'copy':
      case 'cut': {
        const size = tools.dragArea;
        return size ? t('hint.areaSize', size) : t(`hint.${tools.tool}`);
      }
      case 'marker':
        return t('hint.marker');
      default:
        return t(`tool.${tools.tool}`);
    }
  }

  /** Cheap: call every frame. The DOM changes only when the content does. */
  update(): void {
    const { tools } = this;
    const text = this.text();
    const active = tools.tool !== 'none' || tools.selection !== null;
    const shown = ACTIONS.map((def) => active && def.shown(tools));
    const pressed = ACTIONS.map((def) => def.pressed?.(tools) ?? false);
    const key = `${text}|${shown.join()}|${pressed.join()}`;
    if (key === this.last) return;
    this.last = key;
    this.label.textContent = text;
    this.box.hidden = !active;
    ACTIONS.forEach((def, i) => {
      const btn = this.buttons.get(def.id);
      if (!btn) return;
      btn.hidden = !shown[i];
      if (def.pressed) btn.setAttribute('aria-pressed', String(pressed[i]));
    });
  }
}
