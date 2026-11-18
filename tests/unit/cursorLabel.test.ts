import { describe, expect, it } from 'vitest';
import { setLocale } from '../../src/i18n';
import { describeGhost } from '../../src/ui/cursorLabel';

const tile = (status: string) => ({ x: 0, y: 0, dir: 1, outputs: 2, status }) as never;
const empty = { belts: [], buildings: [], demolish: null, area: null };

describe('cursor label', () => {
  it('counts what a belt drag will do', () => {
    setLocale('en');
    const parts = describeGhost({
      ...empty,
      belts: [tile('new'), tile('new'), tile('replace'), tile('bridge'), tile('blocked')],
    });
    expect(parts.map((p) => p.text)).toEqual(['3 belts', '1 bridge', '1 replaced', '1 blocked']);
  });

  it('says nothing for a single tile, gives the size of a zone', () => {
    setLocale('en');
    expect(describeGhost({ ...empty, belts: [tile('new')] })).toEqual([]);
    const area = { rect: { x0: 0, y0: 0, x1: 4, y1: 2 }, kind: 'copy' as const };
    expect(describeGhost({ ...empty, area }).map((p) => p.text)).toEqual(['Area: 5 × 3']);
  });
});
