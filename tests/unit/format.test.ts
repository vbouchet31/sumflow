import { describe, expect, it } from 'vitest';
import { formatCompact, formatFull } from '../../src/core/format';

describe('formatCompact', () => {
  it('keeps up to 4 characters as is', () => {
    expect(formatCompact(0)).toBe('0');
    expect(formatCompact(9999)).toBe('9999');
    expect(formatCompact(-999)).toBe('-999');
  });

  it('abbreviates with 3 significant digits', () => {
    expect(formatCompact(12_345)).toBe('12.3k');
    expect(formatCompact(456_000)).toBe('456k');
    expect(formatCompact(7_890_000)).toBe('7.89M');
    expect(formatCompact(2_147_483_647)).toBe('2.15G');
    expect(formatCompact(-1000)).toBe('-1.00k');
    expect(formatCompact(-2_147_483_648)).toBe('-2.15G');
  });

  it('rolls over to the next suffix when rounding reaches 1000', () => {
    expect(formatCompact(999_950)).toBe('1.00M');
  });
});

describe('formatFull', () => {
  it('uses the locale thousands separator', () => {
    expect(formatFull(1_234_567, 'en')).toBe('1,234,567');
    expect(formatFull(1_234_567, 'fr').replace(/\s/g, ' ')).toBe('1 234 567');
  });
});
