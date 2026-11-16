/**
 * Synthesised sound effects (PLAN §12): oscillators and envelopes, no files. The audio
 * context is created on the first user gesture. Placeholder set for now (M10 completes it).
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  volume = 0.5;

  /** Call from a user gesture handler; safe to call repeatedly. */
  unlock(): void {
    if (this.ctx || typeof AudioContext === 'undefined') return;
    try {
      this.ctx = new AudioContext();
    } catch {
      this.ctx = null;
    }
  }

  private tone(
    freq: number,
    start: number,
    duration: number,
    type: OscillatorType,
    gain: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx || this.volume <= 0) return;
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(gain * this.volume, t0 + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(amp).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  /** Rising three-note arpeggio. */
  levelComplete(): void {
    [523.25, 659.25, 783.99].forEach((f, i) => this.tone(f, i * 0.11, 0.35, 'triangle', 0.25));
  }

  place(): void {
    this.tone(440, 0, 0.06, 'square', 0.05);
  }

  demolish(): void {
    this.tone(180, 0, 0.1, 'sawtooth', 0.05);
  }

  error(): void {
    this.tone(140, 0, 0.12, 'square', 0.06);
  }
}
