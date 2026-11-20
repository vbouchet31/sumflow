import { BELT_COLORS, COLORS } from '../../config/colors';
import { chalkLine, tileSeed } from '../chalk';
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
  itemValuesAlways = false,
): void {
  if (bridges.length === 0) return;
  const s = cam.scale;
  const vertical = bridges.map((b) => b.v).filter((l): l is Belt => l !== null);
  drawBelts(ctx, cam, vertical, phase);
  drawItems(ctx, cam, vertical, itemValuesAlways);
  if (cam.zoom >= LOD.buildingText) {
    // Draft tableau noir: a plank footbridge drawn in chalk over the lower lane.
    const lw = Math.max(1, 0.06 * s);
    for (const b of bridges) {
      const p = cam.worldToScreen(b.x, b.y);
      const seed = tileSeed(b.x, b.y);
      ctx.fillStyle = COLORS.background;
      ctx.fillRect(p.x, p.y + 0.12 * s, s, 0.76 * s);
      ctx.fillStyle = 'rgba(242, 239, 230, 0.06)';
      ctx.fillRect(p.x, p.y + 0.12 * s, s, 0.76 * s);
      // Planks across the deck.
      for (let i = 0; i < 4; i++) {
        const x = p.x + (0.14 + i * 0.24) * s;
        chalkLine(
          ctx,
          x,
          p.y + 0.16 * s,
          x,
          p.y + 0.84 * s,
          seed + i,
          'rgba(232, 201, 154, 0.55)',
          lw * 0.7,
        );
      }
      // Side beams, a little longer than the tile, and the posts at each end.
      for (const y of [0.12, 0.88]) {
        chalkLine(
          ctx,
          p.x - 0.14 * s,
          p.y + y * s,
          p.x + 1.14 * s,
          p.y + y * s,
          seed + y * 100,
          '#e8c99a',
          lw * 1.8,
        );
      }
      for (const x of [0.02, 0.98]) {
        chalkLine(
          ctx,
          p.x + x * s,
          p.y + 0.02 * s,
          p.x + x * s,
          p.y + 0.22 * s,
          seed + x * 50,
          '#e8c99a',
          lw,
        );
        chalkLine(
          ctx,
          p.x + x * s,
          p.y + 0.78 * s,
          p.x + x * s,
          p.y + 0.98 * s,
          seed + x * 70,
          '#e8c99a',
          lw,
        );
      }
    }
  }
  const horizontal = bridges.map((b) => b.h).filter((l): l is Belt => l !== null);
  drawBelts(ctx, cam, horizontal, phase, 'chevrons');
  drawItems(ctx, cam, horizontal, itemValuesAlways);
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
