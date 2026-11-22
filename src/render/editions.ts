/**
 * Edition chalks (PLAN-recompenses §3.4): a building in an edition keeps its own colours
 * (they tell operators apart) and gets a frame of pearly or golden chalk, a glint and, for
 * a brillante, a sparkle, for a légendaire, a small star. Base is left as drawn. The same
 * helper draws the buildings on the map, their ghosts, the build bar pictures and the
 * pictures of the cards (`editionFrame`).
 */
import type { Edition } from '../config/cards';
import { EDITION_COLORS } from '../config/colors';
import { sketchRect } from './chalk';

type Tinted = Exclude<Edition, 'base'>;

/** A tile of a building on screen: its top-left corner and side, in pixels. */
export interface ScreenTile {
  x: number;
  y: number;
  s: number;
  /** Seed of the hand-drawn wobble (the tile seed, as for its base outline). */
  seed?: number;
}

/**
 * The edition of a building drawn on the map, over its own chalk tiles: each tile is
 * outlined again, thicker, with the edition chalk (a gradient across the building: the
 * pearly chalk shimmers, the golden one has several golds), over a faint halo that keeps the
 * frame readable when zoomed out; then the glint and the mark (`editionGlint`).
 */
export function editionFrame(
  ctx: CanvasRenderingContext2D,
  edition: Tinted,
  tiles: readonly ScreenTile[],
  /** Size of one map tile in pixels (line widths and the mark follow it). */
  unit = tiles[0]?.s ?? 0,
): void {
  if (tiles.length === 0) return;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const t of tiles) {
    x0 = Math.min(x0, t.x);
    y0 = Math.min(y0, t.y);
    x1 = Math.max(x1, t.x + t.s);
    y1 = Math.max(y1, t.y + t.s);
  }
  const lw = Math.max(2, unit * FRAME_WIDTH);
  const alpha = ctx.globalAlpha;
  // Halo: the edition colour, wide and faint, so the frame still reads at a few pixels.
  ctx.save();
  ctx.globalAlpha = alpha * 0.3;
  ctx.strokeStyle = EDITION_COLORS[edition].stops[1];
  ctx.lineWidth = lw * 2.2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const t of tiles) ctx.rect(t.x, t.y, t.s, t.s);
  ctx.stroke();
  ctx.restore();
  const gradient = editionGradient(ctx, edition, x0, y0, x1 - x0, y1 - y0);
  for (const t of tiles) sketchRect(ctx, t.x, t.y, t.s, t.s, t.seed ?? 0, gradient, lw);
  ctx.globalAlpha = alpha;
  editionGlint(ctx, edition, tiles, unit);
}

/** Width of the edition frame, in tiles (a base outline is 0.08). */
const FRAME_WIDTH = 0.13;

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
