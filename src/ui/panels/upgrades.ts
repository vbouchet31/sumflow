import { type Track, TRACKS } from '../../config/balance';
import { formatFull } from '../../core/format';
import { getLocale, type MessageKey, t } from '../../i18n';
import { purchase, setAutoBuy } from '../../sim/progression';
import { isTrackMaxed, isTrackUnlocked, isUpgradeReady, trackValue } from '../../sim/upgrades';
import type { World } from '../../sim/world';
import { el } from '../dom';
import { Panel } from './panel';

const UNIT: Record<Track, MessageKey> = {
  belt: 'upg.unitBelt',
  extractor: 'upg.unitExtractor',
  adder: 'upg.unitOps',
  multiplier: 'upg.unitOps',
  subdiv: 'upg.unitOps',
  exponent: 'upg.unitOps',
};

function fmtValue(track: Track, level: number): string {
  const v = trackValue(track, level);
  return t(UNIT[track], { v: v.toLocaleString(getLocale(), { maximumFractionDigits: 3 }) });
}

interface Row {
  box: HTMLElement;
  title: HTMLElement;
  effect: HTMLElement;
  reqs: HTMLElement;
  button: HTMLButtonElement;
  key: string;
}

/** Upgrades panel (PLAN §7.3, §9.3): one row per unlocked track. */
export class UpgradesPanel extends Panel {
  private readonly rows = new Map<Track, Row>();
  private readonly list = el('div', 'upg-list');
  private readonly auto: HTMLInputElement;

  constructor(
    parent: HTMLElement,
    private readonly world: World,
  ) {
    super(parent, 'upg.title', 'upgrades-panel');
    this.auto = el('input');
    this.auto.type = 'checkbox';
    this.auto.addEventListener('change', () =>
      setAutoBuy(this.world.state, this.auto.checked, this.world.emit),
    );
    const label = el('label', 'upg-auto', this.auto, t('upg.autoBuy'));
    this.content.append(label, this.list);
    for (const track of TRACKS) {
      const title = el('div', 'upg-title');
      const effect = el('div', 'upg-effect');
      const reqs = el('div', 'upg-reqs');
      const button = el('button', 'primary-btn upg-buy', t('upg.buy'));
      button.type = 'button';
      button.addEventListener('click', () => {
        purchase(this.world.state, track, this.world.emit);
        this.update(true);
      });
      const box = el('article', 'upg-row', el('div', 'upg-head', title, effect), reqs, button);
      box.dataset['track'] = track;
      this.list.append(box);
      this.rows.set(track, { box, title, effect, reqs, button, key: '' });
    }
  }

  update(force = false): void {
    if (!force && !this.isOpen) return;
    const { state } = this.world;
    const loc = getLocale();
    this.auto.checked = state.autoBuyUpgrades;
    for (const [track, row] of this.rows) {
      const unlocked = isTrackUnlocked(state, track);
      row.box.hidden = !unlocked;
      if (!unlocked) continue;
      const L = state.upgrades[track];
      const maxed = isTrackMaxed(state, track);
      const reqs = state.upgradeReqs[track];
      const key = `${L}|${maxed}|${reqs.map((r) => `${r.value}:${r.delivered}/${r.required}`).join(',')}|${loc}`;
      if (!force && key === row.key) continue;
      row.key = key;
      row.title.textContent = `${t(`track.${track}`)} · ${t('upg.level', { n: L })}`;
      row.effect.textContent = maxed
        ? `${fmtValue(track, L)} · ${t('upg.max')}`
        : `${fmtValue(track, L)} → ${fmtValue(track, L + 1)}`;
      row.reqs.replaceChildren(
        ...reqs.map((r) => {
          const pct = Math.min(100, (100 * r.delivered) / r.required);
          const fill = el('div', 'upg-bar-fill');
          fill.style.width = `${pct}%`;
          const done = r.delivered >= r.required;
          return el(
            'div',
            done ? 'upg-req done' : 'upg-req',
            el('span', 'upg-req-value', formatFull(r.value, loc)),
            el(
              'span',
              'upg-req-count',
              `${formatFull(r.delivered, loc)} / ${formatFull(r.required, loc)}`,
            ),
            el('div', 'upg-bar', fill),
          );
        }),
      );
      row.button.hidden = maxed;
      row.button.disabled = !isUpgradeReady(state, track);
    }
  }
}
