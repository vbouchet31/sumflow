import { guaranteedRule, MAPGEN } from '../config/balance';
import { CHUNK_SIZE } from '../core/grid';
import { hash2, mix32, mulberry32, type Rng } from '../core/rng';
import { type Deposit, depositDistance, depositsConflict, inClearZone } from './deposits';

/** Salt separating the guaranteed-deposit stream from chunk streams. */
const GUARANTEED_SALT = 0x6a09e667;

/**
 * Margin (in tiles) kept free on each side of a chunk by its random deposits, so that
 * random deposits of neighbouring chunks never conflict: generation stays independent
 * of the order in which chunks are generated.
 */
const CHUNK_MARGIN = (MAPGEN.depositSize - 1) / 2 + 1;

function conflictsAny(x: number, y: number, placed: readonly Deposit[]): boolean {
  for (const d of placed) if (depositsConflict(d, { x, y })) return true;
  return false;
}

/**
 * Step A (PLAN §4.4): deposits guaranteed for values 1..80 (except 10), at controlled
 * distances from the hub. Computed from the seed only.
 */
export function generateGuaranteed(seed: number): Deposit[] {
  const rng = mulberry32(mix32(seed ^ GUARANTEED_SALT));
  const placed: Deposit[] = [];
  for (let v = 1; v <= MAPGEN.guaranteedMaxValue; v++) {
    const rule = guaranteedRule(v);
    if (!rule) continue;
    for (let i = 0; i < rule.count; i++) {
      // Value 1 gets one deposit per quadrant; others anywhere around the hub.
      const sector = rule.perQuadrant ? { start: (i * Math.PI) / 2, span: Math.PI / 2 } : null;
      const span = sector ? sector.span : 2 * Math.PI;
      const offset = rng() * span;
      let dist = rule.minDist + rng() * (rule.maxDist - rule.minDist);
      for (;;) {
        let done = false;
        for (let attempt = 0; attempt < MAPGEN.angleRetries; attempt++) {
          const a =
            (sector?.start ?? 0) + ((offset + (attempt * span) / MAPGEN.angleRetries) % span);
          const x = Math.round(Math.cos(a) * dist);
          const y = Math.round(Math.sin(a) * dist);
          if (inClearZone(x, y) || conflictsAny(x, y, placed)) continue;
          placed.push({ x, y, value: v });
          done = true;
          break;
        }
        if (done) break;
        dist += MAPGEN.retryDistanceStep;
      }
    }
  }
  return placed;
}

/** vmax(d) = 2 + floor(d / 22) (PLAN §4.4 step B). */
export function vmaxAt(distance: number): number {
  return MAPGEN.vmaxBase + Math.floor(distance / MAPGEN.vmaxDistanceStep);
}

const cumulativeCache = new Map<number, Float64Array>();

/** Cumulative weights of values 1..vmax with w(v) = v^-1.15, w(10) = 0. */
function cumulativeWeights(vmax: number): Float64Array {
  let cached = cumulativeCache.get(vmax);
  if (!cached) {
    cached = new Float64Array(vmax);
    let sum = 0;
    for (let v = 1; v <= vmax; v++) {
      if (v !== MAPGEN.forbiddenValue) sum += v ** -MAPGEN.weightExponent;
      cached[v - 1] = sum;
    }
    cumulativeCache.set(vmax, cached);
  }
  return cached;
}

/** Weighted draw among [1, vmax] \ {10}. */
export function drawValue(rng: Rng, vmax: number): number {
  const cum = cumulativeWeights(vmax);
  const total = cum[cum.length - 1] ?? 0;
  const r = rng() * total;
  // Binary search for the first cumulative weight above r.
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((cum[mid] ?? 0) > r) hi = mid;
    else lo = mid + 1;
  }
  let v = lo + 1;
  if (v === MAPGEN.forbiddenValue) v -= 1; // unreachable (zero weight), kept as a guard
  return v;
}

/**
 * Step B (PLAN §4.4): deposits of one chunk. `guaranteedNearby` must contain every
 * guaranteed deposit that could conflict with this chunk (its own and its neighbours').
 * Guaranteed deposits whose centre lies in the chunk come first.
 */
export function generateChunk(
  seed: number,
  cx: number,
  cy: number,
  guaranteedNearby: readonly Deposit[],
): Deposit[] {
  const x0 = cx * CHUNK_SIZE;
  const y0 = cy * CHUNK_SIZE;
  const own = guaranteedNearby.filter(
    (d) => d.x >= x0 && d.x < x0 + CHUNK_SIZE && d.y >= y0 && d.y < y0 + CHUNK_SIZE,
  );
  const result: Deposit[] = [...own];
  const blockers: Deposit[] = [...guaranteedNearby];
  const rng = mulberry32(hash2(seed, cx, cy));
  const span = CHUNK_SIZE - 2 * CHUNK_MARGIN;
  for (let i = 0; i < MAPGEN.attemptsPerChunk; i++) {
    // Always consume the same number of draws per attempt, accepted or not.
    const x = x0 + CHUNK_MARGIN + Math.floor(rng() * span);
    const y = y0 + CHUNK_MARGIN + Math.floor(rng() * span);
    const value = drawValue(rng, vmaxAt(depositDistance(x, y)));
    if (inClearZone(x, y) || conflictsAny(x, y, blockers)) continue;
    const d = { x, y, value };
    result.push(d);
    blockers.push(d);
  }
  return result;
}
