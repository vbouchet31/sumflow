import { BEACON } from '../../config/balance';
import { FONT_NUM } from '../../config/colors';
import type { Building } from '../../sim/entities';
import type { Camera } from '../camera';
import { roundRect } from '../shapes';

/** Area of each glowing beacon: a soft golden square under the buildings. */
export function drawBeaconAreas(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  buildings: readonly Building[],
): void {
  const r = BEACON.radius;
  for (const b of buildings) {
    if (b.type !== 'beacon' || !b.fuel) continue;
    const p = cam.worldToScreen(b.x - r, b.y - r);
    const size = (2 * r + 1) * cam.scale;
    ctx.fillStyle = 'rgba(242, 196, 109, 0.07)';
    ctx.fillRect(p.x, p.y, size, size);
    ctx.save();
    ctx.setLineDash([0.25 * cam.scale, 0.18 * cam.scale]);
    ctx.strokeStyle = 'rgba(242, 196, 109, 0.45)';
    ctx.lineWidth = Math.max(1, 0.05 * cam.scale);
    ctx.strokeRect(p.x, p.y, size, size);
    ctx.restore();
  }
}

/** A beacon: dark tile, a star whose glow follows the fuel left. */
export function drawBeacon(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  b: Building,
  tick: number,
  reducedMotion: boolean,
): void {
  const s = cam.scale;
  const p = cam.worldToScreen(b.x, b.y);
  const cx = p.x + s / 2;
  const cy = p.y + s / 2;
  const level = Math.min(1, (b.fuel ?? 0) / BEACON.maxSeconds);
  ctx.fillStyle = '#2b2414';
  roundRect(ctx, p.x + 0.06 * s, p.y + 0.06 * s, 0.88 * s, 0.88 * s, 0.22 * s);
  ctx.fill();
  if (level > 0) {
    const pulse = reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(tick / 9);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 0.75 * s);
    g.addColorStop(0, `rgba(255, 220, 120, ${0.85 * pulse})`);
    g.addColorStop(1, 'rgba(255, 200, 80, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, 0.75 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = level > 0 ? '#fff6d8' : '#8a7a4a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${0.62 * s}px ${FONT_NUM}`;
  ctx.fillText('✷', cx, cy + 0.03 * s);
  // Fuel gauge along the bottom edge.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(p.x + 0.18 * s, p.y + 0.8 * s, 0.64 * s, 0.07 * s);
  ctx.fillStyle = '#f2c46d';
  ctx.fillRect(p.x + 0.18 * s, p.y + 0.8 * s, 0.64 * s * level, 0.07 * s);
}
