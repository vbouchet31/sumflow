import { BELT_COLORS, BUILDING_COLORS } from '../config/colors';
import { buildingSize } from '../sim/entities';
import type { Clip } from '../sim/clip';
import { el } from './dom';

/** Small picture of a clip: belts in grey, buildings in their colour (proposal 20). */
export function planPreview(clip: Clip, size = 72): HTMLCanvasElement {
  const canvas = el('canvas', 'plan-preview');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);
  const k = Math.min((size - 6) / clip.w, (size - 6) / clip.h);
  const ox = (size - clip.w * k) / 2;
  const oy = (size - clip.h * k) / 2;
  ctx.fillStyle = '#0b0f1b';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = BELT_COLORS.chevron;
  for (const b of [...clip.belts, ...clip.bridges]) {
    ctx.fillRect(ox + b.x * k + k * 0.15, oy + b.y * k + k * 0.15, k * 0.7, k * 0.7);
  }
  for (const b of clip.buildings) {
    const s = buildingSize(b.type, b.rot);
    ctx.fillStyle = (BUILDING_COLORS as Record<string, string>)[b.type] ?? '#8090a8';
    ctx.fillRect(ox + b.x * k + 0.5, oy + b.y * k + 0.5, s.w * k - 1, s.h * k - 1);
  }
  return canvas;
}
