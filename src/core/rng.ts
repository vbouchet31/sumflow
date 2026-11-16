/** Seeded, deterministic randomness (PLAN §4.4). Never use Math.random in sim/world code. */

/** splitmix32-style 32-bit finaliser. Returns an unsigned 32-bit integer. */
export function mix32(x: number): number {
  let h = x | 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  return (h ^ (h >>> 15)) >>> 0;
}

/** Hash a seed and two integers (e.g. chunk coordinates) into a 32-bit sub-seed. */
export function hash2(seed: number, a: number, b: number): number {
  let h = mix32((seed | 0) + 0x9e3779b9);
  h = mix32(h ^ (a | 0));
  h = mix32((h + Math.imul(b | 0, 0x85ebca6b)) | 0);
  return h;
}

/** A pseudo-random generator returning floats in [0, 1). */
export type Rng = () => number;

/** mulberry32: small, fast, good-enough PRNG. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform float in [min, max). */
export function uniform(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng();
}

/** Uniform integer in [min, max] (inclusive). */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Normalise any number to a 32-bit unsigned seed. */
export function toSeed(n: number): number {
  return Math.trunc(n) >>> 0;
}
