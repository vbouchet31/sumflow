import { BELT_COLORS, CHALK, COLORS } from '../../config/colors';
import { chalkLine, tileSeed } from '../chalk';
import type { Belt, Bridge } from '../../sim/entities';
import type { Camera } from '../camera';
import { LOD } from '../lod';
import { drawBelts } from './belts';
import { drawItems } from './items';

/**
 * Bridges (PLAN §10.2 layer 3): the vertical lane runs underneath (with its items), the
 * horizontal lane on a light chalk footbridge (two beams, a few planks), its items drawn
 * on top. Lanes reuse the belt rails, chevrons and item drawing.
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
    const lw = Math.max(1, 0.06 * s);
    for (const b of bridges) {
      const p = cam.worldToScreen(b.x, b.y);
      const seed = tileSeed(b.x, b.y);
      ctx.fillStyle = COLORS.background;
      ctx.fillRect(p.x, p.y + 0.12 * s, s, 0.76 * s);
      // The deck hides the lower lane; two chalk beams along it, a few faint planks across.
      for (let i = 0; i < 3; i++) {
        const x = p.x + (0.22 + i * 0.28) * s;
        chalkLine(ctx, x, p.y + 0.2 * s, x, p.y + 0.8 * s, seed + i, CHALK.plank, lw * 0.6);
      }
      for (const y of [0.13, 0.87]) {
        chalkLine(
          ctx,
          p.x - 0.05 * s,
          p.y + y * s,
          p.x + 1.05 * s,
          p.y + y * s,
          seed + y * 100,
          CHALK.beam,
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
