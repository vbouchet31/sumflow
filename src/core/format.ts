import type { Locale } from '../i18n';

/** Full integer with locale thousands separators (tooltips, panels). PLAN §5. */
export function formatFull(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    maximumFractionDigits: 0,
  }).format(value);
}

const SUFFIXES = ['', 'k', 'M', 'G'] as const;

/**
 * Compact display for items (PLAN §5): up to 4 characters as is (`9999`, `-999`),
 * beyond that 3 significant digits, rounded, with a suffix (`12.3k`, `456k`, `7.89M`, `2.15G`).
 */
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (String(value).length <= 4) return String(value);
  const sign = value < 0 ? '-' : '';
  let tier = Math.max(1, Math.floor(Math.log10(abs) / 3));
  for (;;) {
    const scaled = abs / 1000 ** tier;
    const decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
    const text = scaled.toFixed(decimals);
    // Rounding can roll over (999 950 → "1000k"): move to the next suffix.
    if (Number(text) >= 1000 && tier < SUFFIXES.length - 1) {
      tier += 1;
      continue;
    }
    return `${sign}${text}${SUFFIXES[tier] ?? ''}`;
  }
}
