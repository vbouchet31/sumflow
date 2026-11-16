import { CATCH_UP, MAX_TICKS_PER_FRAME, TICK_DT, TICK_RATE } from '../config/balance';
import { tick } from './tick';
import type { World } from './world';

/** How many catch-up ticks run between two checks of the frame's time budget. */
const BUDGET_CHECK_EVERY = 8;

/**
 * Fixed-step driver (PLAN §11.1): 60 Hz with an accumulator, at most 8 ticks per frame
 * (scaled by the debug time scale). Beyond that, the game slows down instead of freezing.
 * After an absence, the missed time is caught up in batches (see `queueCatchUp`).
 * Wall-clock time is passed in by the caller: the simulation itself never reads a clock.
 */
export class SimLoop {
  paused = false;
  timeScale = 1;
  private acc = 0;
  /** Ticks still owed after an absence, and the size of that debt when it was queued. */
  private owed = 0;
  private owedTotal = 0;

  constructor(private readonly world: World) {}

  /**
   * Owe `seconds` of simulation (time spent with the tab hidden), capped at 10 minutes.
   * Nothing is owed while the game is paused.
   */
  queueCatchUp(seconds: number): void {
    if (this.paused || !(seconds > 0)) return;
    const max = CATCH_UP.maxSeconds * TICK_RATE;
    this.owed = Math.min(max, this.owed + Math.round(seconds * TICK_RATE));
    this.owedTotal = this.owed;
  }

  /** Catch-up progress in [0, 1], or null when nothing is owed. */
  get catchUpProgress(): number | null {
    return this.owed > 0 ? 1 - this.owed / this.owedTotal : null;
  }

  /**
   * Advance by `dtSec` of real time. Returns the number of ticks run. While ticks are owed,
   * a frame runs up to 600 of them instead, and stops early once `overBudget()` says the
   * frame has taken too long, so a large factory stays responsive.
   */
  advance(dtSec: number, overBudget: () => boolean = () => false): number {
    if (this.paused) {
      this.acc = 0;
      return 0;
    }
    if (this.owed > 0) {
      const batch = Math.min(this.owed, CATCH_UP.ticksPerFrame);
      let n = 0;
      while (n < batch) {
        tick(this.world);
        n++;
        if (n % BUDGET_CHECK_EVERY === 0 && overBudget()) break;
      }
      this.owed -= n;
      if (this.owed === 0) this.owedTotal = 0;
      this.acc = 0;
      return n;
    }
    this.acc += dtSec * this.timeScale;
    const max = MAX_TICKS_PER_FRAME * Math.max(1, Math.ceil(this.timeScale));
    let n = 0;
    while (this.acc >= TICK_DT && n < max) {
      tick(this.world);
      this.acc -= TICK_DT;
      n++;
    }
    if (n === max) this.acc = Math.min(this.acc, TICK_DT);
    return n;
  }
}
