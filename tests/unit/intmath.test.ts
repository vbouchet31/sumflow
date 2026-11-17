import { describe, expect, it } from 'vitest';
import {
  add,
  clamp,
  digitSum,
  divmod,
  INT_MAX,
  INT_MIN,
  mul,
  pow,
  reverseDigits,
  sub,
} from '../../src/core/intmath';

describe('clamp', () => {
  it('saturates instead of wrapping', () => {
    expect(clamp(INT_MAX + 1)).toBe(INT_MAX);
    expect(clamp(INT_MIN - 1)).toBe(INT_MIN);
    expect(clamp(-0)).toBe(0);
    expect(Object.is(clamp(-0), 0)).toBe(true);
    expect(clamp(NaN)).toBe(0);
  });
});

describe('add / sub / mul', () => {
  it('computes and saturates', () => {
    expect(add(2, 3)).toBe(5);
    expect(add(INT_MAX, 1)).toBe(INT_MAX);
    expect(add(INT_MIN, -1)).toBe(INT_MIN);
    expect(sub(3, 5)).toBe(-2);
    expect(sub(7, 7)).toBe(0);
    expect(sub(INT_MIN, 1)).toBe(INT_MIN);
    expect(sub(INT_MAX, -1)).toBe(INT_MAX);
    expect(mul(-4, 5)).toBe(-20);
    expect(mul(65536, 65536)).toBe(INT_MAX);
    expect(mul(-65536, 65536)).toBe(INT_MIN);
    expect(mul(46341, 46341)).toBe(INT_MAX);
    expect(mul(46340, 46340)).toBe(2_147_395_600);
  });
});

describe('divmod', () => {
  it('b = 0 gives q = 0, r = a', () => {
    expect(divmod(17, 0)).toEqual({ q: 0, r: 17 });
    expect(divmod(-5, 0)).toEqual({ q: 0, r: -5 });
  });

  it('truncates, remainder has the sign of the dividend', () => {
    expect(divmod(17, 5)).toEqual({ q: 3, r: 2 });
    expect(divmod(-17, 5)).toEqual({ q: -3, r: -2 });
    expect(divmod(17, -5)).toEqual({ q: -3, r: 2 });
    expect(divmod(-17, -5)).toEqual({ q: 3, r: -2 });
    expect(divmod(20, 5)).toEqual({ q: 4, r: 0 });
  });

  it('duplicates n with (7n) ÷ 6 for 1 ≤ n ≤ 5', () => {
    for (let n = 1; n <= 5; n++) expect(divmod(7 * n, 6)).toEqual({ q: n, r: n });
  });

  it('saturates INT_MIN / -1', () => {
    expect(divmod(INT_MIN, -1)).toEqual({ q: INT_MAX, r: 0 });
  });
});

describe('pow', () => {
  it('handles zero exponents, including 0^0', () => {
    expect(pow(0, 0)).toBe(1);
    expect(pow(5, 0)).toBe(1);
    expect(pow(-5, 0)).toBe(1);
  });

  it('handles negative exponents', () => {
    expect(pow(1, -3)).toBe(1);
    expect(pow(-1, -3)).toBe(-1);
    expect(pow(-1, -4)).toBe(1);
    expect(pow(2, -1)).toBe(0);
    expect(pow(0, -1)).toBe(0);
  });

  it('computes positive exponents with negative bases', () => {
    expect(pow(2, 10)).toBe(1024);
    expect(pow(-2, 3)).toBe(-8);
    expect(pow(-3, 4)).toBe(81);
    expect(pow(0, 5)).toBe(0);
    expect(pow(7, 11)).toBe(1_977_326_743);
  });

  it('saturates with the right sign', () => {
    expect(pow(2, 31)).toBe(INT_MAX);
    expect(pow(2, 30)).toBe(1_073_741_824);
    expect(pow(-2, 31)).toBe(INT_MIN);
    expect(pow(-2, 32)).toBe(INT_MAX);
    expect(pow(10, 100)).toBe(INT_MAX);
    expect(pow(3, 1_000_000_000)).toBe(INT_MAX);
    expect(pow(-1, 1_000_000_001)).toBe(-1);
    expect(pow(1, INT_MAX)).toBe(1);
  });
});

describe('digit operations', () => {
  it('reverses digits, dropping leading zeros and keeping the sign', () => {
    expect(reverseDigits(12)).toBe(21);
    expect(reverseDigits(120)).toBe(21);
    expect(reverseDigits(-34)).toBe(-43);
    expect(reverseDigits(0)).toBe(0);
    expect(reverseDigits(2_000_000_009)).toBe(INT_MAX);
  });
  it('adds up digits', () => {
    expect(digitSum(1234)).toBe(10);
    expect(digitSum(99)).toBe(18);
    expect(digitSum(-99)).toBe(-18);
    expect(digitSum(0)).toBe(0);
  });
});
