import { METEORS, TICK_RATE } from '../../config/balance';
import { COLORS, FONT_NUM } from '../../config/colors';
import { formatCompact } from '../../core/format';
import type { GameState } from '../../sim/state';
import type { Camera } from '../camera';
import { roundRect } from '../shapes';

const HOT = '#ff8a3d';

/** Meteorites (proposal 13): a glowing crater with its value and a ring that runs out. */
export function drawMeteors(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  state: GameState,
  reducedMotion: boolean,
): void {
  const s = cam.scale;
  for (const m of state.meteors.active) {
    const p = cam.worldToScreen(m.x - 1, m.y - 1);
    if (p.x > cam.viewW || p.y > cam.viewH || p.x + 3 * s < 0 || p.y + 3 * s < 0) continue;
    const cx = p.x + 1.5 * s;
    const cy = p.y + 1.5 * s;
    const pulse = reducedMotion ? 1 : 0.8 + 0.2 * Math.sin(state.tick / 8);
    const g = ctx.createRadialGradient(cx, cy, 0.2 * s, cx, cy, 2.4 * s);
    g.addColorStop(0, `rgba(255, 150, 70, ${0.55 * pulse})`);
    g.addColorStop(1, 'rgba(255, 90, 40, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, 2.4 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a1d14';
    roundRect(ctx, p.x + 0.08 * s, p.y + 0.08 * s, 2.84 * s, 2.84 * s, 0.9 * s);
    ctx.fill();
    // Time left: an arc around the crater.
    const left = Math.max(0, (m.endsAt - state.tick) / (METEORS.lifetime * TICK_RATE));
    ctx.strokeStyle = HOT;
    ctx.lineWidth = Math.max(1.5, 0.12 * s);
    ctx.beginPath();
    ctx.arc(cx, cy, 1.25 * s, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2);
    ctx.stroke();
    const text = formatCompact(m.value);
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${(text.length >= 3 ? 0.9 : 1.15) * s}px ${FONT_NUM}`;
    ctx.fillText(text, cx, cy + 0.05 * s);
  }
}

/** Arrow at the edge of the screen toward each meteorite out of view, with its value. */
export function drawMeteorPointers(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  state: GameState,
): void {
  // Keep clear of the top bar and the build bar.
  const left = 50;
  const right = cam.viewW - 50;
  const top = 100;
  const bottom = cam.viewH - 130;
  for (const m of state.meteors.active) {
    const c = cam.worldToScreen(m.x + 0.5, m.y + 0.5);
    if (c.x > 0 && c.y > 0 && c.x < cam.viewW && c.y < cam.viewH) continue;
    const mx = (left + right) / 2;
    const my = (top + bottom) / 2;
    const dx = c.x - mx;
    const dy = c.y - my;
    const k = Math.min(
      (right - mx) / Math.max(1e-6, Math.abs(dx)),
      (bottom - my) / Math.max(1e-6, Math.abs(dy)),
    );
    const x = mx + dx * k;
    const y = my + dy * k;
    const a = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(20, 10, 6, 0.85)';
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = HOT;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 13px ${FONT_NUM}`;
    ctx.fillText(formatCompact(m.value), 0, 1);
    ctx.rotate(a);
    ctx.fillStyle = HOT;
    ctx.beginPath();
    ctx.moveTo(30, 0);
    ctx.lineTo(22, -7);
    ctx.lineTo(22, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
