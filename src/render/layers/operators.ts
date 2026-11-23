import { BUILDINGS, isSpecial } from '../../config/buildings';
import { BUILDING_COLORS, CHALK, COLORS, FONT_NUM, SPECIAL_ORNAMENT } from '../../config/colors';
import { DX, DY, type Rot, transformLocal } from '../../core/grid';
import { buildingSize, type OperatorType, portFaces } from '../../sim/entities';
import type { SpecialEdition } from '../../config/cards';
import type { Camera } from '../camera';
import { chalkSquare, sketchRect, shade, tileSeed } from '../chalk';
import { editionFrame, type ScreenTile } from '../editions';
import { LOD } from '../lod';

export const OPERATOR_SYMBOL: Record<OperatorType, string> = {
  adder: '+',
  multiplier: '×',
  subtractor: '−',
  divider: '÷',
  exponent: '^',
  ancientAdder: '+',
};

export interface OperatorDrawOptions {
  alpha?: number;
  /** 0..1 white overlay strength (cycle-end flash). */
  flash?: number;
  /** Ghost tint instead of the building colour. */
  tint?: string;
  /** Mirrored building (mirror applied before the rotation). */
  mirror?: boolean;
  /** Drawn in the chalk of this edition (PLAN-recompenses §3.4). */
  edition?: SpecialEdition | undefined;
}

/**
 * Draw an operator (PLAN §10.1): one rounded tile per footprint tile, inputs darker and
 * outputs lighter, letters A/B/Q/R on port tiles, symbol at the centre, port faces marked
 * (dark notch = input, light notch = output). Shape + symbol tell operators apart (§9.5).
 * A special building adds its ornament (inner frame, studs, ringed symbol); an edition, its
 * frame of pearly or golden chalk over the building's own colours.
 */
export function drawOperator(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  type: OperatorType,
  ox: number,
  oy: number,
  rot: Rot,
  opts: OperatorDrawOptions = {},
): void {
  const s = cam.scale;
  const mirror = opts.mirror === true;
  const def = BUILDINGS[type];
  const base = BUILDING_COLORS[type];
  const size = buildingSize(type, rot);
  // Symbol anchor: centre of the box for full rectangles, the output tile for L shapes.
  let center = cam.worldToScreen(ox + size.w / 2, oy + size.h / 2);
  if (def.tiles.length < def.w * def.h) {
    const o = def.tiles.find((t) => t.role === 'O');
    if (o) {
      const p = transformLocal(o.x, o.y, def.w, def.h, rot, mirror);
      center = cam.worldToScreen(ox + p.x + 0.5, oy + p.y + 0.5);
    }
  }
  ctx.globalAlpha = opts.alpha ?? 1;
  const inset = 0.06 * s;
  const edition = opts.tint ? undefined : opts.edition;
  const special = isSpecial(type);
  const drawn: ScreenTile[] = [];

  for (const t of def.tiles) {
    const p = transformLocal(t.x, t.y, def.w, def.h, rot, mirror);
    const sp = cam.worldToScreen(ox + p.x, oy + p.y);
    const isIn = t.role === 'A' || t.role === 'B';
    if (opts.tint) {
      // Ghost of an impossible placement: a plain wash of the warning colour.
      ctx.fillStyle = opts.tint;
      ctx.beginPath();
      ctx.roundRect(sp.x + inset, sp.y + inset, s - 2 * inset, s - 2 * inset, 0.18 * s);
      ctx.fill();
      continue;
    }
    const seed = tileSeed(ox + p.x, oy + p.y);
    const side = s - 2 * inset;
    // Inputs are coloured in darker than the body and the outputs.
    chalkSquare(
      ctx,
      sp.x + inset,
      sp.y + inset,
      side,
      seed,
      { wash: base, hatch: shade(base, isIn ? 0 : 0.25), outline: shade(base, 0.5) },
      { hatch: Math.max(1, 0.07 * s), outline: Math.max(1.5, 0.08 * s) },
    );
    if (special) drawOrnament(ctx, sp.x + inset, sp.y + inset, side, seed);
    drawn.push({ x: sp.x + inset, y: sp.y + inset, s: side, seed });
  }
  if (edition) editionFrame(ctx, edition, drawn, s);

  if (cam.zoom >= LOD.buildingText && !opts.tint) {
    // Port face notches.
    const len = 0.4 * s;
    const th = Math.max(1.5, 0.09 * s);
    for (const f of portFaces(type, ox, oy, rot, mirror)) {
      const c = cam.worldToScreen(f.x + 0.5 + DX[f.face] * 0.5, f.y + 0.5 + DY[f.face] * 0.5);
      const isIn = f.kind === 'A' || f.kind === 'B';
      ctx.fillStyle = isIn ? CHALK.notchIn : CHALK.mark;
      const back = inset + th / 2;
      const cx = c.x - DX[f.face] * back;
      const cy = c.y - DY[f.face] * back;
      if (DX[f.face] !== 0) ctx.fillRect(cx - th / 2, cy - len / 2, th, len);
      else ctx.fillRect(cx - len / 2, cy - th / 2, len, th);
    }

    // Letters on port tiles, pushed away from the centre so the symbol stays clear.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${0.34 * s}px ${FONT_NUM}`;
    for (const t of def.tiles) {
      if (t.role !== 'A' && t.role !== 'B' && t.role !== 'Q' && t.role !== 'R') continue;
      const p = transformLocal(t.x, t.y, def.w, def.h, rot, mirror);
      const tc = cam.worldToScreen(ox + p.x + 0.5, oy + p.y + 0.5);
      const vx = tc.x - center.x;
      const vy = tc.y - center.y;
      const len2 = Math.hypot(vx, vy) || 1;
      // Push letters away from a symbol at a tile corner; none needed when it sits on a tile.
      const push = def.tiles.length < def.w * def.h ? 0 : 0.14 * s;
      ctx.fillStyle = COLORS.text;
      ctx.fillText(t.role, tc.x + (vx / len2) * push, tc.y + (vy / len2) * push);
    }

    // Operator symbol in a disc at the centre of the footprint box (ringed on a special one).
    ctx.fillStyle = CHALK.shadow;
    ctx.beginPath();
    ctx.arc(center.x, center.y, 0.36 * s, 0, Math.PI * 2);
    ctx.fill();
    if (special) {
      ctx.strokeStyle = SPECIAL_ORNAMENT;
      ctx.lineWidth = Math.max(1, 0.05 * s);
      ctx.beginPath();
      ctx.arc(center.x, center.y, 0.44 * s, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = COLORS.text;
    ctx.font = `700 ${0.62 * s}px ${FONT_NUM}`;
    ctx.fillText(OPERATOR_SYMBOL[type], center.x, center.y + 0.04 * s);
  }

  if (opts.flash && opts.flash > 0) {
    ctx.fillStyle = `rgba(242, 239, 230, ${0.35 * opts.flash})`;
    for (const t of def.tiles) {
      const p = transformLocal(t.x, t.y, def.w, def.h, rot, mirror);
      const sp = cam.worldToScreen(ox + p.x, oy + p.y);
      ctx.beginPath();
      ctx.roundRect(sp.x + inset, sp.y + inset, s - 2 * inset, s - 2 * inset, 0.18 * s);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * Ornament of a special building on one of its tiles (`x, y, side`: the tile outline): a
 * second frame inside the outline and a stud in each corner, like an old carved tablet.
 */
export function drawOrnament(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  side: number,
  seed: number,
): void {
  const inner = side * 0.16;
  const lw = Math.max(1, side * 0.035);
  sketchRect(
    ctx,
    x + inner,
    y + inner,
    side - 2 * inner,
    side - 2 * inner,
    seed ^ 0x2f,
    SPECIAL_ORNAMENT,
    lw,
  );
  const r = Math.max(0.8, side * 0.045);
  const d = side * 0.08;
  ctx.fillStyle = SPECIAL_ORNAMENT;
  ctx.beginPath();
  for (const [cx, cy] of [
    [x + d, y + d],
    [x + side - d, y + d],
    [x + d, y + side - d],
    [x + side - d, y + side - d],
  ] as const) {
    ctx.moveTo(cx + r, cy);
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  }
  ctx.fill();
}
