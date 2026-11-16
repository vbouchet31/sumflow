import { STATS_WINDOW_SECONDS, TICK_RATE } from '../config/balance';

/**
 * Delivery statistics (PLAN §7.1): per-value counts in one-second buckets over a sliding
 * 60 s window. Runtime only, rebuilt after loading.
 */
export class DeliveryStats {
  private readonly buckets: Map<number, number>[] = [];
  private bucket = 0;
  private second = -1;
  private seconds = 0;

  constructor() {
    for (let i = 0; i < STATS_WINDOW_SECONDS; i++) this.buckets.push(new Map());
  }

  /** Move to the bucket of `tick` (clearing buckets that fell out of the window). */
  advance(tick: number): void {
    const second = Math.floor(tick / TICK_RATE);
    if (second === this.second) return;
    const steps = this.second < 0 ? 1 : Math.min(STATS_WINDOW_SECONDS, second - this.second);
    for (let i = 0; i < steps; i++) {
      this.bucket = (this.bucket + 1) % STATS_WINDOW_SECONDS;
      this.buckets[this.bucket]?.clear();
      this.seconds = Math.min(STATS_WINDOW_SECONDS, this.seconds + 1);
    }
    this.second = second;
  }

  record(value: number): void {
    const b = this.buckets[this.bucket];
    if (b) b.set(value, (b.get(value) ?? 0) + 1);
  }

  /** Items of `value` per second, averaged over the window (or the time elapsed so far). */
  rate(value: number): number {
    let sum = 0;
    for (const b of this.buckets) sum += b.get(value) ?? 0;
    return this.seconds > 0 ? sum / this.seconds : 0;
  }

  /** All values delivered in the window with their rate (items/s). */
  rates(): Map<number, number> {
    const totals = new Map<number, number>();
    for (const b of this.buckets) for (const [v, n] of b) totals.set(v, (totals.get(v) ?? 0) + n);
    const out = new Map<number, number>();
    for (const [v, n] of totals) out.set(v, this.seconds > 0 ? n / this.seconds : 0);
    return out;
  }
}
