/**
 * Seed typed by a player (menu or `?seed=`): a number, or any text such as a name (PLAN §4.4).
 *
 * The game seed stays a 32-bit integer; text is hashed into one. The hash is part of the
 * game's contract: changing it would give everyone's "name" seed a different map.
 */
import { mix32, toSeed } from './rng';

/** Longest seed text accepted by the menu field. */
export const SEED_MAX_LENGTH = 32;

const INTEGER = /^-?\d+$/;

/**
 * Canonical form of a text seed: Unicode NFC, spaces trimmed and collapsed, lower case.
 * So "Vincent", "vincent" and " VINCENT " share a map; accents still count ("élodie" ≠ "elodie").
 */
export function normalizeSeedText(text: string): string {
  return text.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** FNV-1a over the UTF-8 bytes, then a splitmix32 finaliser. Unsigned 32-bit result. */
export function hashSeedText(text: string): number {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    h = Math.imul(h ^ byte, 0x01000193);
  }
  return mix32(h);
}

/**
 * Seed for a typed value, or null when it is empty (the caller then picks a random one).
 * An integer ("42", "-1") keeps its numeric value as before; anything else is hashed.
 */
export function parseSeed(text: string): number | null {
  const canonical = normalizeSeedText(text);
  if (canonical === '') return null;
  if (INTEGER.test(canonical)) return toSeed(Number(canonical));
  return hashSeedText(canonical);
}
