import type { ToolController, ToolId } from '../build/tools';
import { type MessageKey, t } from '../i18n';

interface ToolButton {
  tool: ToolId;
  label: MessageKey;
  key: string;
  icon: string;
}

const BUTTONS: readonly ToolButton[] = [
  { tool: 'belt', label: 'tool.belt', key: '1', icon: '»' },
  { tool: 'extractor', label: 'tool.extractor', key: '2', icon: '▣' },
  { tool: 'demolish', label: 'tool.demolish', key: 'X', icon: '✕' },
];

/** Bottom-centre build bar (PLAN §9.1). Locked buildings are hidden (later milestones). */
export class BuildBar {
  private readonly buttons = new Map<ToolId, HTMLButtonElement>();

  constructor(root: HTMLElement, tools: ToolController) {
    const bar = document.createElement('div');
    bar.className = 'build-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', t('toolbar.label'));
    for (const def of BUTTONS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'build-btn';
      btn.dataset['tool'] = def.tool;
      btn.title = `${t(def.label)} (${def.key})`;
      const icon = document.createElement('span');
      icon.className = 'build-icon';
      icon.textContent = def.icon;
      icon.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.className = 'build-label';
      label.textContent = t(def.label);
      const key = document.createElement('kbd');
      key.textContent = def.key;
      btn.append(icon, label, key);
      btn.addEventListener('click', () => {
        tools.setTool(def.tool);
        btn.blur();
      });
      bar.append(btn);
      this.buttons.set(def.tool, btn);
    }
    root.append(bar);
    const sync = (): void => {
      for (const [tool, btn] of this.buttons)
        btn.setAttribute('aria-pressed', String(tools.tool === tool));
    };
    tools.onChange(sync);
    sync();
  }
}
