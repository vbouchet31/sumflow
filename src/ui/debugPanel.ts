import { SPECIAL_TYPES } from '../config/buildings';
import { CARDS, SPECIAL_EDITIONS } from '../config/cards';
import { getLocale, type MessageKey, t } from '../i18n';
import { appliedEditions, freeEditions, specialStock } from '../sim/inventory';
import { firstPalierLevel } from '../sim/levels';
import { drawOffer, type SlotDraw } from '../sim/offers';
import { offerContext } from '../sim/rewards';
import type { GameState } from '../sim/state';
import { el } from './dom';
import { cardLabel } from './labels';

export interface DebugInfo {
  seed: number;
  tick: number;
  cursorX: number;
  cursorY: number;
  zoom: number;
  deposit: number | null;
}

/** The weights table is rebuilt at most this often while it is open (ms). */
const WEIGHTS_REFRESH_MS = 500;

/** Level whose offer comes next: the first one waiting, else the level being played. */
export function nextOfferLevel(state: GameState): number {
  return state.pendingOffers[0]?.level ?? Math.max(state.level, firstPalierLevel());
}

/** One row of the weights table: a card of a slot and how its weight was computed. */
export interface WeightRow {
  card: string;
  curve: number;
  /** Natural ("fil rouge") weight when it is the natural card, else null. */
  natural: number | null;
  guard: number;
  /** Share of the slot's total weight (0..1). */
  probability: number;
}

/** The weight rows of a slot as drawn (PLAN-recompenses §5.4): every card it could give. */
export function weightRows(slot: SlotDraw): WeightRow[] {
  const total = slot.weights.reduce((n, w) => n + w.weight, 0);
  return slot.weights.map((w) => ({
    card: w.card,
    curve: w.curve,
    natural: w.natural,
    guard: w.guard,
    probability: total > 0 ? w.weight / total : 0,
  }));
}

/**
 * Small read-only debug box (seed, ticks, cursor tile, zoom), with `?debug=1` or in dev. Its
 * button opens the card weights of the next offer, slot by slot, and the inventory (§5.4):
 * computed only while that table is open.
 */
export class DebugPanel {
  private readonly el: HTMLElement;
  private readonly text = el('div', 'debug-text');
  private readonly toggle: HTMLButtonElement;
  private readonly weights = el('section', 'debug-weights');
  private last = '';
  private lastWeights = '';
  private weightsAt = -Infinity;

  constructor(
    root: HTMLElement,
    private readonly state: () => GameState,
  ) {
    this.el = el('div', 'debug-panel');
    this.el.setAttribute('aria-label', t('debug.title'));
    this.toggle = el('button', 'debug-toggle', t('debug.weightsToggle'));
    this.toggle.type = 'button';
    this.toggle.setAttribute('aria-expanded', 'false');
    this.toggle.addEventListener('click', (e) => {
      this.weights.hidden = !this.weights.hidden;
      this.toggle.setAttribute('aria-expanded', String(!this.weights.hidden));
      this.weightsAt = -Infinity;
      if (e.detail > 0) this.toggle.blur();
    });
    this.el.append(this.text, this.toggle);
    this.weights.hidden = true;
    this.weights.setAttribute('aria-label', t('debug.weightsToggle'));
    root.append(this.el, this.weights);
  }

  update(info: DebugInfo, now = performance.now()): void {
    const lines = [
      t('debug.seed', { seed: info.seed }),
      t('debug.ticks', { n: info.tick }),
      t('debug.cursor', { x: info.cursorX, y: info.cursorY }),
      t('debug.zoom', { zoom: info.zoom.toFixed(2) }),
    ];
    if (info.deposit !== null) lines.push(t('debug.deposit', { value: info.deposit }));
    const text = lines.join('\n');
    if (text !== this.last) {
      this.last = text;
      this.text.textContent = text;
    }
    if (!this.weights.hidden && now - this.weightsAt >= WEIGHTS_REFRESH_MS) {
      this.weightsAt = now;
      this.renderWeights();
    }
  }

  /** Rebuild the weights table and the inventory, only when what they show changed. */
  private renderWeights(): void {
    const state = this.state();
    const level = nextOfferLevel(state);
    const slots = drawOffer(offerContext(state, level)).slots;
    const free = freeEditions(state);
    const applied = appliedEditions(state);
    const inventory = [
      ...SPECIAL_EDITIONS.map((e) =>
        t('debug.editionRow', {
          name: t(`edition.${e}`),
          o: state.editionCards[e],
          a: applied[e],
          l: state.editionsLost[e],
          f: free[e],
        }),
      ),
      ...SPECIAL_TYPES.flatMap((type) =>
        specialStock(state, type).map((s) =>
          t('debug.specialRow', {
            name: cardLabel({ card: specialCard(type), edition: s.edition }),
            o: s.obtained,
            p: s.placed,
            f: s.free,
          }),
        ),
      ),
    ];
    const key = JSON.stringify([level, slots, inventory, getLocale()]);
    if (key === this.lastWeights) return;
    this.lastWeights = key;
    const num = (x: number): string => x.toLocaleString(getLocale(), { maximumFractionDigits: 2 });
    const pct = (x: number): string =>
      x.toLocaleString(getLocale(), { style: 'percent', maximumFractionDigits: 1 });
    const parts: HTMLElement[] = [
      el('h3', 'debug-weights-title', t('debug.weights', { n: level })),
    ];
    for (const slot of slots) {
      const name = t(`offer.slot.${slot.slot}` as MessageKey);
      const pool = slot.pool;
      const caption =
        pool === null
          ? `${t('debug.slot', { slot: name })} · ${t('debug.slotEmpty')}`
          : pool === slot.slot
            ? t('debug.slot', { slot: name })
            : t('debug.slotFallback', {
                slot: t('debug.slot', { slot: name }),
                from: t(`offer.slot.${pool}` as MessageKey),
              });
      const head = el(
        'tr',
        undefined,
        ...(
          [
            'debug.colCard',
            'debug.colCurve',
            'debug.colNatural',
            'debug.colGuard',
            'debug.colProb',
          ] as const
        ).map((k) => el('th', undefined, t(k))),
      );
      const rows = weightRows(slot).map((r) => {
        const tr = el(
          'tr',
          slot.card?.card === r.card ? 'debug-drawn' : undefined,
          el('td', undefined, cardLabel({ card: r.card })),
          el('td', undefined, num(r.curve)),
          el('td', undefined, r.natural === null ? '·' : num(r.natural)),
          el('td', undefined, `×${num(r.guard)}`),
          el('td', undefined, pct(r.probability)),
        );
        tr.dataset['card'] = r.card;
        return tr;
      });
      const table = el(
        'table',
        'debug-table',
        el('caption', undefined, caption),
        el('thead', undefined, head),
        el('tbody', undefined, ...rows),
      );
      table.dataset['slot'] = slot.slot;
      parts.push(table);
    }
    parts.push(el('h3', 'debug-weights-title', t('debug.inventory')));
    parts.push(el('ul', 'debug-inventory', ...inventory.map((line) => el('li', undefined, line))));
    this.weights.replaceChildren(...parts);
  }
}

/** Card id that gives the special building `type` (for its name). */
function specialCard(type: string): string {
  return CARDS.find((c) => c.effect.kind === 'special' && c.effect.building === type)?.id ?? type;
}
