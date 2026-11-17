import { t } from '../i18n';
import { ruleHasOperand, SORT_RULE_KINDS, type SortRule, type SortRuleKind } from '../sim/sorter';
import { el, releaseFocus, trapTab } from './dom';

/**
 * Dialog choosing a sorter's rule (proposal 03): one choice per rule, plus N for the rules
 * that compare. Enter applies, Escape cancels. Reuses the marker dialog styles.
 */
export class SorterEditor {
  private readonly overlay: HTMLElement;
  private readonly select = el('select', 'marker-input');
  private readonly input = el('input', 'marker-input');
  private readonly nRow: HTMLElement;
  private onDone: ((rule: SortRule | null) => void) | null = null;

  constructor(root: HTMLElement) {
    for (const kind of SORT_RULE_KINDS) {
      const opt = el('option', undefined, t(`sorter.kind.${kind}`));
      opt.value = kind;
      this.select.append(opt);
    }
    this.select.setAttribute('aria-label', t('sorter.title'));
    this.input.type = 'number';
    this.input.step = '1';
    this.input.setAttribute('aria-label', t('sorter.n'));
    this.nRow = el('label', 'sorter-n', el('span', undefined, t('sorter.n')), this.input);
    this.select.addEventListener('change', () => this.syncN());
    const ok = el('button', 'primary-btn', t('sorter.ok'));
    ok.type = 'submit';
    const cancel = el('button', 'secondary-btn', t('sorter.cancel'));
    cancel.type = 'button';
    const form = el(
      'form',
      'marker-card sorter-card',
      el('h2', undefined, t('sorter.title')),
      el('p', 'sorter-intro', t('sorter.intro')),
      this.select,
      this.nRow,
      el('div', 'marker-actions', cancel, ok),
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const kind = this.select.value as SortRuleKind;
      const n = Math.trunc(Number(this.input.value)) || 0;
      this.finish({ kind, n });
    });
    cancel.addEventListener('click', () => this.finish(null));
    form.addEventListener('keydown', (e) => {
      trapTab(form, e);
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.finish(null);
      }
    });
    this.overlay = el('div', 'overlay marker-overlay', form);
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-label', t('sorter.title'));
    this.overlay.hidden = true;
    this.overlay.addEventListener('pointerdown', (e) => {
      if (e.target === this.overlay) this.finish(null);
    });
    root.append(this.overlay);
  }

  get isOpen(): boolean {
    return !this.overlay.hidden;
  }

  open(rule: SortRule, done: (rule: SortRule | null) => void): void {
    this.onDone = done;
    this.select.value = rule.kind;
    this.input.value = String(rule.n);
    this.syncN();
    this.overlay.hidden = false;
    this.select.focus();
  }

  private syncN(): void {
    this.nRow.hidden = !ruleHasOperand(this.select.value as SortRuleKind);
  }

  private finish(rule: SortRule | null): void {
    if (this.overlay.hidden) return;
    releaseFocus(this.overlay);
    this.overlay.hidden = true;
    const done = this.onDone;
    this.onDone = null;
    done?.(rule);
  }
}
