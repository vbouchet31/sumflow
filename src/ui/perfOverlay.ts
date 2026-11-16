import type { PerfStats } from '../debug/perfMeter';
import { t } from '../i18n';
import { el } from './dom';

export interface PerfCounts {
  tick: number;
  items: number;
  belts: number;
  buildings: number;
}

/** Performance overlay toggled with F3 (PLAN §13.4): FPS, timings, ticks, object counts. */
export class PerfOverlay {
  private readonly box = el('div', 'perf-overlay');

  constructor(root: HTMLElement) {
    this.box.setAttribute('aria-label', t('perf.title'));
    this.box.hidden = true;
    root.append(this.box);
  }

  get visible(): boolean {
    return !this.box.hidden;
  }

  toggle(): void {
    this.box.hidden = !this.box.hidden;
  }

  update(stats: PerfStats, counts: PerfCounts): void {
    this.box.textContent = [
      t('perf.fps', { fps: stats.fps.toFixed(0), ms: stats.frameMs.toFixed(1) }),
      t('perf.sim', { ms: stats.simMsPerTick.toFixed(2) }),
      t('perf.render', { ms: stats.renderMs.toFixed(2) }),
      t('perf.ticks', { n: counts.tick, rate: stats.ticksPerSecond.toFixed(0) }),
      t('perf.items', { n: counts.items }),
      t('perf.belts', { n: counts.belts }),
      t('perf.buildings', { n: counts.buildings }),
    ].join('\n');
  }
}
