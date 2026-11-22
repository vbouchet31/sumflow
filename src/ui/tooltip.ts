import { formatFull } from '../core/format';
import { key } from '../core/grid';
import { getLocale, t } from '../i18n';
import { beltStatus, storageCapacity } from '../sim/belts';
import type { Building } from '../sim/entities';
import { extractorRate } from '../sim/extractor';
import { editionEffect } from '../sim/inventory';
import { connectedOutputs } from '../sim/outputs';
import { isOperator } from '../sim/entities';
import { cycleDuration } from '../sim/operators';
import { type MessageKey } from '../i18n';
import type { World } from '../sim/world';
import { isExtractable } from '../world/deposits';

/** Lines describing what is at tile `(x, y)` (PLAN §9.1, bottom left). Empty if nothing. */
export function describeTile(world: World, x: number, y: number): string[] {
  const lines = describeObject(world, x, y);
  const marker = world.state.markers.get(key(x, y));
  if (marker) lines.push(t('tip.marker', { text: marker.text }));
  return lines;
}

/** A multiplier in the current locale: 1.5 → "1,5" in French. */
function factor(x: number): string {
  return x.toLocaleString(getLocale(), { maximumFractionDigits: 2 });
}

/**
 * The edition of a building (PLAN-recompenses §4.6): its name and effect, then whether it
 * was applied from a card (and what demolishing does) or is native. Nothing for base.
 */
export function editionLines(world: World, b: Building): string[] {
  if (b.edition === undefined) return [];
  const name = t(`edition.${b.edition}`);
  const params = { edition: name, Edition: name.charAt(0).toLocaleUpperCase() + name.slice(1) };
  const fx = editionEffect(b);
  const lines: string[] = [];
  if (fx.speed !== undefined) lines.push(t('tip.editionSpeed', { ...params, x: factor(fx.speed) }));
  if (fx.rate !== undefined) lines.push(t('tip.editionRate', { ...params, x: factor(fx.rate) }));
  if (fx.capacity !== undefined)
    lines.push(t('tip.editionCapacity', { ...params, x: factor(fx.capacity) }));
  if (lines.length === 0) lines.push(t('tip.editionPlain', params));
  if (b.editionApplied !== true) lines.push(t('tip.editionNative'));
  else if (world.editionRules.returnOnDemolish) lines.push(t('tip.editionApplied'));
  else lines.push(t('tip.editionPermanent'));
  return lines;
}

function describeObject(world: World, x: number, y: number): string[] {
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
      t('tip.rate', {
        rate: extractorRate(world, b).toLocaleString(getLocale(), { maximumFractionDigits: 3 }),
      }),
      outs > 0 ? t('tip.outputs', { n: outs }) : t('tip.noOutput'),
      ...editionLines(world, b),
    ];
  }
  if (b?.type === 'storage') {
    const count = b.storeCount ?? 0;
    return [
      t('tool.storage'),
      count > 0 && b.storeValue != null
        ? t('tip.storeValue', { value: num(b.storeValue) })
        : t('tip.storeEmpty'),
      t('tip.storeFill', { n: num(count), max: num(storageCapacity(b)) }),
      ...editionLines(world, b),
    ];
  }
  if (b && isOperator(b.type)) {
    const list = (buf: number[] | undefined): string =>
      buf && buf.length > 0 ? buf.map(num).join(', ') : t('tip.none');
    const dur = cycleDuration(world, { type: b.type, edition: b.edition });
    const lines = [t(`tool.${b.type}` as MessageKey)];
    lines.push(t('tip.bufA', { items: list(b.inA) }), t('tip.bufB', { items: list(b.inB) }));
    if (b.type === 'divider') {
      lines.push(t('tip.bufQ', { items: list(b.outQ) }), t('tip.bufR', { items: list(b.outR) }));
    } else {
      lines.push(t('tip.bufOut', { items: list(b.out) }));
    }
    const cycle = b.cycle ?? -1;
    lines.push(
      cycle < 0 ? t('tip.idle') : t('tip.cycle', { pct: Math.round(100 * (1 - cycle / dur)) }),
      t('tip.speed', { rate: (1 / dur).toLocaleString(getLocale(), { maximumFractionDigits: 3 }) }),
      ...editionLines(world, b),
    );
    return lines;
  }
  const bridge = world.bridgeAt(x, y);
  if (bridge) {
    const lane = (l: typeof bridge.h): string => (l?.item ? num(l.item.value) : t('tip.none'));
    return [
      t('tip.bridge'),
      t('tip.laneH', { item: lane(bridge.h) }),
      t('tip.laneV', { item: lane(bridge.v) }),
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
