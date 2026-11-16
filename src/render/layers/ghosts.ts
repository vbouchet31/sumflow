import { COLORS, GHOST_COLORS } from '../../config/colors';
import { DX, DY } from '../../core/grid';
import type { Ghost } from '../../build/tools';
import { buildingSize, isOperator } from '../../sim/entities';
import { drawOperator } from './operators';
import type { Camera } from '../camera';

/** Construction ghosts (PLAN §10.2 layer 7): green new, orange replace, red impossible. */
export function drawGhosts(ctx: CanvasRenderingContext2D, cam: Camera, ghost: Ghost): void {
  const s = cam.scale;
  for (const t of ghost.belts) {
    const p = cam.worldToScreen(t.x, t.y);
    ctx.fillStyle =
      t.status === 'blocked'
        ? GHOST_COLORS.blocked
        : t.status === 'new'
          ? GHOST_COLORS.new
          : GHOST_COLORS.replace;
    ctx.fillRect(p.x + 1, p.y + 1, s - 2, s - 2);
    if (t.status === 'blocked') continue;
    // Arrow toward the output.
    const cx = p.x + s / 2;
    const cy = p.y + s / 2;
    const fx = DX[t.dir];
    const fy = DY[t.dir];
    ctx.strokeStyle = COLORS.text;
    ctx.lineWidth = Math.max(1, 0.08 * s);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - fx * 0.25 * s, cy - fy * 0.25 * s);
    ctx.lineTo(cx + fx * 0.25 * s, cy + fy * 0.25 * s);
    ctx.moveTo(
      cx + fx * 0.25 * s - fy * 0.15 * s - fx * 0.15 * s,
      cy + fy * 0.25 * s + fx * 0.15 * s - fy * 0.15 * s,
    );
    ctx.lineTo(cx + fx * 0.25 * s, cy + fy * 0.25 * s);
    ctx.lineTo(
      cx + fx * 0.25 * s + fy * 0.15 * s - fx * 0.15 * s,
      cy + fy * 0.25 * s - fx * 0.15 * s - fy * 0.15 * s,
    );
    ctx.stroke();
  }
  for (const g of ghost.buildings) {
    if (isOperator(g.type)) {
      // Real look, translucent, so ports and letters are visible before placing.
      drawOperator(ctx, cam, g.type, g.x, g.y, g.rot, { alpha: g.ok ? 0.75 : 0.35 });
      if (!g.ok) drawOperator(ctx, cam, g.type, g.x, g.y, g.rot, { tint: GHOST_COLORS.blocked });
      continue;
    }
    const size = buildingSize(g.type, g.rot);
    const p = cam.worldToScreen(g.x, g.y);
    ctx.fillStyle = g.ok ? GHOST_COLORS.new : GHOST_COLORS.blocked;
    ctx.beginPath();
    ctx.roundRect(
      p.x + 0.1 * s,
      p.y + 0.1 * s,
      size.w * s - 0.2 * s,
      size.h * s - 0.2 * s,
      0.4 * s,
    );
    ctx.fill();
  }
  if (ghost.demolish) {
    const p = cam.worldToScreen(ghost.demolish.x, ghost.demolish.y);
    ctx.fillStyle = GHOST_COLORS.demolish;
    ctx.fillRect(p.x, p.y, s, s);
  }
}
