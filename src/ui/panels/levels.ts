import { LEVELS } from '../../config/balance';
import { formatFull } from '../../core/format';
import { getLocale, t } from '../../i18n';
import { ensureLevels, rewardFor } from '../../sim/levels';
import type { World } from '../../sim/world';
import { el } from '../dom';
import { rewardLabel } from '../labels';
import { Panel } from './panel';

/** Levels panel (PLAN §7.2): the current level and the next ones (12 in total). */
export class LevelsPanel extends Panel {
  private readonly body = el('tbody');
  private key = '';

  constructor(
    parent: HTMLElement,
    private readonly world: World,
  ) {
    super(parent, 'levels.title', 'levels-panel');
    const head = el(
      'tr',
      undefined,
      el('th', undefined, t('levels.colLevel')),
      el('th', undefined, t('levels.colTarget')),
      el('th', undefined, t('levels.colQty')),
      el('th', undefined, t('levels.colReward')),
    );
    this.content.append(el('table', 'levels-table', el('thead', undefined, head), this.body));
  }

  update(force = false): void {
    if (!force && !this.isOpen) return;
    const { state } = this.world;
    const loc = getLocale();
    const key = `${state.level}|${state.levelRequirement === null}|${loc}`;
    if (!force && key === this.key) return;
    this.key = key;
    ensureLevels(state.seed, state.levels, state.level + LEVELS.lookahead);
    const rows: HTMLTableRowElement[] = [];
    if (state.levelRequirement) {
      for (let n = state.level; n < state.level + LEVELS.preview; n++) {
        const def = state.levels[n - 1];
        if (!def) break;
        const tag =
          n === state.level
            ? ` (${t('levels.current')})`
            : def.final
              ? ` (${t('levels.final')})`
              : '';
        rows.push(
          el(
            'tr',
            n === state.level ? 'current' : undefined,
            el('td', undefined, `${n}${tag}`),
            el('td', 'num', formatFull(def.target, loc)),
            el('td', 'num', formatFull(def.quantity, loc)),
            el('td', undefined, def.final ? t('reward.none') : rewardLabel(rewardFor(n))),
          ),
        );
        if (def.final) break;
      }
    }
    this.body.replaceChildren(...rows);
  }
}
