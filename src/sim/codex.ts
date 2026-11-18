import type { Emit } from './progression';
import type { GameState } from './state';

/** A number curiosity the hub recognises the first time it is delivered (proposal 06). */
export interface Curiosity {
  id: string;
  /** Example shown before discovery (a hint), or the exact number for one-off entries. */
  hint: string;
  test: (v: number) => boolean;
}

/** Each discovery makes belts (hence extractors) this much faster, cumulatively. */
export const CODEX_BONUS = 0.01;

function isPrime(v: number): boolean {
  if (v < 2) return false;
  if (v % 2 === 0) return v === 2;
  if (v % 3 === 0) return v === 3;
  for (let d = 5; d * d <= v; d += 6) if (v % d === 0 || v % (d + 2) === 0) return false;
  return true;
}

function digits(v: number): string {
  return String(Math.abs(v));
}

const isSquare = (v: number): boolean => v >= 0 && Number.isInteger(Math.sqrt(v));
const isCube = (v: number): boolean => v >= 0 && Math.round(Math.cbrt(v)) ** 3 === v;
const isPalindrome = (v: number): boolean => {
  const d = digits(v);
  return d === [...d].reverse().join('');
};
const FIBONACCI = new Set<number>();
for (let a = 1, b = 2; a < 2 ** 31; [a, b] = [b, a + b]) FIBONACCI.add(a);
const FACTORIALS = new Set([
  1, 2, 6, 24, 120, 720, 5_040, 40_320, 362_880, 3_628_800, 39_916_800, 479_001_600,
]);
const PERFECT = new Set([6, 28, 496, 8_128, 33_550_336]);
const isPowerOf2 = (v: number): boolean => v > 0 && (v & (v - 1)) === 0;
const isRepdigit = (v: number): boolean => /^(\d)\1+$/.test(digits(v));
const isStaircase = (v: number): boolean => {
  const d = digits(v);
  if (d.length < 4) return false;
  for (let i = 1; i < d.length; i++) if (Number(d[i]) !== Number(d[i - 1]) + 1) return false;
  return true;
};

/** The codex, in display order. */
export const CURIOSITIES: readonly Curiosity[] = [
  { id: 'zero', hint: '0', test: (v) => v === 0 },
  { id: 'negative', hint: '−1', test: (v) => v < 0 },
  { id: 'answer', hint: '42', test: (v) => v === 42 },
  { id: 'prime3', hint: '101', test: (v) => v >= 100 && v < 1_000 && isPrime(v) },
  { id: 'prime4', hint: '1 009', test: (v) => v >= 1_000 && v < 10_000 && isPrime(v) },
  { id: 'prime6', hint: '100 003', test: (v) => v >= 100_000 && isPrime(v) },
  { id: 'square', hint: '144', test: (v) => v >= 100 && isSquare(v) },
  { id: 'cube', hint: '343', test: (v) => v >= 125 && isCube(v) },
  { id: 'power2', hint: '1 024', test: (v) => v >= 1_024 && isPowerOf2(v) },
  { id: 'palindrome3', hint: '121', test: (v) => v >= 101 && isPalindrome(v) },
  { id: 'palindrome5', hint: '12 321', test: (v) => v >= 10_001 && isPalindrome(v) },
  { id: 'repdigit', hint: '777', test: (v) => v >= 111 && isRepdigit(v) },
  { id: 'staircase', hint: '1 234', test: isStaircase },
  { id: 'fibonacci', hint: '89', test: (v) => v >= 89 && FIBONACCI.has(v) },
  { id: 'factorial', hint: '120', test: (v) => v >= 120 && FACTORIALS.has(v) },
  { id: 'perfect', hint: '28', test: (v) => PERFECT.has(v) },
  { id: 'taxicab', hint: '1 729', test: (v) => v === 1_729 },
  { id: 'kaprekar', hint: '6 174', test: (v) => v === 6_174 },
  { id: 'million', hint: '1 000 000', test: (v) => v >= 1_000_000 },
];

/** Values already looked at (most deliveries repeat the same few numbers). */
const checked = new Map<number, Set<number>>();

/** Speed multiplier earned by the codex. */
export function codexFactor(state: GameState): number {
  return 1 + CODEX_BONUS * state.codex.length;
}

/** Look at a delivered value: record and announce every new curiosity it reveals. */
export function inspectDelivery(state: GameState, value: number, emit?: Emit): void {
  if (state.codex.length === CURIOSITIES.length) return;
  let seen = checked.get(state.seed);
  if (!seen) {
    seen = new Set();
    checked.set(state.seed, seen);
  }
  // The cache only skips values: discoveries live in the state, so it never hides one.
  if (seen.has(value) && seen.size > 0) return;
  if (seen.size > 4_096) seen.clear();
  seen.add(value);
  for (const c of CURIOSITIES) {
    if (state.codex.some((d) => d.id === c.id) || !c.test(value)) continue;
    state.codex.push({ id: c.id, value });
    emit?.('curiosity', { id: c.id, value });
  }
}

/** Forget the per-session cache (tests, new game). */
export function resetCodexCache(): void {
  checked.clear();
}
