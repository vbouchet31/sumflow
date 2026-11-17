import { beltStatus } from '../../sim/belts';
import type { Belt } from '../../sim/entities';
import type { World } from '../../sim/world';
import type { Camera } from '../camera';

/** Visible belts by state, for the legend. */
export interface FlowCounts {
  moving: number;
  jammed: number;
  deadEnd: number;
  idle: number;
}

/** Smoothed state of a belt: share of time it held an item, and was stuck. */
interface Smooth {
  busy: number;
  stuck: number;
  deadEnd: number;
}

/** Smoothing rate (per second): the colours settle in about half a second. */
const RATE = 5;

/**
 * Flow view (key V): belts tinted by what they do, averaged over a moment so a moving line
 * does not flicker. Green: items flow. Red: items wait for room (a jam: downstream is too
 * slow). Magenta: items stuck at an end that leads nowhere. Faint: empty.
 */
export class FlowView {
  private readonly smooth = new WeakMap<Belt, Smooth>();
  counts: FlowCounts = { moving: 0, jammed: 0, deadEnd: 0, idle: 0 };

  draw(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    world: World,
    belts: readonly Belt[],
    dt: number,
  ): void {
    const k = 1 - Math.exp(-RATE * dt);
    const s = cam.scale;
    const counts: FlowCounts = { moving: 0, jammed: 0, deadEnd: 0, idle: 0 };
    // Darken the map so the tints read well.
    ctx.fillStyle = 'rgba(5, 8, 16, 0.45)';
    ctx.fillRect(0, 0, cam.viewW, cam.viewH);
    for (const b of belts) {
      const status = beltStatus(world, b);
      let m = this.smooth.get(b);
      if (!m) {
        m = { busy: status === 'empty' ? 0 : 1, stuck: 0, deadEnd: 0 };
        this.smooth.set(b, m);
      }
      m.busy += ((status === 'empty' ? 0 : 1) - m.busy) * k;
      m.stuck += ((status === 'waiting' ? 1 : 0) - m.stuck) * k;
      m.deadEnd += ((status === 'noInput' ? 1 : 0) - m.deadEnd) * k;
      let color: string;
      if (m.deadEnd > 0.5) {
        color = 'rgba(220, 80, 220, 0.75)';
        counts.deadEnd++;
      } else if (m.stuck > 0.5) {
        color = `rgba(240, 80, 70, ${0.45 + 0.4 * m.stuck})`;
        counts.jammed++;
      } else if (m.busy > 0.05) {
        color = `rgba(70, 210, 120, ${0.25 + 0.55 * m.busy})`;
        counts.moving++;
      } else {
        color = 'rgba(120, 140, 180, 0.18)';
        counts.idle++;
      }
      const p = cam.worldToScreen(b.x, b.y);
      ctx.fillStyle = color;
      ctx.fillRect(p.x + 0.08 * s, p.y + 0.08 * s, 0.84 * s, 0.84 * s);
    }
    this.counts = counts;
  }
}
