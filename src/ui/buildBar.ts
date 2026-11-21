import type { ToolController, ToolId } from '../build/tools';
import type { Rot } from '../core/grid';
import { type MessageKey, t } from '../i18n';
import {
  drawToolIcon,
  iconAnimated,
  iconRotates,
  type IconTool,
  isIconTool,
} from '../render/toolIcons';

interface ToolButton {
  tool: ToolId;
  label: MessageKey;
  /** Keyboard shortcut, shown on the button and in its title. */
  key?: string;
  /** Glyph: the button face of editing tools, and the tutorial's tool chip. */
  icon: string;
  /** Compact key label shown on the button (defaults to `key`). */
  short?: string;
  /** Editing tools form a second group (PLAN §9.1). */
  edit?: boolean;
}

const BUTTONS: readonly ToolButton[] = [
  { tool: 'belt', label: 'tool.belt', key: '1', icon: '»' },
  { tool: 'extractor', label: 'tool.extractor', key: '2', icon: '▣' },
  { tool: 'adder', label: 'tool.adder', key: '3', icon: '+' },
  { tool: 'multiplier', label: 'tool.multiplier', key: '4', icon: '×' },
  { tool: 'subtractor', label: 'tool.subtractor', key: '5', icon: '−' },
  { tool: 'divider', label: 'tool.divider', key: '6', icon: '÷' },
  { tool: 'exponent', label: 'tool.exponent', key: '7', icon: '^' },
  { tool: 'storage', label: 'tool.storage', key: '8', icon: '▦' },
  { tool: 'bridge', label: 'tool.bridge', key: '9', icon: '≡' },
  { tool: 'priority', label: 'tool.priority', key: 'P', icon: '◆' },
  { tool: 'select', label: 'tool.select', icon: '⬚', edit: true },
  { tool: 'demolish', label: 'tool.demolish', key: 'X', icon: '✕', edit: true },
  { tool: 'clear', label: 'tool.clear', key: 'C', icon: '○', edit: true },
  { tool: 'marker', label: 'tool.marker', key: 'B', icon: '⚑', edit: true },
];

type TrayAction = 'copy' | 'cut' | 'paste';

/** Copy, cut and paste: only in the selection tray, shown when they can act. */
const TRAY: readonly (ToolButton & { tool: TrayAction })[] = [
  { tool: 'copy', label: 'tool.copy', key: 'Ctrl+C', short: '^C', icon: '⧉' },
  { tool: 'cut', label: 'tool.cut', key: 'Ctrl+X', short: '^X', icon: '✂︎' },
  { tool: 'paste', label: 'tool.paste', key: 'Ctrl+V', short: '^V', icon: '⎘' },
];

/** Icon and name of a tool, as on its build bar button. */
export function toolFace(tool: ToolId): { icon: string; label: MessageKey } | null {
  const def = BUTTONS.find((b) => b.tool === tool) ?? TRAY.find((b) => b.tool === tool);
  return def ? { icon: def.icon, label: def.label } : null;
}

/** Quarter turn of the pictures when the rotation changes (ms). */
const TURN_MS = 180;
/** Belt chevrons are redrawn at most this many times a second. */
const ICON_FPS = 30;

const SVG = 'http://www.w3.org/2000/svg';

/** Dashed rectangle of the selection tool. */
function selectIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('build-icon', 'build-icon-svg');
  const rect = document.createElementNS(SVG, 'rect');
  for (const [k, v] of Object.entries({ x: '4', y: '5', width: '16', height: '14', rx: '1.5' })) {
    rect.setAttribute(k, v);
  }
  svg.append(rect);
  return svg;
}

function makeButton(def: ToolButton, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'build-btn';
  btn.title = def.key ? `${t(def.label)} (${def.key})` : t(def.label);
  btn.setAttribute('aria-label', t(def.label));
  const label = document.createElement('span');
  label.className = 'build-label';
  label.textContent = t(def.label);
  btn.append(label);
  if (def.key) {
    const key = document.createElement('kbd');
    key.textContent = def.short ?? def.key;
    btn.append(key);
  }
  btn.addEventListener('click', (e) => {
    onClick();
    // Mouse clicks give the keyboard back to the game; keyboard users keep their place.
    if (e.detail > 0) btn.blur();
  });
  return btn;
}

/** A building button's picture: a canvas redrawn when the rotation changes. */
interface Picture {
  tool: IconTool;
  canvas: HTMLCanvasElement;
  btn: HTMLButtonElement;
  /** Size and rotation it was last drawn at. */
  drawn: string;
}

/**
 * Bottom-centre build bar (PLAN §9.1). Buildings are pictured as they will be built, in the
 * current rotation, each in a fixed square slot so that turning a piece never moves the
 * buttons. Locked buildings are hidden (later milestones). Copy, cut and paste live in the
 * selection tray above the bar, shown only when they can act.
 */
export class BuildBar {
  private readonly buttons = new Map<ToolId, HTMLButtonElement>();
  private readonly pictures: Picture[] = [];
  private readonly bar = document.createElement('div');
  private readonly tray = document.createElement('div');
  private readonly trayButtons = new Map<TrayAction, HTMLButtonElement>();
  private rot: Rot;
  private frame = -1;
  private trayKey = '';
  /** No turning or moving pictures (reduced motion setting). */
  reducedMotion = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly tools: ToolController,
  ) {
    this.rot = tools.rot;
    const bar = this.bar;
    bar.className = 'build-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', t('toolbar.label'));
    let group = document.createElement('div');
    group.className = 'build-group';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', t('toolbar.label'));
    bar.append(group);
    for (const def of BUTTONS) {
      if (def.edit && group.dataset['edit'] === undefined) {
        group = document.createElement('div');
        group.className = 'build-group build-group-edit';
        group.dataset['edit'] = '';
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', t('toolbar.edit'));
        bar.append(group);
      }
      const btn = makeButton(def, () => tools.setTool(def.tool));
      btn.dataset['tool'] = def.tool;
      if (isIconTool(def.tool)) {
        btn.classList.add('build-btn-piece');
        const canvas = document.createElement('canvas');
        canvas.className = 'build-piece';
        canvas.setAttribute('aria-hidden', 'true');
        btn.prepend(canvas);
        this.pictures.push({ tool: def.tool, canvas, btn, drawn: '' });
      } else if (def.tool === 'select') {
        btn.prepend(selectIcon());
      } else {
        const icon = document.createElement('span');
        icon.className = 'build-icon';
        icon.textContent = def.icon;
        icon.setAttribute('aria-hidden', 'true');
        btn.prepend(icon);
      }
      group.append(btn);
      this.buttons.set(def.tool, btn);
    }
    root.append(bar);

    this.tray.className = 'sel-tray';
    this.tray.setAttribute('role', 'toolbar');
    this.tray.setAttribute('aria-label', t('toolbar.selection'));
    this.tray.hidden = true;
    for (const def of TRAY) {
      const btn = makeButton(def, () => this.runTray(def.tool));
      btn.dataset['action'] = def.tool;
      const icon = document.createElement('span');
      icon.className = 'build-icon';
      icon.textContent = def.icon;
      icon.setAttribute('aria-hidden', 'true');
      btn.prepend(icon);
      this.tray.append(btn);
      this.trayButtons.set(def.tool, btn);
    }
    root.append(this.tray);

    const sync = (): void => {
      for (const [tool, btn] of this.buttons) {
        const pressed = tools.tool === tool;
        btn.setAttribute('aria-pressed', String(pressed));
        // A tool chosen by a key or the pipette may be scrolled out of the bar.
        if (pressed) btn.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      }
    };
    tools.onChange(sync);
    sync();
    bar.addEventListener('scroll', () => this.updateOverflow(), { passive: true });
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => this.onResize()).observe(bar);
    }
    this.refresh();
  }

  private runTray(action: TrayAction): void {
    if (action === 'paste') this.tools.setTool('paste');
    else this.tools.copyTargetRect(action === 'cut');
  }

  private onResize(): void {
    this.updateOverflow();
    // What sits above the bar (action bar, selection tray, chips) follows its real size.
    const { offsetWidth: w, offsetHeight: h } = this.bar;
    if (h > 0) {
      this.root.style.setProperty('--bar-h', `${h}px`);
      this.root.style.setProperty('--bar-w', `${w}px`);
    }
    this.drawPictures(true);
  }

  /** Tell the style sheet on which sides more buttons can be scrolled into view. */
  private updateOverflow(): void {
    const { scrollLeft, scrollWidth, clientWidth } = this.bar;
    const left = scrollLeft > 1;
    const right = scrollLeft + clientWidth < scrollWidth - 1;
    this.bar.dataset['more'] = left && right ? 'both' : left ? 'left' : right ? 'right' : 'none';
  }

  /** Hide buildings that are still locked (PLAN §9.1). Call after a reward. */
  refresh(): void {
    for (const [tool, btn] of this.buttons) btn.hidden = !this.tools.isAvailable(tool);
    this.updateOverflow();
    this.drawPictures(true);
  }

  /**
   * Every frame: turn the pictures when the rotation changed, move the belt chevrons and
   * show the selection tray when copy, cut or paste can act. Cheap when nothing changes.
   */
  update(now: number): void {
    const rot = this.tools.rot;
    if (rot !== this.rot) {
      const delta = (rot - this.rot + 4) % 4;
      this.rot = rot;
      this.drawPictures(true);
      if (!this.reducedMotion) this.turn(delta);
    }
    if (!this.reducedMotion) {
      const frame = Math.floor((now / 1000) * ICON_FPS);
      if (frame !== this.frame) {
        this.frame = frame;
        for (const p of this.pictures) {
          if (iconAnimated(p.tool) && !p.btn.hidden) this.draw(p, now / 1000);
        }
      }
    }
    this.updateTray();
  }

  /** The new pictures arrive with a quarter turn from the old orientation. */
  private turn(delta: number): void {
    const from = delta === 3 ? 90 : -90 * delta;
    for (const p of this.pictures) {
      if (!iconRotates(p.tool) || p.btn.hidden) continue;
      p.canvas.animate?.([{ transform: `rotate(${from}deg)` }, { transform: 'rotate(0deg)' }], {
        duration: TURN_MS,
        easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)',
      });
    }
  }

  private drawPictures(force: boolean): void {
    for (const p of this.pictures) {
      if (p.btn.hidden) continue;
      const size = p.canvas.clientWidth;
      const key = `${size}|${iconRotates(p.tool) ? this.rot : 0}|${devicePixelRatio}`;
      if (force || key !== p.drawn) this.draw(p, performance.now() / 1000);
    }
  }

  private draw(p: Picture, time: number): void {
    const size = p.canvas.clientWidth;
    if (size === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const px = Math.round(size * dpr);
    if (p.canvas.width !== px) {
      p.canvas.width = px;
      p.canvas.height = px;
    }
    const ctx = p.canvas.getContext('2d');
    if (!ctx) return;
    const rot = iconRotates(p.tool) ? this.rot : 0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawToolIcon(ctx, p.tool, rot, size, this.reducedMotion ? 0 : time);
    p.drawn = `${size}|${rot}|${devicePixelRatio}`;
  }

  /** Copy and cut when a zone or a building is selected; paste when the clipboard holds one. */
  private updateTray(): void {
    const { tools } = this;
    const target = tools.copyTarget !== null;
    const paste = tools.clipboardSize > 0;
    const key = `${target}|${paste}|${tools.tool === 'paste'}`;
    if (key === this.trayKey) return;
    this.trayKey = key;
    this.trayButtons.get('copy')?.toggleAttribute('hidden', !target);
    this.trayButtons.get('cut')?.toggleAttribute('hidden', !target);
    const pasteBtn = this.trayButtons.get('paste');
    if (pasteBtn) {
      pasteBtn.hidden = !paste;
      pasteBtn.setAttribute('aria-pressed', String(tools.tool === 'paste'));
    }
    this.tray.hidden = !target && !paste;
  }
}
