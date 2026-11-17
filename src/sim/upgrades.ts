import {
  beltSpeed,
  extractorCapacity,
  MAPGEN,
  operatorSpeed,
  type Track,
  TRACKS,
  UPGRADE_CAPS,
  UPGRADE_GEN,
  UPGRADE_ROUNDING,
  UPGRADE_SEQUENCES,
  UPGRADE_TRACK_FACTOR,
  UPGRADE_WINDOW_FACTORS,
  upgradeCost,
} from '../config/balance';
import { hash2, mulberry32 } from '../core/rng';
import { codexFactor } from './codex';
import type { GameState, Requirement } from './state';

/** Current belt speed in tiles/s. */
export function currentBeltSpeed(state: GameState): number {
  return beltSpeed(state.upgrades.belt) * codexFactor(state);
}

/** Current extractor output in items/s: capacity (full belts) × belt speed (PLAN §6.3). */
export function currentExtractorRate(state: GameState): number {
  return extractorCapacity(state.upgrades.extractor) * currentBeltSpeed(state);
}

/** Effect value of a track at an upgrade level (tiles/s, belts or op/s). */
export function trackValue(track: Track, level: number): number {
  if (track === 'belt') return beltSpeed(level);
  if (track === 'extractor') return extractorCapacity(level);
  return operatorSpeed(track, level);
}

const TRACK_SALT = 0x55504752; // "UPGR"

/** One uniform draw for term `k` of a track, independent of generation order. */
function draw(seed: number, track: Track, k: number): number {
  return mulberry32(hash2(seed ^ TRACK_SALT, TRACKS.indexOf(track), k))();
}

/**
 * Extend a track's sequence t1, t2, … (index 0 = t1) up to `upTo` terms (PLAN §7.3).
 * Base values < 30 are kept; the others get ±15 %; beyond t10, ×U(1.10, 1.35). The
 * sequence stays strictly increasing and never contains 10.
 */
export function ensureSequence(seed: number, track: Track, seq: number[], upTo: number): number[] {
  const base = UPGRADE_SEQUENCES[track];
  while (seq.length < upTo) {
    const k = seq.length + 1;
    const prev = seq[seq.length - 1] ?? 0;
    if (prev > UPGRADE_GEN.maxTerm) break;
    const b = base[k - 1];
    let t: number;
    if (b !== undefined) {
      const { min, max } = UPGRADE_GEN.jitter;
      t =
        b < UPGRADE_GEN.keepBelow ? b : Math.round(b * (min + (max - min) * draw(seed, track, k)));
    } else {
      const { min, max } = UPGRADE_GEN.growth;
      t = Math.round(prev * (min + (max - min) * draw(seed, track, k)));
    }
    if (t <= prev) t = prev + 1;
    if (t === MAPGEN.forbiddenValue) t += 1;
    seq.push(t);
  }
  return seq;
}

/** Indices (1-based) of the sequence terms required to go from level L to L+1. */
export function windowTerms(level: number): number[] {
  if (level <= 1) return [1];
  if (level === 2) return [1, 2];
  return [level - 2, level - 1, level];
}

function roundQty(n: number): number {
  return Math.max(UPGRADE_ROUNDING, Math.round(n / UPGRADE_ROUNDING) * UPGRADE_ROUNDING);
}

/** Track unlocked? (PLAN §7.3 table.) */
export function isTrackUnlocked(state: GameState, track: Track): boolean {
  if (!state.unlockedFeatures.includes('upgrades')) return false;
  switch (track) {
    case 'belt':
    case 'extractor':
    case 'adder':
      return true;
    case 'multiplier':
      return state.unlockedBuildings.includes('multiplier');
    case 'subdiv':
      return state.unlockedBuildings.includes('subtractor');
    case 'exponent':
      return state.unlockedBuildings.includes('exponent');
  }
}

/** True when the track cannot go further (extractor 12, soft caps, or terms over 2e9). */
export function isTrackMaxed(state: GameState, track: Track): boolean {
  const L = state.upgrades[track];
  if (track === 'extractor') return L >= UPGRADE_CAPS.extractorLevel;
  if (track === 'belt' && beltSpeed(L) >= UPGRADE_CAPS.beltSpeed) return true;
  if (track === 'adder' && operatorSpeed(track, L) >= UPGRADE_CAPS.adderSpeed) return true;
  if (
    track !== 'belt' &&
    track !== 'adder' &&
    operatorSpeed(track, L) >= UPGRADE_CAPS.operatorSpeed
  )
    return true;
  const seq = ensureSequence(state.seed, track, state.upgradeSeqs[track], L);
  const last = windowTerms(L).at(-1) ?? 1;
  return seq.length < last || (seq[last - 1] ?? 0) > UPGRADE_GEN.maxTerm;
}

/** Fresh requirements (delivered = 0) to upgrade `track` from its current level. */
export function buildUpgradeRequirements(state: GameState, track: Track): Requirement[] {
  if (!isTrackUnlocked(state, track) || isTrackMaxed(state, track)) return [];
  const L = state.upgrades[track];
  const seq = ensureSequence(state.seed, track, state.upgradeSeqs[track], L);
  const c = upgradeCost(L) * UPGRADE_TRACK_FACTOR[track];
  return windowTerms(L).map((k, i) => ({
    value: seq[k - 1] ?? 0,
    required: roundQty(c * (UPGRADE_WINDOW_FACTORS[i] ?? 1)),
    delivered: 0,
  }));
}

/** Make sure every unlocked track has its requirements (after an unlock or a load). */
export function syncUpgradeRequirements(state: GameState): void {
  for (const track of TRACKS) {
    if (state.upgradeReqs[track].length === 0) {
      state.upgradeReqs[track] = buildUpgradeRequirements(state, track);
    }
  }
}

export function isUpgradeReady(state: GameState, track: Track): boolean {
  const reqs = state.upgradeReqs[track];
  return reqs.length > 0 && reqs.every((r) => r.delivered >= r.required);
}

/** Buy the next level of `track` if all its requirements are met. Returns true on success. */
export function buyUpgrade(state: GameState, track: Track): boolean {
  if (!isUpgradeReady(state, track)) return false;
  state.upgrades[track] += 1;
  state.upgradeReqs[track] = buildUpgradeRequirements(state, track);
  return true;
}

/** Debug: set a track level and rebuild its requirements. */
export function setUpgradeLevel(state: GameState, track: Track, level: number): void {
  state.upgrades[track] = Math.max(1, Math.floor(level));
  state.upgradeReqs[track] = buildUpgradeRequirements(state, track);
}
