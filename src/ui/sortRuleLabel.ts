import { t } from '../i18n';
import { ruleSymbol, type SortRule } from '../sim/sorter';

/** Short label of a sorter rule ("pair", "premier", "< 50"…), drawn on the building. */
export function ruleLabel(rule: SortRule): string {
  switch (rule.kind) {
    case 'even':
      return t('sorter.even');
    case 'odd':
      return t('sorter.odd');
    case 'prime':
      return t('sorter.prime');
    default:
      return ruleSymbol(rule);
  }
}
