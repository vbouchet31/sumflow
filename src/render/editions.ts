/**
 * Edition chalks (PLAN-recompenses §3.4): a brillante object is recoloured in pearly chalk
 * with a glint, a légendaire one in golden chalk with a small star. Base is left as drawn.
 * One helper for every place that shows an edition: the choice screen, the build bar, and
 * the buildings on the map and their ghosts (`editionChalk`, `editionGlint`).
 */
import type { Edition } from '../config/cards';
import { EDITION_COLORS } from '../config/colors';
import { shade } from './chalk';

type Tinted = Exclude<Edition, 'base'>;

/**
 * Chalk of one tile of a building in an edition, on the map: hatching in one of the
 * edition's gradient colours (picked from the tile seed, so a pearly building shimmers and a
 * golden one has several golds), a light outline. `darker` for input tiles, as for base.
 */
export function editionChalk(
  edition: Tinted,
  seed: number,
  darker = false,
): { wash: string; hatch: string; outline: string } {
  const c = EDITION_COLORS[edition];
  const hatch = c.stops[(seed >>> 4) % c.stops.length] ?? c.stops[0];
  return {
    wash: c.stops[1],
    hatch: darker ? shade(hatch, -0.22) : hatch,
    outline: c.outline,
  };
}

/** A tile of a building on screen: its top-left corner and side, in pixels. */
export interface ScreenTile {
  x: number;
  y: number;
  s: number;
}

/**
 * The glint of an edition across a building drawn on the map: a light diagonal band over
 * its tiles only (clipped), then the sparkle or the star in the corner of its top-right
 * tile when the tiles are large enough to show it.
 */
export function editionGlint(
  ctx: CanvasRenderingContext2D,
  edition: Tinted,
  tiles: readonly ScreenTile[],
  /** Size of one map tile in pixels (the mark keeps that scale on a 3 × 3 block). */
  unit = tiles[0]?.s ?? 0,
): void {
  const first = tiles[0];
  if (!first) return;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let corner = first;
  for (const t of tiles) {
    x0 = Math.min(x0, t.x);
    y0 = Math.min(y0, t.y);
    x1 = Math.max(x1, t.x + t.s);
    y1 = Math.max(y1, t.y + t.s);
    if (t.x - t.y > corner.x - corner.y) corner = t;
  }
  ctx.save();
  ctx.beginPath();
  for (const t of tiles) ctx.rect(t.x, t.y, t.s, t.s);
  ctx.clip();
  const glint = ctx.createLinearGradient(x0, y0, x1, y1);
  glint.addColorStop(0.2, 'rgba(255, 255, 255, 0)');
  glint.addColorStop(0.32, EDITION_COLORS[edition].glint);
  glint.addColorStop(0.44, 'rgba(255, 255, 255, 0)');
  ctx.globalAlpha *= edition === 'brillante' ? 0.45 : 0.3;
  ctx.fillStyle = glint;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.restore();
  const r = unit * 0.2;
  if (r < 2.5) return;
  const cx = corner.x + corner.s - r * 1.25;
  const cy = corner.y + r * 1.25;
  if (edition === 'legendaire') drawEditionStar(ctx, cx, cy, r);
  else drawEditionSparkle(ctx, cx, cy, r * 1.2);
}

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
