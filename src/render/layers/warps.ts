import { COLORS, FONT_NUM } from '../../config/colors';
import type { Building } from '../../sim/entities';
import type { World } from '../../sim/world';
import type { Camera } from '../camera';
import { LOD } from '../lod';
import { roundRect } from '../shapes';

/** Colour of a portal channel: golden-angle hues, well apart for neighbouring channels. */
export function channelColor(channel: number, alpha = 1): string {
  if (!channel) return `rgba(140, 140, 160, ${alpha})`;
  return `hsla(${Math.round((channel * 137.5) % 360)}, 75%, 62%, ${alpha})`;
}

/** Portal: dark tile, a ring in its channel colour, a swirl going in or out. */
export function drawWarp(
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
  ctx.fillStyle = '#1a1430';
  roundRect(ctx, p.x + 0.06 * s, p.y + 0.06 * s, 0.88 * s, 0.88 * s, 0.28 * s);
  ctx.fill();
  const color = channelColor(b.channel ?? 0);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, 0.08 * s);
  ctx.beginPath();
  ctx.arc(cx, cy, 0.34 * s, 0, Math.PI * 2);
  ctx.stroke();
  if (cam.zoom < LOD.buildingText) return;
  // Swirl: three arcs turning inward (entrance) or outward (exit).
  const dir = b.type === 'warpIn' ? 1 : -1;
  const spin = reducedMotion ? 0 : (tick / 30) * dir;
  ctx.lineWidth = Math.max(1, 0.05 * s);
  for (let i = 0; i < 3; i++) {
    const a = spin + (i * 2 * Math.PI) / 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 0.22 * s, a, a + 1.4);
    ctx.stroke();
  }
  ctx.fillStyle = COLORS.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${0.26 * s}px ${FONT_NUM}`;
  ctx.fillText(b.type === 'warpIn' ? '▼' : '▲', cx, cy + 0.01 * s);
}

/** Dashed arcs from each visible entrance to the exits of its channel. */
export function drawWarpLinks(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  world: World,
  buildings: readonly Building[],
): void {
  const exits = world.warpExits();
  ctx.save();
  ctx.setLineDash([0.18 * cam.scale, 0.14 * cam.scale]);
  ctx.lineWidth = Math.max(1, 0.05 * cam.scale);
  for (const b of buildings) {
    if (b.type !== 'warpIn' || !b.channel) continue;
    const a = cam.worldToScreen(b.x + 0.5, b.y + 0.5);
    for (const e of exits.get(b.channel) ?? []) {
      const z = cam.worldToScreen(e.x + 0.5, e.y + 0.5);
      // A gentle curve: control point pushed sideways from the middle.
      const mx = (a.x + z.x) / 2 - (z.y - a.y) * 0.2;
      const my = (a.y + z.y) / 2 + (z.x - a.x) * 0.2;
      ctx.strokeStyle = channelColor(b.channel, 0.55);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(mx, my, z.x, z.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}
