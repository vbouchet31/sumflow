import type { ToolController } from '../build/tools';
import { t } from '../i18n';
import { el } from './dom';

/** One-line help above the build bar for editing tools (paste, zones, markers). */
export class ToolHint {
  private readonly box = el('div', 'tool-hint');
  private last = '';

  constructor(
    root: HTMLElement,
    private readonly tools: ToolController,
  ) {
    this.box.setAttribute('role', 'status');
    this.box.hidden = true;
    root.append(this.box);
  }

  private text(): string {
    const { tools } = this;
    switch (tools.tool) {
      case 'paste':
        return t('hint.paste', {
          i: tools.clipIndex + 1,
          n: tools.clipboardSize,
        });
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
        return '';
    }
  }

  update(): void {
    const text = this.text();
    if (text === this.last) return;
    this.last = text;
    this.box.textContent = text;
    this.box.hidden = text === '';
  }
}
