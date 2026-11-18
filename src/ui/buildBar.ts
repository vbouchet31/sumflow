import type { ToolController, ToolId } from '../build/tools';
import { type MessageKey, t } from '../i18n';

interface ToolButton {
  tool: ToolId;
  label: MessageKey;
  key: string;
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
  { tool: 'demolish', label: 'tool.demolish', key: 'X', icon: '✕', edit: true },
  { tool: 'clear', label: 'tool.clear', key: 'C', icon: '○', edit: true },
  { tool: 'copy', label: 'tool.copy', key: 'Ctrl+C', short: '^C', icon: '⧉', edit: true },
  { tool: 'cut', label: 'tool.cut', key: 'Ctrl+X', short: '^X', icon: '✂\uFE0E', edit: true },
  { tool: 'paste', label: 'tool.paste', key: 'Ctrl+V', short: '^V', icon: '⎘', edit: true },
  { tool: 'marker', label: 'tool.marker', key: 'B', icon: '⚑', edit: true },
];

const OPERATORS: readonly ToolId[] = ['adder', 'multiplier', 'subtractor', 'divider', 'exponent'];

/** Bottom-centre build bar (PLAN §9.1). Locked buildings are hidden (later milestones). */
export class BuildBar {
  private readonly buttons = new Map<ToolId, HTMLButtonElement>();
  private readonly bar = document.createElement('div');
  /**
   * Phones: the five operators fold behind one button that opens a tray above the bar, so
   * the bar fits without scrolling. The button shows the last operator chosen.
   */
  private readonly opsBtn = document.createElement('button');
  private readonly tray = document.createElement('div');
  private readonly opsAnchor = document.createComment('operators');
  private lastOp: ToolId = 'adder';
  private compact = false;

  constructor(
    root: HTMLElement,
    private readonly tools: ToolController,
  ) {
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
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'build-btn';
      btn.dataset['tool'] = def.tool;
      btn.title = `${t(def.label)} (${def.key})`;
      btn.setAttribute('aria-label', t(def.label));
      const icon = document.createElement('span');
      icon.className = 'build-icon';
      icon.textContent = def.icon;
      icon.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.className = 'build-label';
      label.textContent = t(def.label);
      const key = document.createElement('kbd');
      key.textContent = def.short ?? def.key;
      btn.append(icon, label, key);
      btn.addEventListener('click', (e) => {
        tools.setTool(def.tool);
        // Mouse clicks give the keyboard back to the game; keyboard users keep their place.
        if (e.detail > 0) btn.blur();
      });
      group.append(btn);
      this.buttons.set(def.tool, btn);
    }
    // Operator group (phones).
    const ops = OPERATORS.map((id) => this.buttons.get(id)).filter(
      (b): b is HTMLButtonElement => b !== undefined,
    );
    ops[0]?.before(this.opsAnchor);
    this.opsBtn.type = 'button';
    this.opsBtn.className = 'build-btn build-ops';
    this.opsBtn.setAttribute('aria-haspopup', 'true');
    this.opsBtn.setAttribute('aria-expanded', 'false');
    this.opsBtn.setAttribute('aria-label', t('toolbar.operators'));
    this.opsBtn.title = t('toolbar.operators');
    this.opsBtn.hidden = true;
    this.opsBtn.addEventListener('click', (e) => {
      this.setTray(this.tray.hidden !== false);
      if (e.detail > 0) this.opsBtn.blur();
    });
    this.opsAnchor.after(this.opsBtn);
    this.tray.className = 'build-tray';
    this.tray.setAttribute('role', 'group');
    this.tray.setAttribute('aria-label', t('toolbar.operators'));
    this.tray.hidden = true;
    root.append(bar, this.tray);
    document.addEventListener('pointerdown', (e) => {
      if (
        e.target instanceof Node &&
        !this.tray.contains(e.target) &&
        !this.opsBtn.contains(e.target)
      )
        this.setTray(false);
    });
    const sync = (): void => {
      for (const [tool, btn] of this.buttons) {
        const pressed = tools.tool === tool;
        btn.setAttribute('aria-pressed', String(pressed));
        // A tool chosen by a key or the pipette may be scrolled out of the bar.
        if (pressed && !(this.compact && OPERATORS.includes(tool)))
          btn.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      }
      if (OPERATORS.includes(tools.tool)) {
        this.lastOp = tools.tool;
        this.setTray(false);
      }
      this.syncOps();
    };
    tools.onChange(sync);
    sync();
    bar.addEventListener('scroll', () => this.updateOverflow(), { passive: true });
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => this.updateOverflow()).observe(bar);
    }
    this.refresh();
  }

  /** Phones: fold the operators behind one button (or unfold them back into the bar). */
  setCompact(compact: boolean): void {
    if (compact === this.compact) return;
    this.compact = compact;
    const ops = OPERATORS.map((id) => this.buttons.get(id)).filter(
      (b): b is HTMLButtonElement => b !== undefined,
    );
    if (compact) this.tray.append(...ops);
    else this.opsAnchor.after(...ops);
    if (!compact) this.setTray(false);
    this.syncOps();
    this.updateOverflow();
  }

  private setTray(open: boolean): void {
    if (!this.compact) open = false;
    this.tray.hidden = !open;
    this.opsBtn.setAttribute('aria-expanded', String(open));
    if (!open) return;
    // Above the group button, kept on screen.
    const r = this.opsBtn.getBoundingClientRect();
    const w = this.tray.offsetWidth;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    this.tray.style.left = `${left}px`;
    this.tray.style.bottom = `${window.innerHeight - r.top + 8}px`;
  }

  private syncOps(): void {
    const unlocked = OPERATORS.some((id) => this.tools.isAvailable(id));
    this.opsBtn.hidden = !this.compact || !unlocked;
    const shown = this.tools.isAvailable(this.lastOp)
      ? this.lastOp
      : (OPERATORS.find((id) => this.tools.isAvailable(id)) ?? 'adder');
    const def = BUTTONS.find((b) => b.tool === shown);
    this.opsBtn.replaceChildren(
      Object.assign(document.createElement('span'), {
        className: 'build-icon',
        textContent: def?.icon ?? '+',
      }),
      Object.assign(document.createElement('span'), { className: 'build-more', textContent: '▴' }),
    );
    this.opsBtn.setAttribute('aria-pressed', String(OPERATORS.includes(this.tools.tool)));
  }

  /** Tell the style sheet on which sides more buttons can be scrolled into view. */
  private updateOverflow(): void {
    const { scrollLeft, scrollWidth, clientWidth } = this.bar;
    const left = scrollLeft > 1;
    const right = scrollLeft + clientWidth < scrollWidth - 1;
    this.bar.dataset['more'] = left && right ? 'both' : left ? 'left' : right ? 'right' : 'none';
  }

  /**
   * Hide buildings that are still locked (PLAN §9.1); paste stays visible but is disabled
   * while the clipboard is empty. Call after a reward or a clipboard change.
   */
  refresh(): void {
    for (const [tool, btn] of this.buttons) {
      if (tool === 'paste') btn.disabled = !this.tools.isAvailable(tool);
      else btn.hidden = !this.tools.isAvailable(tool);
    }
    this.syncOps();
    this.updateOverflow();
  }
}
