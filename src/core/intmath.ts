/** Saturating 32-bit signed integer arithmetic (PLAN §5). Pure functions. */

export const INT_MIN = -2_147_483_648;
export const INT_MAX = 2_147_483_647;

/** Clamp to [INT_MIN, INT_MAX] (no wrap-around). Non-integers are truncated. */
export function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n >= INT_MAX) return INT_MAX;
  if (n <= INT_MIN) return INT_MIN;
  return Math.trunc(n) || 0; // avoid -0
}

export function add(a: number, b: number): number {
  return clamp(a + b);
}

/** `a - b`. Negatives are allowed; `a - a = 0` is the only way to get 0. */
export function sub(a: number, b: number): number {
  return clamp(a - b);
}

/** Double precision is enough: any out-of-range product saturates. */
export function mul(a: number, b: number): number {
  return clamp(a * b);
}

/**
 * Truncated division: `b = 0` ⇒ `q = 0, r = a`; otherwise `q = trunc(a / b)` and
 * `r = a - q·b` (the remainder has the sign of the dividend).
 */
export function divmod(a: number, b: number): { q: number; r: number } {
  if (b === 0) return { q: 0, r: a };
  const q = clamp(Math.trunc(a / b)); // INT_MIN / -1 saturates to INT_MAX
  const r = clamp(a - Math.trunc(a / b) * b);
  return { q, r };
}

/**
 * `a^b`: `b = 0` ⇒ 1 (including 0^0); `b < 0` ⇒ 1 for a = 1, ±1 for a = -1 by parity,
 * else 0; `b > 0` ⇒ fast exponentiation, saturating as soon as |r| > INT_MAX.
 */
export function pow(a: number, b: number): number {
  if (b === 0) return 1;
  if (b < 0) {
    if (a === 1) return 1;
    if (a === -1) return b % 2 === 0 ? 1 : -1;
    return 0;
  }
  const negative = a < 0 && b % 2 !== 0;
  let base = Math.abs(a);
  let exp = b;
  let result = 1;
  const saturated = negative ? INT_MIN : INT_MAX;
  while (exp > 0) {
    if (exp & 1) {
      result *= base;
      if (result > INT_MAX) return saturated;
    }
    exp = Math.floor(exp / 2);
    if (exp > 0) {
      base *= base;
      // Squaring overflow only matters if a later multiplication uses it (it will, since exp > 0
      // and base ≥ 2 grows): any base > INT_MAX makes the final result saturate.
      if (base > INT_MAX) return saturated;
    }
  }
  return negative ? -result : result;
}

/** Number of decimal digits of |n| (0 has one digit). */
export function digitCount(n: number): number {
  let m = Math.abs(n);
  let d = 1;
  while (m >= 10) {
    m = Math.floor(m / 10);
    d++;
  }
  return d;
}

/**
 * `a ‖ b`: the digits of `b` written after those of `a` (12 ‖ 34 = 1234). The sign of `b` is
 * dropped, the sign of `a` kept (−12 ‖ 3 = −123). Saturates like the other operations.
 */
export function concat(a: number, b: number): number {
  const tail = Math.abs(b);
  const shifted = a * 10 ** digitCount(tail);
  return clamp(a < 0 ? shifted - tail : shifted + tail);
}
