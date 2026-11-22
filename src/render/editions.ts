/**
 * Edition chalks (PLAN-recompenses §3.4): a brillante object is recoloured in pearly chalk
 * with a glint, a légendaire one in golden chalk with a small star. Base is left as drawn.
 * One helper for every place that shows an edition: the choice screen now, the buildings on
 * the map, the ghost, the build bar and the tooltip later (R5).
 */
import type { Edition } from '../config/cards';
import { EDITION_COLORS } from '../config/colors';

type Tinted = Exclude<Edition, 'base'>;

/** Diagonal gradient of the edition chalk across the rectangle (x, y, w, h). */
export function editionGradient(
  ctx: CanvasRenderingContext2D,
  edition: Tinted,
  x: number,
  y: number,
  w: number,
  h: number,
): CanvasGradient {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  const stops = EDITION_COLORS[edition].stops;
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}

/**
 * Recolour what is already drawn in (x, y, w, h) with the edition chalk: a wash of its
 * gradient and a diagonal glint, both painted `source-atop`, so only existing strokes
 * change. Draw the object alone first (its own canvas, or a clip around it): anything else
 * in the rectangle would be tinted too. Base does nothing.
 */
export function tintEdition(
  ctx: CanvasRenderingContext2D,
  edition: Edition,
  x: number,
  y: number,
  w: number,
  h: number,
  strength = 0.6,
): void {
  if (edition === 'base') return;
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = strength;
  ctx.fillStyle = editionGradient(ctx, edition, x, y, w, h);
  ctx.fillRect(x, y, w, h);
  // The glint: a light band across the object, a third of the way along.
  const glint = ctx.createLinearGradient(x, y, x + w, y + h);
  glint.addColorStop(0.22, 'rgba(255, 255, 255, 0)');
  glint.addColorStop(0.32, EDITION_COLORS[edition].glint);
  glint.addColorStop(0.42, 'rgba(255, 255, 255, 0)');
  ctx.globalAlpha = edition === 'brillante' ? 0.75 : 0.55;
  ctx.fillStyle = glint;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

/** A small five-pointed star, filled with light chalk and outlined, centred on (cx, cy). */
export function drawEditionStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
): void {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = EDITION_COLORS.star;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, r * 0.18);
  ctx.strokeStyle = EDITION_COLORS.starLine;
  ctx.stroke();
  ctx.restore();
}

/** A four-pointed sparkle (the glint of a brillante object), centred on (cx, cy). */
export function drawEditionSparkle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx, cy, cx + r, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy + r);
  ctx.quadraticCurveTo(cx, cy, cx - r, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy - r);
  ctx.fillStyle = EDITION_COLORS.brillante.glint;
  ctx.fill();
  ctx.restore();
}

/**
 * The whole edition look of an object drawn alone in (x, y, w, h): its tint, then the
 * sparkle (brillante) or the star (légendaire) in the top-right corner.
 */
export function markEdition(
  ctx: CanvasRenderingContext2D,
  edition: Edition,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  if (edition === 'base') return;
  tintEdition(ctx, edition, x, y, w, h);
  const r = Math.max(4, Math.min(w, h) * 0.13);
  if (edition === 'legendaire') drawEditionStar(ctx, x + w - r * 1.1, y + r * 1.1, r);
  else drawEditionSparkle(ctx, x + w - r * 1.1, y + r * 1.1, r);
}
