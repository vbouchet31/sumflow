import { STORAGE_CAPACITY } from '../../config/balance';
import { BUILDING_COLORS, COLORS, FONT_NUM } from '../../config/colors';
import { formatCompact } from '../../core/format';
import type { Building } from '../../sim/entities';
import type { Camera } from '../camera';
import { LOD } from '../lod';
import { roundRect } from '../shapes';

/** Storage (PLAN §6.3): steel-grey 3×3 block, stored value, fill bar and count. */
export function drawStorage(ctx: CanvasRenderingContext2D, cam: Camera, b: Building): void {
  const s = cam.scale;
  const p = cam.worldToScreen(b.x, b.y);
  const inset = 0.1 * s;
  const w = 3 * s - 2 * inset;
  ctx.fillStyle = BUILDING_COLORS.storage;
  roundRect(ctx, p.x + inset, p.y + inset, w, w, 0.3 * s);
  ctx.fill();
  // Inner frame.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = Math.max(1, 0.06 * s);
  roundRect(ctx, p.x + 0.35 * s, p.y + 0.35 * s, 2.3 * s, 2.3 * s, 0.2 * s);
  ctx.stroke();
  if (cam.zoom < LOD.buildingText) return;

  const count = b.storeCount ?? 0;
  const cx = p.x + 1.5 * s;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = count > 0 ? COLORS.text : 'rgba(255, 255, 255, 0.45)';
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
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  roundRect(ctx, barX, barY, barW, barH, barH / 2);
  ctx.fill();
  if (count > 0) {
    ctx.fillStyle = '#cfe0ff';
    roundRect(ctx, barX, barY, Math.max(barH, (barW * count) / STORAGE_CAPACITY), barH, barH / 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.font = `600 ${0.3 * s}px ${FONT_NUM}`;
  ctx.fillText(`${formatCompact(count)} / ${formatCompact(STORAGE_CAPACITY)}`, cx, p.y + 2.4 * s);
}
