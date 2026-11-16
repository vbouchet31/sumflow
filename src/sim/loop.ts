import { MAX_TICKS_PER_FRAME, TICK_DT } from '../config/balance';
import { tick } from './tick';
import type { World } from './world';

/**
 * Fixed-step driver (PLAN §11.1): 60 Hz with an accumulator, at most 8 ticks per frame
 * (scaled by the debug time scale). Beyond that, the game slows down instead of freezing.
 * Wall-clock time is passed in by the caller: the simulation itself never reads a clock.
 */
export class SimLoop {
  paused = false;
  timeScale = 1;
  private acc = 0;

  constructor(private readonly world: World) {}

  /** Advance by `dtSec` of real time. Returns the number of ticks run. */
  advance(dtSec: number): number {
    if (this.paused) {
      this.acc = 0;
      return 0;
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
