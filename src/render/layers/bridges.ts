import { BELT_COLORS } from '../../config/colors';
import type { Belt, Bridge } from '../../sim/entities';
import type { Camera } from '../camera';
import { LOD } from '../lod';
import { drawBelts } from './belts';
import { drawItems } from './items';

/**
 * Bridges (PLAN §10.2 layer 3): the vertical lane runs underneath (with its items), the
 * horizontal lane on a raised deck with light rails, its items drawn on top. Lanes reuse
 * the belt chevrons and item drawing.
 */
export function drawBridges(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  bridges: readonly Bridge[],
  phase: number,
): void {
  if (bridges.length === 0) return;
  const s = cam.scale;
  if (cam.zoom >= LOD.buildingText) {
    ctx.fillStyle = BELT_COLORS.bridgeBase;
    ctx.beginPath();
    for (const b of bridges) {
      const p = cam.worldToScreen(b.x, b.y);
      ctx.roundRect(p.x + 0.04 * s, p.y + 0.04 * s, 0.92 * s, 0.92 * s, 0.12 * s);
    }
    ctx.fill();
  }
  const vertical = bridges.map((b) => b.v).filter((l): l is Belt => l !== null);
  drawBelts(ctx, cam, vertical, phase);
  drawItems(ctx, cam, vertical);
  if (cam.zoom >= LOD.buildingText) {
    // Raised deck for the horizontal lane, with side rails.
    ctx.fillStyle = BELT_COLORS.bridgeDeck;
    ctx.beginPath();
    for (const b of bridges) {
      const p = cam.worldToScreen(b.x, b.y);
      ctx.rect(p.x, p.y + 0.18 * s, s, 0.64 * s);
    }
    ctx.fill();
    for (const b of bridges) {
      const p = cam.worldToScreen(b.x, b.y);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(p.x, p.y + 0.82 * s, s, 0.06 * s);
      ctx.fillStyle = 'rgba(190, 210, 255, 0.55)';
      ctx.fillRect(p.x, p.y + 0.16 * s, s, 0.05 * s);
      ctx.fillRect(p.x, p.y + 0.79 * s, s, 0.05 * s);
    }
  }
  const horizontal = bridges.map((b) => b.h).filter((l): l is Belt => l !== null);
  drawBelts(ctx, cam, horizontal, phase, false);
  drawItems(ctx, cam, horizontal);
}

/** Green diamonds on prioritised output tiles (PLAN §6.6). */
export function drawPriorities(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  tiles: readonly { x: number; y: number }[],
): void {
  if (cam.zoom < LOD.depositText) return;
  const s = cam.scale;
  ctx.fillStyle = BELT_COLORS.priority;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.lineWidth = Math.max(1, 0.04 * s);
  for (const t of tiles) {
    const c = cam.worldToScreen(t.x + 0.5, t.y + 0.5);
    const r = 0.2 * s;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y - r);
    ctx.lineTo(c.x + r, c.y);
    ctx.lineTo(c.x, c.y + r);
    ctx.lineTo(c.x - r, c.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}
