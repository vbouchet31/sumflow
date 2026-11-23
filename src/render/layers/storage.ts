import { BUILDING_COLORS, CHALK, COLORS, FONT_NUM, HUB_COLORS } from '../../config/colors';
import { formatCompact } from '../../core/format';
import { storageCapacity } from '../../sim/belts';
import type { Building } from '../../sim/entities';
import { editionFrame } from '../editions';
import type { Camera } from '../camera';
import { LOD } from '../lod';
import { chalkSquare, shade, tileSeed } from '../chalk';
import { roundRect } from '../shapes';

/** Storage (PLAN §6.3): a grey 3×3 block coloured in chalk, stored value, fill bar and count. */
export function drawStorage(ctx: CanvasRenderingContext2D, cam: Camera, b: Building): void {
  const s = cam.scale;
  const p = cam.worldToScreen(b.x, b.y);
  const inset = 0.1 * s;
  const base = BUILDING_COLORS.storage;
  const side = 3 * s - 2 * inset;
  const seed = tileSeed(b.x, b.y);
  chalkSquare(
    ctx,
    p.x + inset,
    p.y + inset,
    side,
    seed,
    { wash: base, hatch: shade(base, -0.25), outline: shade(base, 0.5) },
    { hatch: Math.max(1, 0.09 * s), outline: Math.max(1.5, 0.09 * s) },
  );
  // An edition keeps the storage grey and adds its frame, glint and mark.
  if (b.edition)
    editionFrame(ctx, b.edition, [{ x: p.x + inset, y: p.y + inset, s: side, seed }], s);
  if (cam.zoom < LOD.buildingText) return;
  const capacity = storageCapacity(b);

  const count = b.storeCount ?? 0;
  const cx = p.x + 1.5 * s;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = count > 0 ? COLORS.text : CHALK.markFaint;
  ctx.font = `700 ${0.85 * s}px ${FONT_NUM}`;
  ctx.fillText(
    count > 0 && b.storeValue != null ? formatCompact(b.storeValue) : '—',
    cx,
    p.y + 1.2 * s,
  );

  // Fill bar and count.
  const barX = p.x + 0.55 * s;
  const barW = 1.9 * s;
  const barY = p.y + 1.95 * s;
  const barH = 0.16 * s;
  ctx.fillStyle = HUB_COLORS.barTrack;
  roundRect(ctx, barX, barY, barW, barH, barH / 2);
  ctx.fill();
  if (count > 0) {
    ctx.fillStyle = HUB_COLORS.barFill;
    roundRect(
      ctx,
      barX,
      barY,
      Math.max(barH, (barW * Math.min(count, capacity)) / capacity),
      barH,
      barH / 2,
    );
    ctx.fill();
  }
  ctx.fillStyle = HUB_COLORS.textMuted;
  ctx.font = `600 ${0.3 * s}px ${FONT_NUM}`;
  ctx.fillText(`${formatCompact(count)} / ${formatCompact(capacity)}`, cx, p.y + 2.4 * s);
}
