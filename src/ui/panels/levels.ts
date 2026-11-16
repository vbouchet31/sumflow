import { LEVELS } from '../../config/balance';
import { formatFull } from '../../core/format';
import { getLocale, t } from '../../i18n';
import { ensureLevels, rewardFor } from '../../sim/levels';
import type { World } from '../../sim/world';
import { el } from '../dom';
import { rewardLabel } from '../labels';

/** Levels panel (PLAN §7.2): the current level and the next ones (12 in total). */
export class LevelsPanel {
  private readonly panel: HTMLElement;
  private readonly body: HTMLTableSectionElement;
  private readonly closeBtn: HTMLButtonElement;

  constructor(
    root: HTMLElement,
    private readonly world: World,
  ) {
    this.body = el('tbody');
    const head = el(
      'tr',
      undefined,
      el('th', undefined, t('levels.colLevel')),
      el('th', undefined, t('levels.colTarget')),
      el('th', undefined, t('levels.colQty')),
      el('th', undefined, t('levels.colReward')),
    );
    this.closeBtn = el('button', 'panel-close', '✕');
    this.closeBtn.type = 'button';
    this.closeBtn.setAttribute('aria-label', t('btn.close'));
    this.closeBtn.addEventListener('click', () => this.close());
    const title = el('h2', undefined, t('levels.title'));
    title.id = 'levels-title';
    this.panel = el(
      'section',
      'panel levels-panel',
      el('header', 'panel-header', title, this.closeBtn),
      el('table', 'levels-table', el('thead', undefined, head), this.body),
    );
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-labelledby', 'levels-title');
    this.panel.hidden = true;
    this.panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.close();
      }
    });
    root.append(this.panel);
  }

  get isOpen(): boolean {
    return !this.panel.hidden;
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    this.render();
    this.panel.hidden = false;
    this.closeBtn.focus();
  }

  close(): void {
    this.panel.hidden = true;
  }

  /** Re-render if open (after a level change). */
  refresh(): void {
    if (this.isOpen) this.render();
  }

  private render(): void {
    const { state } = this.world;
    const loc = getLocale();
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
        const row = el(
          'tr',
          n === state.level ? 'current' : undefined,
          el('td', undefined, `${n}${tag}`),
          el('td', 'num', formatFull(def.target, loc)),
          el('td', 'num', formatFull(def.quantity, loc)),
          el('td', undefined, def.final ? t('reward.none') : rewardLabel(rewardFor(n))),
        );
        rows.push(row);
        if (def.final) break;
      }
    }
    this.body.replaceChildren(...rows);
  }
}
