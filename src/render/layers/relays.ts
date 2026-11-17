import { HUB } from '../../config/balance';
import { COLORS, FONT_NUM, HUB_COLORS } from '../../config/colors';
import { formatCompact } from '../../core/format';
import type { Building } from '../../sim/entities';
import type { GameState } from '../../sim/state';
import type { Camera } from '../camera';
import { LOD } from '../lod';
import { roundRect } from '../shapes';

/** A relay: a small hub showing the current target (proposal 10). */
export function drawRelay(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  b: Building,
  state: GameState,
): void {
  const s = cam.scale;
  const p = cam.worldToScreen(b.x, b.y);
  const inset = 0.08 * s;
  ctx.fillStyle = HUB_COLORS.fill;
  roundRect(ctx, p.x + inset, p.y + inset, 2 * s - 2 * inset, 2 * s - 2 * inset, 0.35 * s);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = Math.max(1, 0.05 * s);
  ctx.setLineDash([0.16 * s, 0.12 * s]);
  roundRect(ctx, p.x + 0.2 * s, p.y + 0.2 * s, 1.6 * s, 1.6 * s, 0.25 * s);
  ctx.stroke();
  ctx.setLineDash([]);
  if (cam.zoom < LOD.buildingText) return;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = HUB_COLORS.textMuted;
  ctx.font = `700 ${0.42 * s}px ${FONT_NUM}`;
  ctx.fillText('⌂', p.x + s, p.y + 0.62 * s);
  const req = state.levelRequirement;
  if (req) {
    const text = formatCompact(req.value);
    ctx.fillStyle = COLORS.text;
    ctx.font = `700 ${(text.length > 4 ? 0.42 : 0.6) * s}px ${FONT_NUM}`;
    ctx.fillText(text, p.x + s, p.y + 1.25 * s);
  }
}

/** Dotted line from each visible relay toward the hub, under the buildings. */
export function drawRelayLinks(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  buildings: readonly Building[],
): void {
  const hub = cam.worldToScreen(HUB.x + HUB.size / 2, HUB.y + HUB.size / 2);
  ctx.save();
  ctx.setLineDash([0.08 * cam.scale, 0.3 * cam.scale]);
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.5, 0.1 * cam.scale);
  ctx.strokeStyle = 'rgba(120, 170, 240, 0.45)';
  for (const b of buildings) {
    if (b.type !== 'relay') continue;
    const r = cam.worldToScreen(b.x + 1, b.y + 1);
    ctx.beginPath();
    ctx.moveTo(r.x, r.y);
    ctx.lineTo(hub.x, hub.y);
    ctx.stroke();
  }
  ctx.restore();
}
