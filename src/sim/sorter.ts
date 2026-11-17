/** Sorter rules (proposal 03): which numbers leave through ✓. */
export type SortRuleKind = 'even' | 'odd' | 'prime' | 'eq' | 'lt' | 'gt' | 'mult';

export interface SortRule {
  kind: SortRuleKind;
  /** Operand of `eq`, `lt`, `gt` and `mult` (ignored otherwise). */
  n: number;
}

export const SORT_RULE_KINDS: readonly SortRuleKind[] = [
  'even',
  'odd',
  'prime',
  'eq',
  'lt',
  'gt',
  'mult',
];

/** Rules that use the operand `n`. */
export function ruleHasOperand(kind: SortRuleKind): boolean {
  return kind === 'eq' || kind === 'lt' || kind === 'gt' || kind === 'mult';
}

export const DEFAULT_SORT_RULE: SortRule = { kind: 'even', n: 0 };

/** Trial division up to √v: values stay within 32 bits, so at most ~46 000 steps. */
export function isPrime(v: number): boolean {
  if (v < 2) return false;
  if (v % 2 === 0) return v === 2;
  if (v % 3 === 0) return v === 3;
  for (let d = 5; d * d <= v; d += 6) {
    if (v % d === 0 || v % (d + 2) === 0) return false;
  }
  return true;
}

/** Does `v` go out through ✓? */
export function matchesRule(rule: SortRule, v: number): boolean {
  switch (rule.kind) {
    case 'even':
      return v % 2 === 0;
    case 'odd':
      return v % 2 !== 0;
    case 'prime':
      return isPrime(v);
    case 'eq':
      return v === rule.n;
    case 'lt':
      return v < rule.n;
    case 'gt':
      return v > rule.n;
    case 'mult':
      return rule.n !== 0 && v % rule.n === 0;
  }
}

/** Short label drawn on the building ("pair", "= 7", "< 50", "×3"…), language-free part. */
export function ruleSymbol(rule: SortRule): string {
  switch (rule.kind) {
    case 'eq':
      return `= ${rule.n}`;
    case 'lt':
      return `< ${rule.n}`;
    case 'gt':
      return `> ${rule.n}`;
    case 'mult':
      return `×${rule.n}`;
    default:
      return '';
  }
}
