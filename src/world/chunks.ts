import { CHUNK_SIZE, chunkOf } from '../core/grid';
import { type Deposit, depositContains, depositDistance } from './deposits';
import { generateChunk, generateGuaranteed } from './mapgen';

const chunkKey = (cx: number, cy: number): string => `${cx},${cy}`;

/**
 * Lazily generated deposit map for one seed. Deposits are never saved: they are
 * recomputed from the seed (PLAN §4.4).
 */
export class DepositMap {
  readonly guaranteed: readonly Deposit[];
  private readonly guaranteedByChunk = new Map<string, Deposit[]>();
  private readonly chunks = new Map<string, Deposit[]>();

  constructor(readonly seed: number) {
    this.guaranteed = generateGuaranteed(seed);
    for (const d of this.guaranteed) {
      const { cx, cy } = chunkOf(d.x, d.y);
      const k = chunkKey(cx, cy);
      const list = this.guaranteedByChunk.get(k);
      if (list) list.push(d);
      else this.guaranteedByChunk.set(k, [d]);
    }
  }

  /** Deposits whose centre lies in chunk `(cx, cy)`, generated on first access. */
  getChunk(cx: number, cy: number): readonly Deposit[] {
    const k = chunkKey(cx, cy);
    let deposits = this.chunks.get(k);
    if (!deposits) {
      const nearby: Deposit[] = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const list = this.guaranteedByChunk.get(chunkKey(cx + dx, cy + dy));
          if (list) nearby.push(...list);
        }
      }
      deposits = generateChunk(this.seed, cx, cy, nearby);
      this.chunks.set(k, deposits);
    }
    return deposits;
  }

  /** The deposit covering tile `(x, y)`, if any. */
  depositAt(x: number, y: number): Deposit | null {
    const { cx, cy } = chunkOf(x, y);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const d of this.getChunk(cx + dx, cy + dy)) {
          if (depositContains(d, x, y)) return d;
        }
      }
    }
    return null;
  }

  /** Nearest deposit of `value` to the hub, searching chunks ring by ring up to `maxRadius`. */
  findNearest(value: number, maxRadius = 64): Deposit | null {
    let best: Deposit | null = null;
    for (const d of this.guaranteed) {
      if (
        d.value === value &&
        (!best || depositDistance(d.x, d.y) < depositDistance(best.x, best.y))
      )
        best = d;
    }
    for (let r = 0; r <= maxRadius; r++) {
      // Chunks at Chebyshev ring r are at least (r - 1) * CHUNK_SIZE tiles away.
      if (best && depositDistance(best.x, best.y) < (r - 1) * CHUNK_SIZE) break;
      for (let cy = -r; cy <= r; cy++) {
        for (let cx = -r; cx <= r; cx++) {
          if (Math.max(Math.abs(cx), Math.abs(cy)) !== r) continue;
          for (const d of this.getChunk(cx, cy)) {
            if (
              d.value === value &&
              (!best || depositDistance(d.x, d.y) < depositDistance(best.x, best.y))
            )
              best = d;
          }
        }
      }
    }
    return best;
  }

  /** Number of chunks generated so far (for debugging and memory checks). */
  get generatedChunks(): number {
    return this.chunks.size;
  }
}
