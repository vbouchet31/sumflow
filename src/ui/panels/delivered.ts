import { LEVELS, type Track, TRACKS } from '../../config/balance';
import { formatFull } from '../../core/format';
import { getLocale, t } from '../../i18n';
import { ensureLevels } from '../../sim/levels';
import type { World } from '../../sim/world';
import { el } from '../dom';
import { Panel } from './panel';

type Unit = 's' | 'min' | 'h';
const UNITS: readonly Unit[] = ['s', 'min', 'h'];
const FACTOR: Record<Unit, number> = { s: 1, min: 60, h: 3600 };

/** Refresh period of the list, in ms (rates move slowly). */
const REFRESH_MS = 500;

/**
 * Delivered numbers panel (PLAN §9.2): values delivered over the last minute with their
 * rate; level target first (highlighted), then upgrade numbers (with their track), then
 * the others (greyed). Unit toggle /s, /min, /h. Next 12 level targets below.
 */
export class DeliveredPanel extends Panel {
  private unit: Unit = 's';
  private readonly unitBtn: HTMLButtonElement;
  private readonly body = el('tbody');
  private readonly next = el('div', 'next-targets');
  private lastRender = 0;

  constructor(
    parent: HTMLElement,
    private readonly world: World,
  ) {
    super(parent, 'deliv.title', 'delivered-panel');
    this.unitBtn = el('button', 'unit-btn');
    this.unitBtn.type = 'button';
    this.unitBtn.addEventListener('click', () => {
      this.unit = UNITS[(UNITS.indexOf(this.unit) + 1) % UNITS.length] ?? 's';
      this.update(true);
    });
    const table = el(
      'table',
      'deliv-table',
      el(
        'thead',
        undefined,
        el(
          'tr',
          undefined,
          el('th', undefined, t('deliv.colValue')),
          el('th', undefined, t('deliv.colUse')),
          el('th', 'num', t('deliv.colRate')),
        ),
      ),
      this.body,
    );
    this.content.append(
      el('div', 'deliv-tools', this.unitBtn),
      table,
      el('h3', undefined, t('deliv.nextTargets')),
      this.next,
    );
  }

  update(force = false): void {
    if (!this.isOpen && !force) return;
    const now = performance.now();
    if (!force && now - this.lastRender < REFRESH_MS) return;
    this.lastRender = now;
    const { state, stats } = this.world;
    const loc = getLocale();
    this.unitBtn.textContent = t(`deliv.unit.${this.unit}`);
    this.unitBtn.setAttribute('aria-label', t('deliv.unitToggle'));

    const target = state.levelRequirement?.value ?? null;
    const usedBy = new Map<number, Track[]>();
    for (const track of TRACKS) {
      for (const r of state.upgradeReqs[track]) {
        const list = usedBy.get(r.value) ?? [];
        if (!list.includes(track)) list.push(track);
        usedBy.set(r.value, list);
      }
    }
    const rates = stats.rates();
    const values = new Set<number>(rates.keys());
    if (target !== null) values.add(target);
    for (const v of usedBy.keys()) values.add(v);
    const rank = (v: number): number => (v === target ? 0 : usedBy.has(v) ? 1 : 2);
    const sorted = [...values].sort(
      (a, b) => rank(a) - rank(b) || (rates.get(b) ?? 0) - (rates.get(a) ?? 0) || a - b,
    );

    this.body.replaceChildren(
      ...sorted.map((v) => {
        const r = rank(v);
        const use =
          r === 0
            ? t('deliv.level')
            : r === 1
              ? (usedBy.get(v) ?? []).map((tr) => t(`track.${tr}`)).join(', ')
              : '';
        const rate = (rates.get(v) ?? 0) * FACTOR[this.unit];
        return el(
          'tr',
          r === 0 ? 'is-target' : r === 1 ? 'is-upgrade' : 'is-other',
          el('td', 'num', formatFull(v, loc)),
          el('td', undefined, use),
          el('td', 'num', rate.toLocaleString(loc, { maximumFractionDigits: 2 })),
        );
      }),
    );

    ensureLevels(state.seed, state.levels, state.level + LEVELS.lookahead);
    const items: HTMLElement[] = [];
    if (state.levelRequirement) {
      for (let n = state.level; n < state.level + LEVELS.preview; n++) {
        const def = state.levels[n - 1];
        if (!def) break;
        items.push(
          el('span', n === state.level ? 'chip current' : 'chip', formatFull(def.target, loc)),
        );
        if (def.final) break;
      }
    }
    this.next.replaceChildren(...items);
  }
}
