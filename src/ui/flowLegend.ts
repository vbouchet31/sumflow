import { formatFull } from '../core/format';
import { getLocale, type MessageKey, t } from '../i18n';
import type { FlowCounts } from '../render/layers/flowView';
import { el } from './dom';

const ROWS: readonly { id: keyof FlowCounts; label: MessageKey }[] = [
  { id: 'moving', label: 'flow.moving' },
  { id: 'jammed', label: 'flow.jammed' },
  { id: 'deadEnd', label: 'flow.deadEnd' },
  { id: 'idle', label: 'flow.idle' },
];

/** Legend of the flow view, with the number of visible belts in each state. */
export class FlowLegend {
  private readonly box = el('section', 'flow-legend');
  private readonly values = new Map<keyof FlowCounts, HTMLElement>();
  private last = '';

  constructor(root: HTMLElement, onClose: () => void) {
    const close = el('button', 'flow-close', '✕');
    close.type = 'button';
    close.title = t('flow.close');
    close.setAttribute('aria-label', t('flow.close'));
    close.addEventListener('click', (e) => {
      onClose();
      if (e.detail > 0) close.blur();
    });
    const list = el('ul', 'flow-rows');
    for (const r of ROWS) {
      const value = el('span', 'flow-count');
      this.values.set(r.id, value);
      list.append(
        el(
          'li',
          `flow-row flow-${r.id}`,
          el('span', 'flow-swatch'),
          el('span', '', t(r.label)),
          value,
        ),
      );
    }
    this.box.append(el('header', 'flow-head', el('h2', '', t('flow.title')), close), list);
    this.box.hidden = true;
    root.append(this.box);
  }

  update(on: boolean, counts: FlowCounts): void {
    this.box.hidden = !on;
    if (!on) return;
    const key = `${counts.moving}|${counts.jammed}|${counts.deadEnd}|${counts.idle}`;
    if (key === this.last) return;
    this.last = key;
    for (const [id, node] of this.values) node.textContent = formatFull(counts[id], getLocale());
  }
}
