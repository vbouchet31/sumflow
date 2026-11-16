import type { Camera } from '../camera';

/** Level-complete wave duration (PLAN §7.2). */
export const WAVE_MS = 1200;

/**
 * Translucent white ring expanding from the hub (PLAN §10.2 layer 9). `ageMs` is the time
 * since the level was completed.
 */
export function drawWave(ctx: CanvasRenderingContext2D, cam: Camera, ageMs: number): void {
  if (ageMs < 0 || ageMs > WAVE_MS) return;
  const p = ageMs / WAVE_MS;
  const c = cam.worldToScreen(0, 0);
  const radius = (3 + p * 40) * cam.scale;
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.45 * (1 - p)})`;
  ctx.lineWidth = Math.max(2, (0.6 + 1.4 * (1 - p)) * cam.scale);
  ctx.beginPath();
  ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
  ctx.stroke();
}
