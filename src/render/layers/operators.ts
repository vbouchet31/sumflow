import { chalkStroke } from '../chalk';
import { BUILDINGS } from '../../config/buildings';
import { BUILDING_COLORS, COLORS, FONT_NUM } from '../../config/colors';
import { DX, DY, type Rot, transformLocal } from '../../core/grid';
import { buildingSize, type OperatorType, portFaces } from '../../sim/entities';
import type { Camera } from '../camera';
import { LOD } from '../lod';

export const OPERATOR_SYMBOL: Record<OperatorType, string> = {
  adder: '+',
  multiplier: '×',
  subtractor: '−',
  divider: '÷',
  exponent: '^',
};

/** Mix a #rrggbb colour toward black (f < 0) or white (f > 0). */
export function shade(hex: string, f: number): string {
  const id = `${hex}${f}`;
  let c = shades.get(id);
  if (c === undefined) {
    c = computeShade(hex, f);
    shades.set(id, c);
  }
  return c;
}

const shades = new Map<string, string>();

function computeShade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f),
  );
  return `rgb(${ch[0]}, ${ch[1]}, ${ch[2]})`;
}

export interface OperatorDrawOptions {
  alpha?: number;
  /** 0..1 white overlay strength (cycle-end flash). */
  flash?: number;
  /** Ghost tint instead of the building colour. */
  tint?: string;
  /** Mirrored building (mirror applied before the rotation). */
  mirror?: boolean;
}

/**
 * Draw an operator (PLAN §10.1): one rounded tile per footprint tile, inputs darker and
 * outputs lighter, letters A/B/Q/R on port tiles, symbol at the centre, port faces marked
 * (dark notch = input, light notch = output). Shape + symbol tell operators apart (§9.5).
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

  for (const t of def.tiles) {
    const p = transformLocal(t.x, t.y, def.w, def.h, rot, mirror);
    const sp = cam.worldToScreen(ox + p.x, oy + p.y);
    const isIn = t.role === 'A' || t.role === 'B';
    ctx.fillStyle =
      opts.tint ?? (isIn ? shade(base, -0.3) : t.role === 'body' ? base : shade(base, 0.12));
    ctx.beginPath();
    ctx.roundRect(sp.x + inset, sp.y + inset, s - 2 * inset, s - 2 * inset, 0.18 * s);
    ctx.globalAlpha = (opts.alpha ?? 1) * (opts.tint ? 1 : 0.4);
    ctx.fill();
    ctx.globalAlpha = opts.alpha ?? 1;
    if (!opts.tint) chalkStroke(ctx, shade(base, 0.5), Math.max(1.5, 0.08 * s));
  }

  if (cam.zoom >= LOD.buildingText && !opts.tint) {
    // Port face notches.
    const len = 0.4 * s;
    const th = Math.max(1.5, 0.09 * s);
    for (const f of portFaces(type, ox, oy, rot, mirror)) {
      const c = cam.worldToScreen(f.x + 0.5 + DX[f.face] * 0.5, f.y + 0.5 + DY[f.face] * 0.5);
      const isIn = f.kind === 'A' || f.kind === 'B';
      ctx.fillStyle = isIn ? 'rgba(0, 0, 0, 0.55)' : 'rgba(255, 255, 255, 0.75)';
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
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.fillText(t.role, tc.x + (vx / len2) * push, tc.y + (vy / len2) * push);
    }

    // Operator symbol in a disc at the centre of the footprint box.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.arc(center.x, center.y, 0.36 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.text;
    ctx.font = `700 ${0.62 * s}px ${FONT_NUM}`;
    ctx.fillText(OPERATOR_SYMBOL[type], center.x, center.y + 0.04 * s);
  }

  if (opts.flash && opts.flash > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${0.35 * opts.flash})`;
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
