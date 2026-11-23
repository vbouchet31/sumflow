import { AREA_COLORS, COLORS, GHOST_COLORS, LINE_TINTS } from '../../config/colors';
import { drawBuilding } from './buildings';
import { editionGradient } from '../editions';
import { DX, DY } from '../../core/grid';
import type { Ghost } from '../../build/tools';
import { buildingSize, isOperator } from '../../sim/entities';
import { drawOperator } from './operators';
import type { Camera } from '../camera';

/** Construction ghosts (PLAN §10.2 layer 7): green new, orange replace, red impossible. */
export function drawGhosts(ctx: CanvasRenderingContext2D, cam: Camera, ghost: Ghost): void {
  const s = cam.scale;
  // What is being moved away is wiped from the board, faintly.
  if (ghost.fade && ghost.fade.length > 0) {
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = COLORS.background;
    for (const r of ghost.fade) {
      const p = cam.worldToScreen(r.x0, r.y0);
      ctx.fillRect(p.x, p.y, (r.x1 - r.x0 + 1) * s, (r.y1 - r.y0 + 1) * s);
    }
    ctx.restore();
  }
  // Moving a building: the belts each line keeps, faintly in the line's tint.
  for (const t of ghost.tints ?? []) {
    const p = cam.worldToScreen(t.x, t.y);
    ctx.fillStyle = lineTint(t.line, 0.3);
    ctx.fillRect(p.x + 1, p.y + 1, s - 2, s - 2);
  }
  for (const t of ghost.belts) {
    const p = cam.worldToScreen(t.x, t.y);
    ctx.fillStyle =
      t.line !== undefined && t.status !== 'blocked'
        ? lineTint(t.line, 0.55)
        : t.status === 'blocked'
          ? GHOST_COLORS.blocked
          : t.status === 'new'
            ? GHOST_COLORS.new
            : t.status === 'bridge'
              ? GHOST_COLORS.bridge
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
      const mirror = g.mirror === true;
      drawOperator(ctx, cam, g.type, g.x, g.y, g.rot, {
        alpha: g.ok ? 0.75 : 0.35,
        mirror,
        edition: g.edition,
      });
      if (!g.ok) {
        drawOperator(ctx, cam, g.type, g.x, g.y, g.rot, { tint: GHOST_COLORS.blocked, mirror });
      }
      continue;
    }
    const size = buildingSize(g.type, g.rot);
    const p = cam.worldToScreen(g.x, g.y);
    ctx.fillStyle = g.ok ? GHOST_COLORS.new : GHOST_COLORS.blocked;
    if (g.ok && g.edition) {
      // A storage being moved keeps its edition: its ghost is washed in that chalk.
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = editionGradient(ctx, g.edition, p.x, p.y, size.w * s, size.h * s);
    }
    ctx.beginPath();
    ctx.roundRect(
      p.x + 0.1 * s,
      p.y + 0.1 * s,
      size.w * s - 0.2 * s,
      size.h * s - 0.2 * s,
      0.4 * s,
    );
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // Edition tool: the hovered building drawn again over itself, in its new edition.
  if (ghost.preview) drawBuilding(ctx, cam, ghost.preview);
  if (ghost.area) {
    const { rect, kind } = ghost.area;
    const p = cam.worldToScreen(rect.x0, rect.y0);
    const w = (rect.x1 - rect.x0 + 1) * s;
    const h = (rect.y1 - rect.y0 + 1) * s;
    const color = AREA_COLORS[kind];
    ctx.fillStyle = color.fill;
    ctx.fillRect(p.x, p.y, w, h);
    ctx.strokeStyle = color.stroke;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(p.x + 1, p.y + 1, w - 2, h - 2);
    ctx.setLineDash([]);
  }
  if (ghost.demolish) {
    const p = cam.worldToScreen(ghost.demolish.x, ghost.demolish.y);
    ctx.fillStyle = GHOST_COLORS.demolish;
    ctx.fillRect(p.x, p.y, s, s);
  }
}

/** Tint of belt line `line` at opacity `alpha`. */
function lineTint(line: number, alpha: number): string {
  const [r, g, b] = LINE_TINTS[line % LINE_TINTS.length] ?? [175, 175, 175];
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
