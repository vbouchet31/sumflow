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
  { tool: 'beacon', label: 'tool.beacon', key: '0', icon: '✷' },
  { tool: 'priority', label: 'tool.priority', key: 'P', icon: '◆' },
  { tool: 'demolish', label: 'tool.demolish', key: 'X', icon: '✕', edit: true },
  { tool: 'clear', label: 'tool.clear', key: 'C', icon: '○', edit: true },
  { tool: 'copy', label: 'tool.copy', key: 'Ctrl+C', short: '^C', icon: '⧉', edit: true },
  { tool: 'cut', label: 'tool.cut', key: 'Ctrl+X', short: '^X', icon: '✂\uFE0E', edit: true },
  { tool: 'paste', label: 'tool.paste', key: 'Ctrl+V', short: '^V', icon: '⎘', edit: true },
  { tool: 'marker', label: 'tool.marker', key: 'B', icon: '⚑', edit: true },
];

/** Bottom-centre build bar (PLAN §9.1). Locked buildings are hidden (later milestones). */
export class BuildBar {
  private readonly buttons = new Map<ToolId, HTMLButtonElement>();
  private readonly bar = document.createElement('div');

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
    root.append(bar);
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
      new ResizeObserver(() => this.updateOverflow()).observe(bar);
    }
    this.refresh();
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
    this.updateOverflow();
  }
}
