import { BELT_COLORS } from '../../config/colors';
import { DIRS, type Dir, DX, DY } from '../../core/grid';
import { type Belt, hasOutput } from '../../sim/entities';
import type { Camera } from '../camera';
import { LOD } from '../lod';

/** Draw a chevron pointing along `d`, centred at `(cx, cy)`. */
function chevron(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  d: Dir,
  size: number,
): void {
  const fx = DX[d];
  const fy = DY[d];
  // Perpendicular.
  const px = -fy;
  const py = fx;
  const back = size * 0.5;
  const half = size;
  ctx.moveTo(cx - fx * back + px * half, cy - fy * back + py * half);
  ctx.lineTo(cx + fx * back * 0.6, cy + fy * back * 0.6);
  ctx.lineTo(cx - fx * back - px * half, cy - fy * back - py * half);
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

  const inset = 0.06 * s;
  if (part !== 'chevrons') {
    ctx.fillStyle = BELT_COLORS.base;
    ctx.beginPath();
    for (const b of list) {
      const p = cam.worldToScreen(b.x, b.y);
      ctx.roundRect(p.x + inset, p.y + inset, s - 2 * inset, s - 2 * inset, 0.2 * s);
    }
    ctx.fill();
  }

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
    const c = cam.worldToScreen(b.x + 0.5, b.y + 0.5);
    let outs = 0;
    for (const d of DIRS) if (hasOutput(b, d)) outs++;
    for (const d of DIRS) {
      if (!hasOutput(b, d)) continue;
      if (outs === 1) {
        // Two chevrons across the whole tile, scrolling.
        for (let i = 0; i < 2; i++) {
          const t = (animated ? (phase + i * 0.5) % 1 : 0.25 + i * 0.5) - 0.5;
          const off = t * 0.8;
          chevron(ctx, c.x + DX[d] * off * s, c.y + DY[d] * off * s, d, size);
        }
      } else {
        // One chevron on the half tile toward each output.
        const t = animated ? 0.15 + (phase % 1) * 0.25 : 0.27;
        chevron(ctx, c.x + DX[d] * t * s, c.y + DY[d] * t * s, d, size * 0.9);
      }
    }
  }
  ctx.stroke();
}
