import { BUILDINGS, isSpecial } from '../config/buildings';
import type { SpecialEdition } from '../config/cards';
import {
  BELT_COLORS,
  BUILDING_COLORS,
  CHALK,
  COLORS,
  FONT_NUM,
  HUB_COLORS,
  SPECIAL_ORNAMENT,
} from '../config/colors';
import { type Rot, transformLocal } from '../core/grid';
import { buildingSize, OPERATOR_TYPES, type OperatorType } from '../sim/entities';
import type { Camera } from './camera';
import { chalkLine, chalkSquare, shade } from './chalk';
import { editionFrame } from './editions';
import { drawOperator, OPERATOR_SYMBOL } from './layers/operators';

/** Tools drawn as a picture of what they build in the build bar (special buildings too). */
export type IconTool = 'belt' | 'extractor' | OperatorType | 'storage' | 'bridge' | 'priority';

const OPERATORS: readonly string[] = OPERATOR_TYPES;

export function isIconTool(tool: string): tool is IconTool {
  return (
    OPERATORS.includes(tool) ||
    tool === 'belt' ||
    tool === 'extractor' ||
    tool === 'storage' ||
    tool === 'bridge' ||
    tool === 'priority'
  );
}

/** The picture turns with the build rotation. */
export function iconRotates(tool: IconTool): boolean {
  return OPERATORS.includes(tool) || tool === 'belt' || tool === 'bridge';
}

/** The picture moves (belt chevrons): redraw it every frame. */
export function iconAnimated(tool: IconTool): boolean {
  return tool === 'belt' || tool === 'bridge';
}

/** Seconds for a chevron to move one step along a belt icon. */
const CHEVRON_PERIOD_S = 0.7;

/**
 * Draw `tool` as it will be built, facing `rot`, in a `size` × `size` square at the origin
 * of `ctx` (CSS pixels). The square never changes with the rotation: a 3 × 1 multiplier
 * turned upright stays in the same slot. `time` (seconds) moves the belt chevrons. A
 * building in an `edition` keeps its colours and gets the edition frame, as on the map.
 */
export function drawToolIcon(
  ctx: CanvasRenderingContext2D,
  tool: IconTool,
  rot: Rot,
  size: number,
  time = 0,
  edition?: SpecialEdition,
): void {
  ctx.clearRect(0, 0, size, size);
  const phase = (time / CHEVRON_PERIOD_S) % 1;
  if (tool === 'belt') drawBelt(ctx, rot, size, phase);
  else if (tool === 'bridge') drawBridge(ctx, rot, size, phase);
  else if (tool === 'extractor') drawExtractor(ctx, size, edition);
  else if (tool === 'storage') drawStorage(ctx, size, edition);
  else if (tool === 'priority') drawPriority(ctx, size);
  else drawOperatorIcon(ctx, tool, rot, size, edition);
}

/** A camera that maps tile `(0, 0)` to `(ox, oy)` with `s` pixels per tile. */
function iconCamera(s: number, ox: number, oy: number): Camera {
  return {
    scale: s,
    // Below every level of detail: the operator layer draws its chalk tiles only.
    zoom: 0,
    viewW: Infinity,
    viewH: Infinity,
    worldToScreen: (x: number, y: number) => ({ x: ox + x * s, y: oy + y * s }),
  } as unknown as Camera;
}

/**
 * Operator: its chalk tiles as on the map, then letters and symbol sized for the bar (the
 * map sizes would be unreadable at a few pixels per tile). Letters stay upright.
 */
function drawOperatorIcon(
  ctx: CanvasRenderingContext2D,
  type: OperatorType,
  rot: Rot,
  size: number,
  edition?: SpecialEdition,
): void {
  const def = BUILDINGS[type];
  const pad = 1;
  // The longest side fills the slot, whatever the rotation.
  const s = (size - 2 * pad) / Math.max(def.w, def.h);
  const box = buildingSize(type, rot);
  const ox = (size - box.w * s) / 2;
  const oy = (size - box.h * s) / 2;
  drawOperator(ctx, iconCamera(s, ox, oy), type, 0, 0, rot, { edition });

  const at = (x: number, y: number): { x: number; y: number } => ({ x: ox + x * s, y: oy + y * s });
  let centre = at(box.w / 2, box.h / 2);
  if (def.tiles.length < def.w * def.h) {
    // L shapes: the symbol sits on the output tile, as on the map.
    const o = def.tiles.find((t) => t.role === 'O');
    if (o) {
      const p = transformLocal(o.x, o.y, def.w, def.h, rot, false);
      centre = at(p.x + 0.5, p.y + 0.5);
    }
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.max(8, 0.5 * s)}px ${FONT_NUM}`;
  for (const t of def.tiles) {
    if (t.role !== 'A' && t.role !== 'B' && t.role !== 'Q' && t.role !== 'R') continue;
    const p = transformLocal(t.x, t.y, def.w, def.h, rot, false);
    const c = at(p.x + 0.5, p.y + 0.5);
    // Inputs in white, the divider's two outputs in yellow.
    ctx.fillStyle = t.role === 'A' || t.role === 'B' ? COLORS.text : CHALK.yellow;
    ctx.fillText(t.role, c.x, c.y + 0.5);
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.arc(centre.x, centre.y, Math.max(6, 0.4 * s), 0, Math.PI * 2);
  ctx.fill();
  if (isSpecial(type)) {
    // The ring of a special building's symbol, as on the map.
    ctx.strokeStyle = SPECIAL_ORNAMENT;
    ctx.lineWidth = Math.max(1, 0.06 * s);
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, Math.max(7.5, 0.5 * s), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = COLORS.text;
  ctx.font = `700 ${Math.max(11, 0.66 * s)}px ${FONT_NUM}`;
  ctx.fillText(OPERATOR_SYMBOL[type], centre.x, centre.y + 1);
}

/** Notches on the 12 outer faces of a 3 × 3 block, as on an extractor. */
function outerNotches(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  const inset = 0.1 * s;
  const len = 0.36 * s;
  const th = Math.max(1, 0.1 * s);
  ctx.fillStyle = CHALK.markFaint;
  for (let i = 0; i < 3; i++) {
    const mid = (i + 0.5) * s;
    ctx.fillRect(x + mid - len / 2, y + inset, len, th);
    ctx.fillRect(x + mid - len / 2, y + 3 * s - inset - th, len, th);
    ctx.fillRect(x + inset, y + mid - len / 2, th, len);
    ctx.fillRect(x + 3 * s - inset - th, y + mid - len / 2, th, len);
  }
}

/** Extractor: the plain extractor chalk (no value yet), its notches and an `n`. */
function drawExtractor(
  ctx: CanvasRenderingContext2D,
  size: number,
  edition?: SpecialEdition,
): void {
  const s = (size - 2) / 3;
  const base = BUILDING_COLORS.extractor;
  const inset = 0.1 * s;
  chalkSquare(
    ctx,
    1 + inset,
    1 + inset,
    3 * s - 2 * inset,
    7,
    { wash: base, hatch: shade(base, 0.35), outline: shade(base, 0.65) },
    { hatch: Math.max(1, 0.09 * s), outline: Math.max(1.5, 0.12 * s) },
  );
  if (edition)
    editionFrame(ctx, edition, [{ x: 1 + inset, y: 1 + inset, s: 3 * s - 2 * inset, seed: 7 }], s);
  outerNotches(ctx, 1, 1, s);
  ctx.fillStyle = COLORS.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${1.2 * s}px ${FONT_NUM}`;
  ctx.fillText('n', size / 2, size / 2 + 1);
}

/** Storage: the grey block with a few items above a half-full bar. */
function drawStorage(ctx: CanvasRenderingContext2D, size: number, edition?: SpecialEdition): void {
  const s = (size - 2) / 3;
  const base = BUILDING_COLORS.storage;
  const inset = 0.1 * s;
  chalkSquare(
    ctx,
    1 + inset,
    1 + inset,
    3 * s - 2 * inset,
    11,
    { wash: base, hatch: shade(base, -0.25), outline: shade(base, 0.5) },
    { hatch: Math.max(1, 0.09 * s), outline: Math.max(1.5, 0.12 * s) },
  );
  if (edition) {
    editionFrame(ctx, edition, [{ x: 1 + inset, y: 1 + inset, s: 3 * s - 2 * inset, seed: 11 }], s);
  }
  ctx.fillStyle = COLORS.text;
  const r = 0.2 * s;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(1 + (0.95 + i * 0.55) * s, 1 + 1.15 * s, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const bx = 1 + 0.55 * s;
  const bw = 1.9 * s;
  const by = 1 + 1.75 * s;
  const bh = 0.3 * s;
  ctx.fillStyle = HUB_COLORS.barTrack;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, bh / 2);
  ctx.fill();
  ctx.fillStyle = HUB_COLORS.barFill;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw * 0.55, bh, bh / 2);
  ctx.fill();
}

function drawPriority(ctx: CanvasRenderingContext2D, size: number): void {
  const r = size * 0.26;
  const c = size / 2;
  ctx.fillStyle = BELT_COLORS.priority;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(c, c - r);
  ctx.lineTo(c + r, c);
  ctx.lineTo(c, c + r);
  ctx.lineTo(c - r, c);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

const RAIL = 'rgba(242, 239, 230, 0.75)';
const CHEVRON = 'rgba(242, 239, 230, 0.95)';

/**
 * Chevrons along +x from `x0` to `x1`, half-height `h`, `step` apart, shifted by `phase`
 * (0..1 of a step). Clipped to the lane, so they slide in and out at its ends.
 */
function chevrons(
  ctx: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  h: number,
  step: number,
  phase: number,
  lw: number,
  seed: number,
  color = CHEVRON,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, -h * 1.6, x1 - x0, h * 3.2);
  ctx.clip();
  const w = h * 1.05;
  for (let i = -1, x = x0 + phase * step - step; x < x1 + step; i++, x += step) {
    chalkLine(ctx, x, -h, x + w, 0, seed + i * 2, color, lw);
    chalkLine(ctx, x + w, 0, x, h, seed + i * 2 + 1, color, lw);
  }
  ctx.restore();
}

/** Belt: two rails and chevrons moving in the direction the belt will carry items. */
function drawBelt(ctx: CanvasRenderingContext2D, rot: Rot, size: number, phase: number): void {
  ctx.save();
  ctx.translate(size / 2, size / 2);
  // Rotation 0 carries East, then clockwise (as the belt tool).
  ctx.rotate((rot * Math.PI) / 2);
  const half = size / 2;
  const band = size * 0.18;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.fillRect(-half, -band, size, 2 * band);
  const lw = Math.max(1.5, size * 0.045);
  chalkLine(ctx, -half, -band, half, -band, 3, RAIL, lw);
  chalkLine(ctx, -half, band, half, band, 4, RAIL, lw);
  chevrons(ctx, -half, half, band * 0.62, size * 0.36, phase, Math.max(1.6, size * 0.05), 11);
  ctx.restore();
}

/**
 * Bridge: a deck along the build direction with its chevrons, and a second lane crossing
 * underneath, its chevrons showing on both sides of the deck.
 */
function drawBridge(ctx: CanvasRenderingContext2D, rot: Rot, size: number, phase: number): void {
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate((rot * Math.PI) / 2);
  const half = size / 2;
  const band = size * 0.17;
  const lw = Math.max(1.4, size * 0.04);

  // Lane underneath, across the deck (drawn as a belt turned a quarter).
  ctx.save();
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.fillRect(-half, -band, size, 2 * band);
  chalkLine(ctx, -half, -band, half, -band, 21, CHALK.rail, lw);
  chalkLine(ctx, -half, band, half, band, 22, CHALK.rail, lw);
  // Fainter: this lane runs below.
  chevrons(ctx, -half, half, band * 0.6, size * 0.36, phase, lw, 31, CHALK.markFaint);
  ctx.restore();

  // The deck hides the middle of the lower lane.
  const deck = size * 0.24;
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(-half, -deck, size, 2 * deck);
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = BUILDING_COLORS.bridge;
  ctx.fillRect(-half, -deck, size, 2 * deck);
  ctx.globalAlpha = 1;
  for (let i = -2; i <= 2; i++) {
    const x = i * size * 0.2;
    chalkLine(ctx, x, -deck * 0.8, x, deck * 0.8, 41 + i, CHALK.plank, 1);
  }
  chalkLine(ctx, -half, -deck, half, -deck, 51, CHALK.beam, Math.max(1.5, size * 0.045));
  chalkLine(ctx, -half, deck, half, deck, 52, CHALK.beam, Math.max(1.5, size * 0.045));
  chevrons(ctx, -half, half, deck * 0.5, size * 0.36, phase, Math.max(1.6, size * 0.05), 61);
  ctx.restore();
}
