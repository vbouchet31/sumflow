import type { ToolController } from '../build/tools';
import { type MessageKey, t } from '../i18n';
import { el } from './dom';

type ActionId =
  'rotate' | 'mirror' | 'elbow' | 'prevClip' | 'nextClip' | 'removeClip' | 'place' | 'quit';

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
    shown: (tools) => tools.tool === 'belt',
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
    shown: () => true,
  },
];

/**
 * Contextual action bar above the build bar (PLAN-tactile §4.1): the name or hint of the
 * active tool, and a button for everything that otherwise needs a key (rotate, mirror,
 * elbow, clipboard history, quit). Shown for every kind of pointer.
 */
export class ToolActions {
  private readonly box = el('div', 'tool-hint');
  private readonly label = el('span', 'tool-hint-text');
  /** Arrow showing where what is placed faces (belt direction, operator rotation). */
  private readonly compass = el('span', 'tool-hint-dir');
  private readonly buttons = new Map<ActionId, HTMLButtonElement>();
  private last = '';

  constructor(
    root: HTMLElement,
    private readonly tools: ToolController,
  ) {
    this.box.setAttribute('role', 'toolbar');
    this.box.setAttribute('aria-label', t('act.label'));
    this.label.setAttribute('role', 'status');
    this.compass.setAttribute('aria-hidden', 'true');
    this.box.append(this.compass, this.label);
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
  }

  private text(): string {
    const { tools } = this;
    switch (tools.tool) {
      case 'none':
        return '';
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
    const active = tools.tool !== 'none';
    const shown = ACTIONS.map((def) => active && def.shown(tools));
    const pressed = ACTIONS.map((def) => def.pressed?.(tools) ?? false);
    const dir = tools.canRotate ? (tools.tool === 'paste' ? tools.pasteRot : tools.rot) : -1;
    const key = `${text}|${shown.join()}|${pressed.join()}|${dir}`;
    if (key === this.last) return;
    this.last = key;
    this.label.textContent = text;
    this.compass.hidden = dir < 0;
    // Belts face East at rotation 0; buildings and pastes show their quarter turn the same way.
    this.compass.style.transform = `rotate(${dir * 90}deg)`;
    this.compass.textContent = '➜\uFE0E';
    this.box.hidden = !active;
    ACTIONS.forEach((def, i) => {
      const btn = this.buttons.get(def.id);
      if (!btn) return;
      btn.hidden = !shown[i];
      if (def.pressed) btn.setAttribute('aria-pressed', String(pressed[i]));
    });
  }
}
