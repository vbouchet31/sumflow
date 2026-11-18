import { buildingSize } from '../../sim/entities';
import type { Change } from '../../sim/journal';
import { unkey } from '../../core/grid';
import type { Camera } from '../camera';

/** A short animation on a tile rectangle: something appeared, or went away. */
interface Effect {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'built' | 'removed';
  /** Start time (ms), staggered along a path. */
  start: number;
}

const DURATION = { built: 360, removed: 420 } as const;
/** Delay between consecutive tiles of one action: a belt path lights up from its start. */
const STAGGER_MS = 14;
/** At most this many effects per action, and alive at once. */
const MAX_PER_CHANGE = 240;
const MAX_ALIVE = 1200;

/**
 * Placement and demolition feedback (PLAN §12): new objects pop with a bright ring, removed
 * ones burst into a few sparks. Fed by the undo history, so undo and redo animate too.
 */
export class Effects {
  private list: Effect[] = [];

  /** Queue the animations of an action applied in direction `side`. */
  add(change: Change, side: 'before' | 'after', now: number): void {
    let i = 0;
    const push = (e: Omit<Effect, 'start'>): void => {
      if (i >= MAX_PER_CHANGE) return;
      this.list.push({ ...e, start: now + i * STAGGER_MS });
      i++;
    };
    for (const [k, c] of change.tiles) {
      const was = side === 'after' ? c.before : c.after;
      const is = side === 'after' ? c.after : c.before;
      const { x, y } = unkey(k);
      if (is) push({ x, y, w: 1, h: 1, kind: 'built' });
      else if (was) push({ x, y, w: 1, h: 1, kind: 'removed' });
    }
    for (const c of change.buildings.values()) {
      const was = side === 'after' ? c.before : c.after;
      const is = side === 'after' ? c.after : c.before;
      const snap = is ?? was;
      if (!snap) continue;
      const { w, h } = buildingSize(snap.type, snap.rot);
      push({ x: snap.x, y: snap.y, w, h, kind: is ? 'built' : 'removed' });
    }
    if (this.list.length > MAX_ALIVE) this.list.splice(0, this.list.length - MAX_ALIVE);
  }

  get active(): boolean {
    return this.list.length > 0;
  }

  clear(): void {
    this.list = [];
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera, now: number): void {
    if (this.list.length === 0) return;
    const s = cam.scale;
    const keep: Effect[] = [];
    for (const e of this.list) {
      const t = (now - e.start) / DURATION[e.kind];
      if (t >= 1) continue;
      keep.push(e);
      if (t < 0) continue;
      const p = cam.worldToScreen(e.x, e.y);
      const w = e.w * s;
      const h = e.h * s;
      const cx = p.x + w / 2;
      const cy = p.y + h / 2;
      if (e.kind === 'built') {
        // Bright flash that fades, and a ring that grows past the footprint.
        const ease = 1 - (1 - t) ** 3;
        ctx.fillStyle = `rgba(255, 255, 255, ${0.35 * (1 - t)})`;
        ctx.fillRect(p.x, p.y, w, h);
        const big = e.w * e.h > 1;
        const grow = (big ? 0.08 : 0.02) * s + ease * (big ? 0.22 : 0.1) * s;
        ctx.strokeStyle = `rgba(150, 230, 180, ${0.9 * (1 - t)})`;
        ctx.lineWidth = Math.max(1.5, 0.08 * s * (1 - t) + 1);
        ctx.beginPath();
        ctx.roundRect(p.x - grow, p.y - grow, w + 2 * grow, h + 2 * grow, 0.25 * s + grow);
        ctx.stroke();
      } else {
        // Sparks flying out from the centre, fading.
        const n = e.w * e.h > 1 ? 10 : 6;
        const dist = (0.25 + 0.55 * t) * Math.max(w, h) * 0.7;
        ctx.fillStyle = `rgba(255, 150, 110, ${0.9 * (1 - t)})`;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + (e.x * 7 + e.y * 13) * 0.37;
          const r = Math.max(1.2, 0.07 * s * (1 - t));
          const sx = cx + Math.cos(a) * dist;
          const sy = cy + Math.sin(a) * dist;
          ctx.moveTo(sx + r, sy);
          ctx.arc(sx, sy, r, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.strokeStyle = `rgba(240, 110, 90, ${0.6 * (1 - t)})`;
        ctx.lineWidth = 1.5;
        const shrink = t * 0.3 * s;
        ctx.strokeRect(p.x + shrink, p.y + shrink, w - 2 * shrink, h - 2 * shrink);
      }
    }
    this.list = keep;
  }
}
