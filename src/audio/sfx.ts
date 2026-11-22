/**
 * Synthesised sound effects (PLAN §12): oscillators and envelopes, no files. The audio
 * context is created on the first user gesture. `volume` (0 to 1) comes from the options.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  volume = 0.5;

  /**
   * Call from a user gesture handler; safe to call repeatedly. A context created outside a
   * real activation (a touch `pointerdown` is not one) starts suspended, and mobile browsers
   * suspend it again in the background: resume it on every later gesture.
   */
  unlock(): void {
    if (typeof AudioContext === 'undefined') return;
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
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

  /**
   * A short burst of filtered noise (paper, chalk dust). The buffer is random noise: this is
   * sound, outside the simulation, so it needs no seed.
   */
  private noise(start: number, duration: number, freq: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx || this.volume <= 0) return;
    const t0 = ctx.currentTime + start;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq, t0);
    filter.frequency.exponentialRampToValueAtTime(freq * 2.2, t0 + duration);
    filter.Q.value = 1.2;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(gain * this.volume, t0 + duration * 0.3);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter).connect(amp).connect(ctx.destination);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }

  /** A reward card turned over: a soft swish. */
  cardFlip(): void {
    this.noise(0, 0.12, 1400, 0.09);
  }

  /** A reward card taken: a soft low chime. */
  cardChosen(): void {
    this.tone(587.33, 0, 0.3, 'sine', 0.12);
    this.tone(880, 0.07, 0.4, 'triangle', 0.09);
  }

  /** Rising three-note arpeggio. */
  levelComplete(): void {
    [523.25, 659.25, 783.99].forEach((f, i) => this.tone(f, i * 0.11, 0.35, 'triangle', 0.25));
  }

  /** Soft two-note chime. */
  upgradeReady(): void {
    this.tone(880, 0, 0.18, 'sine', 0.12);
    this.tone(1318.5, 0.08, 0.25, 'sine', 0.1);
  }

  place(): void {
    this.tone(440, 0, 0.06, 'square', 0.05);
  }

  demolish(): void {
    this.tone(180, 0, 0.1, 'sawtooth', 0.05);
  }

  /** Short soft tick for UI buttons. */
  click(): void {
    this.tone(1200, 0, 0.03, 'sine', 0.04);
  }

  error(): void {
    this.tone(140, 0, 0.12, 'square', 0.06);
  }
}
