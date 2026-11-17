import { formatFull } from '../../core/format';
import { getLocale, type MessageKey, t } from '../../i18n';
import { CODEX_BONUS, CURIOSITIES } from '../../sim/codex';
import type { World } from '../../sim/world';
import { el } from '../dom';
import { Panel } from './panel';

/** Codex panel (proposal 06): every curiosity, found or still hidden, and the bonus earned. */
export class CodexPanel extends Panel {
  private readonly summary = el('p', 'codex-summary');
  private readonly grid = el('ul', 'codex-grid');
  private key = '';

  constructor(
    parent: HTMLElement,
    private readonly world: World,
  ) {
    super(parent, 'codex.title', 'codex-panel');
    this.content.append(this.summary, this.grid);
  }

  update(force = false): void {
    if (!force && !this.isOpen) return;
    const found = this.world.state.codex;
    const loc = getLocale();
    const key = `${found.map((e) => e.id).join(',')}|${loc}`;
    if (!force && key === this.key) return;
    this.key = key;
    this.summary.textContent = t('codex.summary', {
      n: found.length,
      total: CURIOSITIES.length,
      pct: Math.round(100 * CODEX_BONUS * found.length),
    });
    this.grid.replaceChildren(
      ...CURIOSITIES.map((c) => {
        const entry = found.find((e) => e.id === c.id);
        const ok = entry !== undefined;
        return el(
          'li',
          ok ? 'codex-item found' : 'codex-item',
          el('span', 'codex-badge', entry ? formatFull(entry.value, loc) : '?'),
          el(
            'span',
            'codex-text',
            el('strong', undefined, t(`codex.${c.id}` as MessageKey)),
            el('span', undefined, ok ? t(`codex.${c.id}.desc` as MessageKey) : t('codex.hidden')),
          ),
        );
      }),
    );
  }
}
