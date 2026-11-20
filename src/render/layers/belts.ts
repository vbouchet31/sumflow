import { BELT_COLORS } from '../../config/colors';
import { DIRS, type Dir, DX, DY, opposite } from '../../core/grid';
import { type Belt, hasOutput } from '../../sim/entities';
import type { Camera } from '../camera';
import { LOD } from '../lod';
import { hash01 } from '../chalk';

/** Draw a chevron pointing along `d`, centred at `(cx, cy)`. */
function chevron(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  d: Dir,
  size: number,
  tilt = 0,
): void {
  const fx = DX[d];
  const fy = DY[d];
  // Perpendicular, slightly tilted so each chevron looks drawn by hand.
  const px = -fy + fx * tilt;
  const py = fx + fy * tilt;
  const back = size * 0.5;
  const half = size;
  ctx.moveTo(cx - fx * back + px * half, cy - fy * back + py * half);
  ctx.lineTo(cx + fx * back * 0.6, cy + fy * back * 0.6);
  ctx.lineTo(cx - fx * back - px * half, cy - fy * back - py * half);
}

/**
 * Draft "tableau noir": the two rails of each belt, sketched in chalk. Rails join the
 * neighbouring belts (inputs and outputs) and bend round corners; edge points wobble the
 * same way on both sides of a shared edge, so the lines stay continuous.
 */
function drawRails(ctx: CanvasRenderingContext2D, cam: Camera, list: Belt[]): void {
  const s = cam.scale;
  const K = 0.38;
  const byPos = new Map<number, Belt>();
  const key = (x: number, y: number): number => x * 1_000_003 + y;
  for (const b of list) byPos.set(key(b.x, b.y), b);
  // A point in tile units; the wobble moves it across `axis` (the travel axis is the other).
  const pt = (x: number, y: number, travelX: boolean): { x: number; y: number } => {
    const w = (hash01(Math.round(x * 8), Math.round(y * 8)) - 0.5) * 0.1;
    return cam.worldToScreen(travelX ? x : x + w, travelX ? y + w : y);
  };
  ctx.save();
  ctx.strokeStyle = BELT_COLORS.line;
  ctx.lineWidth = Math.max(1, 0.055 * s);
  ctx.lineCap = 'round';
  ctx.setLineDash([s * 0.55, s * 0.07, s * 0.3, s * 0.05]);
  ctx.beginPath();
  for (const b of list) {
    const conn: Dir[] = [];
    for (const d of DIRS) {
      if (hasOutput(b, d)) conn.push(d);
      else {
        const n = byPos.get(key(b.x + DX[d], b.y + DY[d]));
        if (n && hasOutput(n, opposite(d))) conn.push(d);
      }
    }
    const cx = b.x + 0.5;
    const cy = b.y + 0.5;
    const bend = (hash01(b.x * 3, b.y * 5) - 0.5) * 0.12;
    const [a, c] = conn;
    if (conn.length === 2 && a !== undefined && c !== undefined) {
      const straight = DX[a] === -DX[c] && DY[a] === -DY[c];
      for (const sg of [1, -1]) {
        if (straight) {
          const px = -DY[a] * K * sg;
          const py = DX[a] * K * sg;
          const p = pt(cx + DX[a] * 0.5 + px, cy + DY[a] * 0.5 + py, DX[a] !== 0);
          const q = pt(cx + DX[c] * 0.5 + px, cy + DY[c] * 0.5 + py, DX[a] !== 0);
          const m = cam.worldToScreen(cx + px - DY[a] * bend, cy + py + DX[a] * bend);
          ctx.moveTo(p.x, p.y);
          ctx.quadraticCurveTo(2 * m.x - (p.x + q.x) / 2, 2 * m.y - (p.y + q.y) / 2, q.x, q.y);
        } else {
          const p = pt(cx + DX[a] * 0.5 + DX[c] * K * sg, cy + DY[a] * 0.5 + DY[c] * K * sg, DX[a] !== 0);
          const q = pt(cx + DX[c] * 0.5 + DX[a] * K * sg, cy + DY[c] * 0.5 + DY[a] * K * sg, DX[c] !== 0);
          const m = cam.worldToScreen(cx + (DX[a] + DX[c]) * K * sg, cy + (DY[a] + DY[c]) * K * sg);
          ctx.moveTo(p.x, p.y);
          ctx.quadraticCurveTo(m.x, m.y, q.x, q.y);
        }
      }
    } else {
      // Ends and junctions: a short pair of rails on each connected side.
      for (const d of conn) {
        for (const sg of [1, -1]) {
          const px = -DY[d] * K * sg;
          const py = DX[d] * K * sg;
          const p = pt(cx + DX[d] * 0.5 + px, cy + DY[d] * 0.5 + py, DX[d] !== 0);
          const q = cam.worldToScreen(cx - DX[d] * 0.3 + px, cy - DY[d] * 0.3 + py);
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
        }
      }
    }
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Belts layer (PLAN §10.2 layer 3): tile base plus chevrons animated along each output.
 * `phase` ∈ [0, 1) scrolls with time × belt speed. `part` draws only the static tile bases
 * or only the chevrons (below zoom 0.3 belts are plain lines and count as base).
 */
export function drawBelts(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  belts: Iterable<Belt>,
  phase: number,
  part: 'all' | 'base' | 'chevrons' = 'all',
): void {
  const s = cam.scale;
  const list = Array.isArray(belts) ? (belts as Belt[]) : [...belts];
  if (cam.zoom < LOD.buildingText) {
    if (part === 'chevrons') return;
    // Lines only.
    ctx.strokeStyle = BELT_COLORS.line;
    ctx.lineWidth = Math.max(1, cam.zoom < LOD.depositText ? 0.15 * s : 0.3 * s);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const b of list) {
      const c = cam.worldToScreen(b.x + 0.5, b.y + 0.5);
      for (const d of DIRS) {
        if (!hasOutput(b, d)) continue;
        ctx.moveTo(c.x - DX[d] * 0.5 * s, c.y - DY[d] * 0.5 * s);
        ctx.lineTo(c.x + DX[d] * 0.5 * s, c.y + DY[d] * 0.5 * s);
      }
    }
    ctx.stroke();
    return;
  }

  if (part !== 'chevrons') drawRails(ctx, cam, list);

  if (part === 'base') return;

  const animated = cam.zoom >= LOD.full;
  ctx.strokeStyle = BELT_COLORS.chevron;
  ctx.lineWidth = Math.max(1, 0.1 * s);
  // Round ends cost a lot on thousands of live chevrons and do not show on thin lines:
  // keep them where chevrons are cached (static) or large (zoom ≥ 1).
  const round = !animated || cam.zoom >= 1;
  ctx.lineCap = round ? 'round' : 'butt';
  ctx.lineJoin = round ? 'round' : 'miter';
  ctx.beginPath();
  const size = 0.17 * s;
  for (const b of list) {
    const c0 = cam.worldToScreen(b.x + 0.5, b.y + 0.5);
    const wob = (hash01(b.x, b.y) - 0.5) * 0.1 * s;
    const c = { x: c0.x + wob, y: c0.y - wob };
    const tilt = (hash01(b.y, b.x) - 0.5) * 0.5;
    let outs = 0;
    for (const d of DIRS) if (hasOutput(b, d)) outs++;
    for (const d of DIRS) {
      if (!hasOutput(b, d)) continue;
      if (outs === 1) {
        // Two chevrons across the whole tile, scrolling.
        for (let i = 0; i < 2; i++) {
          const t = (animated ? (phase + i * 0.5) % 1 : 0.25 + i * 0.5) - 0.5;
          const off = t * 0.8;
          chevron(ctx, c.x + DX[d] * off * s, c.y + DY[d] * off * s, d, size, tilt);
        }
      } else {
        // One chevron on the half tile toward each output.
        const t = animated ? 0.15 + (phase % 1) * 0.25 : 0.27;
        chevron(ctx, c.x + DX[d] * t * s, c.y + DY[d] * t * s, d, size * 0.9, tilt);
      }
    }
  }
  ctx.stroke();
}
