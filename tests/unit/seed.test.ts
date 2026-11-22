import { describe, expect, it } from 'vitest';
import { toSeed } from '../../src/core/rng';
import { hashSeedText, normalizeSeedText, parseSeed, SEED_MAX_LENGTH } from '../../src/core/seed';
import { DepositMap } from '../../src/world/chunks';

describe('seed from typed text', () => {
  it('empty or blank text means "pick a random seed"', () => {
    expect(parseSeed('')).toBeNull();
    expect(parseSeed('   ')).toBeNull();
    expect(parseSeed('\t\n')).toBeNull();
  });

  it('integers keep their numeric value (existing seeds still work)', () => {
    expect(parseSeed('42')).toBe(42);
    expect(parseSeed(' 123 ')).toBe(123);
    expect(parseSeed('0')).toBe(0);
    expect(parseSeed('007')).toBe(7);
    expect(parseSeed('-1')).toBe(2 ** 32 - 1);
    expect(parseSeed('4294967296')).toBe(toSeed(4294967296));
  });

  it('text gives a 32-bit seed, the same every time', () => {
    for (const text of ['Vincent', 'élodie', '🦊', 'a b c', '1.5', '0x10', '42a']) {
      const seed = parseSeed(text);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(2 ** 32);
      expect(parseSeed(text)).toBe(seed);
    }
  });

  it('is frozen: a name must give the same map in every version of the game', () => {
    expect(parseSeed('vincent')).toBe(3201794912);
    expect(parseSeed('élodie')).toBe(583768269);
    expect(parseSeed('elodie')).toBe(1549957783);
    expect(parseSeed('🦊')).toBe(1233051305);
    expect(parseSeed('sumflow')).toBe(188501336);
  });

  it('ignores case and extra spaces, but not accents', () => {
    expect(parseSeed('Vincent')).toBe(parseSeed('vincent'));
    expect(parseSeed('  VINCENT ')).toBe(parseSeed('vincent'));
    expect(parseSeed('Jean   Paul')).toBe(parseSeed('jean paul'));
    expect(parseSeed('élodie')).not.toBe(parseSeed('elodie'));
    expect(parseSeed('jeanpaul')).not.toBe(parseSeed('jean paul'));
  });

  it('treats composed and decomposed accents as the same letter', () => {
    const composed = 'élodie'; // é as one code point
    const decomposed = 'élodie'; // e + combining acute accent
    expect(parseSeed(decomposed)).toBe(parseSeed(composed));
    expect(normalizeSeedText(decomposed)).toBe(composed);
  });

  it('different words give different seeds', () => {
    const words = ['alice', 'bob', 'carol', 'dave', 'eve', 'a', 'b', 'ab', 'ba', 'sumflow'];
    const seeds = new Set(words.map((w) => parseSeed(w)));
    expect(seeds.size).toBe(words.length);
  });

  it('a text seed never collides with the integer it looks like', () => {
    // "42" is the number 42; the hash of a word is unrelated to it.
    expect(hashSeedText('42')).not.toBe(42);
  });

  it('hashes the full length the menu accepts', () => {
    const long = 'x'.repeat(SEED_MAX_LENGTH);
    expect(parseSeed(long)).not.toBe(parseSeed(long.slice(1)));
  });

  it('drives the map like any seed', () => {
    const map = (text: string): DepositMap => new DepositMap(parseSeed(text) ?? -1);
    const a = map('Vincent');
    const b = map('vincent');
    const c = map('Élodie');
    const tiles = (m: DepositMap): string => JSON.stringify(m.guaranteed);
    expect(tiles(a)).toBe(tiles(b));
    expect(tiles(a)).not.toBe(tiles(c));
  });
});
