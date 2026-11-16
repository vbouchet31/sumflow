/** Averages published by the meter, refreshed twice a second. */
export interface PerfStats {
  fps: number;
  /** Mean time between frames, in milliseconds. */
  frameMs: number;
  /** Longest gap between two frames in the window, in milliseconds. */
  worstFrameMs: number;
  /** Mean simulation time per tick, in milliseconds (0 when no tick ran). */
  simMsPerTick: number;
  /** Mean drawing time per frame, in milliseconds. */
  renderMs: number;
  ticksPerSecond: number;
}

const WINDOW_MS = 500;

/** Frame timing over half-second windows, for the F3 overlay and the debug API. */
export class PerfMeter {
  stats: PerfStats = {
    fps: 0,
    frameMs: 0,
    worstFrameMs: 0,
    simMsPerTick: 0,
    renderMs: 0,
    ticksPerSecond: 0,
  };
  private windowStart = -1;
  private lastFrame = -1;
  private frames = 0;
  private worst = 0;
  private simMs = 0;
  private renderMs = 0;
  private ticks = 0;

  /** Record one frame. Returns true when `stats` was just refreshed. */
  frame(now: number, simMs: number, ticks: number, renderMs: number): boolean {
    if (this.windowStart < 0) {
      this.windowStart = now;
      this.lastFrame = now;
      return false;
    }
    this.frames++;
    this.worst = Math.max(this.worst, now - this.lastFrame);
    this.lastFrame = now;
    this.simMs += simMs;
    this.renderMs += renderMs;
    this.ticks += ticks;
    const elapsed = now - this.windowStart;
    if (elapsed < WINDOW_MS) return false;
    this.stats = {
      fps: (this.frames * 1000) / elapsed,
      frameMs: elapsed / this.frames,
      worstFrameMs: this.worst,
      simMsPerTick: this.ticks > 0 ? this.simMs / this.ticks : 0,
      renderMs: this.renderMs / this.frames,
      ticksPerSecond: (this.ticks * 1000) / elapsed,
    };
    this.windowStart = now;
    this.frames = 0;
    this.worst = 0;
    this.simMs = 0;
    this.renderMs = 0;
    this.ticks = 0;
    return true;
  }
}
