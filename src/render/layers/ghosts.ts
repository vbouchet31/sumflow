import { AREA_COLORS, COLORS, GHOST_COLORS, LINK_COLORS } from '../../config/colors';
import { DX, DY, opposite } from '../../core/grid';
import type { PlannedLink } from '../../build/beltPath';
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
  if (ghost.links) drawLinks(ctx, cam, ghost.links);
  for (const g of ghost.buildings) {
    if (isOperator(g.type)) {
      // Real look, translucent, so ports and letters are visible before placing.
      const mirror = g.mirror === true;
      drawOperator(ctx, cam, g.type, g.x, g.y, g.rot, { alpha: g.ok ? 0.75 : 0.35, mirror });
      if (!g.ok) {
        drawOperator(ctx, cam, g.type, g.x, g.y, g.rot, { tint: GHOST_COLORS.blocked, mirror });
      }
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

/**
 * Badges on the edges where a planned belt meets the existing factory: amber when
 * something will feed into it (a merge), green when it leads into something, red when two
 * belts point at each other. Each carries an arrow in the direction items will go.
 */
function drawLinks(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  links: readonly PlannedLink[],
): void {
  const s = cam.scale;
  const r = Math.max(5, 0.2 * s);
  for (const l of links) {
    const c = cam.worldToScreen(l.x + 0.5 + DX[l.side] * 0.5, l.y + 0.5 + DY[l.side] * 0.5);
    ctx.fillStyle = LINK_COLORS[l.kind];
    ctx.strokeStyle = LINK_COLORS.edge;
    ctx.lineWidth = Math.max(1, 0.04 * s);
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = COLORS.text;
    ctx.lineWidth = Math.max(1.5, 0.06 * s);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const k = r * 0.45;
    if (l.kind === 'clash') {
      ctx.moveTo(c.x - k, c.y - k);
      ctx.lineTo(c.x + k, c.y + k);
      ctx.moveTo(c.x + k, c.y - k);
      ctx.lineTo(c.x - k, c.y + k);
    } else {
      const d = l.kind === 'out' ? l.side : opposite(l.side);
      const fx = DX[d];
      const fy = DY[d];
      ctx.moveTo(c.x - fx * k - fy * k, c.y - fy * k + fx * k);
      ctx.lineTo(c.x + fx * k, c.y + fy * k);
      ctx.lineTo(c.x - fx * k + fy * k, c.y - fy * k - fx * k);
    }
    ctx.stroke();
  }
}
