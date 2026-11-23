/**
 * Pictures of the reward cards (PLAN-recompenses §4.2): the front of a card shows the object
 * in its edition. Buildings are drawn as in the build bar, a value is its number circled in
 * its item chalk, an edition card is a stick of pearly or golden chalk, and the other cards
 * get a chalk icon of their own.
 */
import type { Edition } from '../config/cards';
import { BUILDINGS, isSpecial } from '../config/buildings';
import { CHALK, COLORS, EDITION_COLORS, FONT_NUM, HUB_COLORS } from '../config/colors';
import { formatCompact } from '../core/format';
import { chalkLine, chalkStroke, sketchCircle, sketchRect } from './chalk';
import { drawEditionSparkle, drawEditionStar, editionGradient } from './editions';
import { itemColor } from './itemColor';
import { drawToolIcon, type IconTool, isIconTool } from './toolIcons';

/** What the front of a card shows. */
export type CardArt =
  | { kind: 'building'; tool: IconTool; edition: Edition }
  | { kind: 'value'; value: number }
  | { kind: 'edition'; edition: Exclude<Edition, 'base'> }
  | { kind: 'upgrades' }
  | { kind: 'passive' }
  | { kind: 'eventail' }
  | { kind: 'unknown' };

/** Feature cards drawn as the tool they bring. */
const FEATURE_TOOL: Readonly<Record<string, IconTool>> = { priorities: 'priority' };

/**
 * The picture of a card from its icon id (`kind:name`, see `CardDef.icon`), its edition and,
 * for a value card, the value it gives.
 */
export function cardArt(icon: string, edition: Edition, value?: number): CardArt {
  const [kind, name = ''] = icon.split(':');
  switch (kind) {
    case 'value':
      return { kind: 'value', value: value ?? 0 };
    case 'building':
      return isIconTool(name) ? { kind: 'building', tool: name, edition } : { kind: 'unknown' };
    case 'special':
      // Its own picture: the building it imitates, with the ornament of a special one.
      return isSpecial(name) ? { kind: 'building', tool: name, edition } : { kind: 'unknown' };
    case 'edition':
      return name === 'brillante' || name === 'legendaire'
        ? { kind: 'edition', edition: name }
        : { kind: 'unknown' };
    case 'feature': {
      const tool = FEATURE_TOOL[name];
      if (tool) return { kind: 'building', tool, edition: 'base' };
      return name === 'upgrades' ? { kind: 'upgrades' } : { kind: 'unknown' };
    }
    case 'passive':
      return { kind: 'passive' };
    case 'meta':
      return name === 'eventail' ? { kind: 'eventail' } : { kind: 'unknown' };
    default:
      return { kind: 'unknown' };
  }
}

/**
 * Draw `art` in a `w` × `h` rectangle at the origin of `ctx` (CSS pixels; square by default).
 * A building fills the rectangle as far as its footprint allows (a long multiplier uses the
 * whole width); every other picture is drawn in the centred square.
 */
export function drawCardArt(
  ctx: CanvasRenderingContext2D,
  art: CardArt,
  w: number,
  h: number = w,
): void {
  ctx.clearRect(0, 0, w, h);
  if (art.kind === 'building') {
    drawBuilding(ctx, art.tool, art.edition, w, h);
    return;
  }
  const size = Math.min(w, h);
  ctx.save();
  ctx.translate((w - size) / 2, (h - size) / 2);
  switch (art.kind) {
    case 'value':
      drawValue(ctx, art.value, size);
      break;
    case 'edition':
      drawChalkStick(ctx, art.edition, size);
      break;
    case 'upgrades':
      drawUpgrades(ctx, size);
      break;
    case 'passive':
      drawPassive(ctx, size);
      break;
    case 'eventail':
      drawFan(ctx, size);
      break;
    case 'unknown':
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${size * 0.5}px ${FONT_NUM}`;
      ctx.fillText('?', size / 2, size / 2);
      break;
  }
  ctx.restore();
}

/** Share of the rectangle a building picture fills, leaving room for the chalk wobble. */
const BUILDING_FILL = 0.92;

/**
 * The build-bar picture, as large as its footprint allows in `w` × `h`, in its edition (its
 * own colours, the edition frame, glint and mark). The bar draws a building with its longest side across a square: that square is
 * scaled so the drawn tiles reach the rectangle's width or height, whichever comes first.
 */
function drawBuilding(
  ctx: CanvasRenderingContext2D,
  tool: IconTool,
  edition: Edition,
  w: number,
  h: number,
): void {
  const def = (BUILDINGS as Partial<Record<string, { w: number; h: number }>>)[tool];
  const bw = def?.w ?? 1;
  const bh = def?.h ?? 1;
  const long = Math.max(bw, bh);
  const square = BUILDING_FILL * Math.min((w * long) / bw, (h * long) / bh);
  ctx.save();
  ctx.translate((w - square) / 2, (h - square) / 2);
  drawToolIcon(ctx, tool, 0, square, 0, edition === 'base' ? undefined : edition);
  ctx.restore();
}

/** The value written large in its item chalk, circled by hand. */
function drawValue(ctx: CanvasRenderingContext2D, value: number, size: number): void {
  const c = size / 2;
  const r = size * 0.38;
  const color = itemColor(value);
  ctx.fillStyle = CHALK.smudge;
  ctx.beginPath();
  ctx.arc(c, c, r * 1.12, 0, Math.PI * 2);
  ctx.fill();
  sketchCircle(ctx, c, c, r, value * 31 + 7, color, Math.max(2, size * 0.04));
  const text = formatCompact(value);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fit = text.length <= 1 ? 0.5 : text.length === 2 ? 0.42 : 0.3;
  ctx.font = `700 ${size * fit}px ${FONT_NUM}`;
  ctx.fillText(text, c, c + size * 0.02);
}

/**
 * A stick of edition chalk lying across the square, its tip worn round, with the line it
 * has just drawn on the board. Légendaire adds its star, brillante its sparkle.
 */
function drawChalkStick(
  ctx: CanvasRenderingContext2D,
  edition: Exclude<Edition, 'base'>,
  size: number,
): void {
  const colors = EDITION_COLORS[edition];
  // The stroke left on the board, under the stick.
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  // It ends under the worn tip of the stick.
  ctx.moveTo(size * 0.1, size * 0.84);
  ctx.quadraticCurveTo(size * 0.15, size * 0.64, size * 0.28, size * 0.66);
  chalkStroke(ctx, colors.stops[1], Math.max(2, size * 0.045));
  ctx.restore();

  const len = size * 0.66;
  const thick = size * 0.17;
  ctx.save();
  ctx.translate(size * 0.55, size * 0.44);
  ctx.rotate(-Math.PI / 5);
  const x0 = -len / 2;
  const y0 = -thick / 2;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = size * 0.04;
  ctx.shadowOffsetY = size * 0.02;
  ctx.fillStyle = editionGradient(ctx, edition, x0, y0, len, thick);
  ctx.beginPath();
  // Square back end, rounded (worn) writing end on the left.
  ctx.roundRect(x0, y0, len, thick, [thick / 2, thick * 0.12, thick * 0.12, thick / 2]);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  // Shading along the lower edge and a light along the top: a round stick.
  ctx.fillStyle = colors.deep;
  ctx.globalAlpha = 0.45;
  ctx.fillRect(x0 + thick * 0.4, y0 + thick * 0.68, len - thick * 0.5, thick * 0.22);
  ctx.fillStyle = colors.glint;
  ctx.globalAlpha = 0.8;
  ctx.fillRect(x0 + thick * 0.5, y0 + thick * 0.16, len - thick * 0.8, thick * 0.16);
  ctx.globalAlpha = 1;
  // The back end, seen from the side.
  ctx.fillStyle = colors.deep;
  ctx.beginPath();
  ctx.ellipse(-x0 - thick * 0.06, 0, thick * 0.12, thick / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const r = size * 0.1;
  if (edition === 'legendaire') drawEditionStar(ctx, size * 0.8, size * 0.18, r);
  else drawEditionSparkle(ctx, size * 0.8, size * 0.18, r * 1.2);
}

/** Upgrades: a chalk arrow going up a flight of steps. */
function drawUpgrades(ctx: CanvasRenderingContext2D, size: number): void {
  const lw = Math.max(2, size * 0.045);
  const s = size;
  // Steps.
  const steps: [number, number][] = [
    [0.16, 0.84],
    [0.38, 0.84],
    [0.38, 0.66],
    [0.6, 0.66],
    [0.6, 0.48],
    [0.84, 0.48],
  ];
  for (let i = 0; i + 1 < steps.length; i++) {
    const a = steps[i] as [number, number];
    const b = steps[i + 1] as [number, number];
    chalkLine(ctx, a[0] * s, a[1] * s, b[0] * s, b[1] * s, 70 + i, CHALK.markFaint, lw * 0.8);
  }
  // Arrow.
  const tip = { x: 0.62 * s, y: 0.14 * s };
  chalkLine(ctx, 0.24 * s, 0.62 * s, tip.x, tip.y + 0.02 * s, 81, CHALK.yellow, lw * 1.3);
  chalkLine(ctx, tip.x, tip.y, tip.x - 0.2 * s, tip.y + 0.04 * s, 82, CHALK.yellow, lw * 1.3);
  chalkLine(ctx, tip.x, tip.y, tip.x + 0.02 * s, tip.y + 0.2 * s, 83, CHALK.yellow, lw * 1.3);
}

/** A passive rule: a chalk lightning bolt (everything runs faster). */
function drawPassive(ctx: CanvasRenderingContext2D, size: number): void {
  const s = size;
  const pts: [number, number][] = [
    [0.58, 0.1],
    [0.26, 0.54],
    [0.48, 0.54],
    [0.38, 0.9],
    [0.76, 0.42],
    [0.53, 0.42],
  ];
  ctx.save();
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * s, y * s) : ctx.lineTo(x * s, y * s)));
  ctx.closePath();
  ctx.fillStyle = CHALK.yellow;
  ctx.globalAlpha = 0.28;
  ctx.fill();
  ctx.globalAlpha = 1;
  chalkStroke(ctx, CHALK.yellow, Math.max(2, s * 0.045));
  ctx.restore();
  // Speed lines.
  for (let i = 0; i < 3; i++) {
    const y = (0.36 + i * 0.14) * s;
    chalkLine(ctx, 0.08 * s, y, (0.2 - i * 0.03) * s, y, 90 + i, CHALK.markFaint, s * 0.03);
  }
}

/** Éventail: three chalk cards fanned out. */
function drawFan(ctx: CanvasRenderingContext2D, size: number): void {
  drawCardFan(ctx, size / 2, size * 0.54, size * 0.3, 3, 0);
}

/**
 * `n` chalk card outlines fanned out around (x, y), `r` the half height of a card. Also the
 * hub's "offer" icon. `seed` varies the hand-drawn wobble.
 */
export function drawCardFan(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  n: number,
  seed: number,
): void {
  const w = 1.36 * r;
  const h = 2 * r;
  const lw = Math.max(1, 0.1 * r);
  for (let i = 0; i < n; i++) {
    const k = i - (n - 1) / 2;
    ctx.save();
    ctx.translate(x + k * 0.62 * r, y + Math.abs(k) * 0.16 * r);
    ctx.rotate(k * 0.28);
    ctx.fillStyle = HUB_COLORS.rewardChoice;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    sketchRect(ctx, -w / 2, -h / 2, w, h, seed + i * 17 + 3, HUB_COLORS.rewardChoiceLine, lw);
    ctx.restore();
  }
  // A mark on the card on top (the last one drawn).
  const k = (n - 1) / 2;
  ctx.fillStyle = CHALK.yellow;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${0.9 * r}px ${FONT_NUM}`;
  ctx.fillText('?', x + k * 0.62 * r, y + k * 0.16 * r + 0.05 * r);
}
