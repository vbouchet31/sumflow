import { formatFull } from '../core/format';
import { getLocale, t } from '../i18n';
import { beltStatus } from '../sim/belts';
import { connectedOutputs } from '../sim/extractor';
import { currentExtractorRate } from '../sim/upgrades';
import type { World } from '../sim/world';
import { isExtractable } from '../world/deposits';

/** Lines describing what is at tile `(x, y)` (PLAN §9.1, bottom left). Empty if nothing. */
export function describeTile(world: World, x: number, y: number): string[] {
  const num = (n: number): string => formatFull(n, getLocale());
  const b = world.buildingAt(x, y);
  if (b?.type === 'hub') {
    const r = world.state.levelRequirement;
    if (!r) return [t('tip.hub'), t('hub.finished')];
    return [
      t('tip.hub'),
      t('tip.hubLevel', {
        n: world.state.level,
        value: num(r.value),
        delivered: num(r.delivered),
        required: num(r.required),
      }),
    ];
  }
  if (b?.type === 'extractor') {
    const outs = connectedOutputs(world, b);
    return [
      t('tip.extractor'),
      t('tip.extractValue', { value: num(b.extractValue ?? 0) }),
      t('tip.rate', { rate: currentExtractorRate(world.state).toLocaleString(getLocale()) }),
      outs > 0 ? t('tip.outputs', { n: outs }) : t('tip.noOutput'),
    ];
  }
  const belt = world.beltAt(x, y);
  if (belt) {
    const lines = [t('tip.belt')];
    lines.push(belt.item ? t('tip.item', { value: num(belt.item.value) }) : t('tip.empty'));
    const status = beltStatus(world, belt);
    if (status === 'noInput') lines.push(t('tip.blockedNoInput'));
    else if (status === 'waiting') lines.push(t('tip.waiting'));
    return lines;
  }
  const d = world.deposits.depositAt(x, y);
  if (d) {
    return [
      t('tip.deposit', { value: num(d.value) }),
      isExtractable(d.value, world.state.maxExtraction) ? t('tip.extractable') : t('tip.locked'),
    ];
  }
  return [];
}

/** Bottom-left contextual tooltip. */
export class Tooltip {
  private readonly el: HTMLElement;
  private last = '';

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'tooltip';
    this.el.setAttribute('role', 'status');
    this.el.hidden = true;
    root.append(this.el);
  }

  update(lines: string[]): void {
    const text = lines.join('\n');
    if (text === this.last) return;
    this.last = text;
    this.el.hidden = lines.length === 0;
    this.el.replaceChildren();
    lines.forEach((line, i) => {
      const div = document.createElement('div');
      div.textContent = line;
      if (i === 0) div.className = 'tooltip-title';
      this.el.append(div);
    });
  }
}
