import { COLORS } from '../../config/colors';
import type { Camera } from '../camera';

/** Minimum zoom at which grid lines are drawn (PLAN §10.1). */
const GRID_MIN_ZOOM = 0.5;

export function drawGrid(ctx: CanvasRenderingContext2D, cam: Camera): void {
  if (cam.zoom < GRID_MIN_ZOOM) return;
  const { x0, y0, x1, y1 } = cam.visibleTiles();
  ctx.beginPath();
  for (let tx = x0; tx <= x1; tx++) {
    const sx = Math.round(cam.worldToScreen(tx, 0).x) + 0.5;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, cam.viewH);
  }
  for (let ty = y0; ty <= y1; ty++) {
    const sy = Math.round(cam.worldToScreen(0, ty).y) + 0.5;
    ctx.moveTo(0, sy);
    ctx.lineTo(cam.viewW, sy);
  }
  ctx.strokeStyle = COLORS.gridLine;
  ctx.lineWidth = 1;
  ctx.stroke();
}
