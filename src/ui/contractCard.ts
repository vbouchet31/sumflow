import { CONTRACTS } from '../config/balance';
import { formatFull } from '../core/format';
import { getLocale, t } from '../i18n';
import { boostFactor, secondsUntil } from '../sim/contracts';
import type { GameState } from '../sim/state';
import { el } from './dom';

function clock(seconds: number): string {
  const s = Math.ceil(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Card under the HUD: the running contract, or the active Overdrive (proposal 04). */
export class ContractCard {
  private readonly title = el('div', 'contract-title');
  private readonly order = el('div', 'contract-order');
  private readonly fill = el('div', 'contract-bar-fill');
  private readonly bar = el('div', 'contract-bar', this.fill);
  private readonly info = el('div', 'contract-info');
  private readonly box = el(
    'section',
    'contract-card',
    this.title,
    this.order,
    this.bar,
    this.info,
  );
  private last = '';

  constructor(root: HTMLElement) {
    this.box.hidden = true;
    this.box.setAttribute('aria-live', 'polite');
    root.append(this.box);
  }

  update(state: GameState): void {
    const c = state.contracts.current;
    const loc = getLocale();
    const boosting = boostFactor(state) > 1;
    const key = c
      ? `c|${c.value}|${c.delivered}|${c.required}|${Math.ceil(secondsUntil(state, c.endsAt))}|${loc}`
      : boosting
        ? `b|${Math.ceil(secondsUntil(state, state.contracts.boostUntil))}|${loc}`
        : '';
    if (key === this.last) return;
    this.last = key;
    this.box.hidden = key === '';
    this.box.classList.toggle('is-boost', !c && boosting);
    const f = CONTRACTS.boostFactor.toLocaleString(loc);
    if (c) {
      this.title.textContent = `${t('contract.title')} · ${t('contract.left', { time: clock(secondsUntil(state, c.endsAt)) })}`;
      this.order.textContent = `${t('contract.order', { n: formatFull(c.required, loc), value: formatFull(c.value, loc) })}  ${formatFull(c.delivered, loc)} / ${formatFull(c.required, loc)}`;
      this.bar.hidden = false;
      this.fill.style.width = `${Math.min(100, (100 * c.delivered) / c.required)}%`;
      this.info.textContent = t('contract.reward', { f, s: CONTRACTS.boostSeconds });
    } else if (boosting) {
      this.title.textContent = t('contract.boost', { f });
      this.order.textContent = '';
      this.bar.hidden = true;
      this.info.textContent = t('contract.boostLeft', {
        time: clock(secondsUntil(state, state.contracts.boostUntil)),
      });
    }
  }
}
