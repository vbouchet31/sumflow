import { BELT_COLORS, BELT_SHAPE } from '../../config/colors';
import { DIRS, type Dir, DX, DY, opposite } from '../../core/grid';
import { axisOf, type Belt, hasOutput } from '../../sim/entities';
import type { Camera } from '../camera';
import { LOD } from '../lod';

/**
 * Sides a belt receives from, as a direction mask (bit d = something on side d pushes into
 * the tile). Without it, a belt is drawn as if fed from straight behind (bridge lanes).
 */
export type InputsOf = (b: Belt) => number;

/**
 * The input and output of a belt that turns: exactly one output, fed from exactly one side
 * at a right angle to it. Null for anything else (straight, split, merge, end).
 */
export function curveOf(outputs: number, inputs: number): { from: Dir; to: Dir } | null {
  let to: Dir | null = null;
  let from: Dir | null = null;
  for (const d of DIRS) {
    if (outputs === 1 << d) to = d;
    if (inputs === 1 << d) from = d;
  }
  if (to === null || from === null) return null;
  return axisOf(to) === axisOf(from) ? null : { from, to };
}

/** Radius of a turn along the belt centre line (items and chevrons follow it), 0 to 0.5. */
export function turnRadius(shape: { corner: number; band: number } = BELT_SHAPE): number {
  return Math.max(0, Math.min(0.5, shape.corner - shape.band));
}

/**
 * Geometry of a quarter turn entering by side `from` and leaving by side `to`, for a tile
 * whose top-left corner is at `(0, 0)` and side is 1: a straight run of `straight` from the
 * entry midpoint, an arc of radius `r` centred at `(cx, cy)`, then a straight run to the
 * exit midpoint. With `r` = 0.5 the arc is centred on the tile corner and fills the turn.
 */
export function curveGeometry(
  from: Dir,
  to: Dir,
  r: number = turnRadius(),
): { cx: number; cy: number; a0: number; sweep: number; r: number; straight: number } {
  const cx = 0.5 + (DX[from] + DX[to]) * r;
  const cy = 0.5 + (DY[from] + DY[to]) * r;
  // From the arc centre, the arc starts opposite the exit direction and ends opposite the entry.
  const a0 = Math.atan2(-DY[to], -DX[to]);
  const a1 = Math.atan2(-DY[from], -DX[from]);
  let sweep = a1 - a0;
  if (sweep > Math.PI) sweep -= 2 * Math.PI;
  if (sweep < -Math.PI) sweep += 2 * Math.PI;
  return { cx, cy, a0, sweep, r, straight: 0.5 - r };
}

/** Point and heading at `t` ∈ [0, 1] of the way along a quarter turn (see above). */
export function curvePoint(
  from: Dir,
  to: Dir,
  t: number,
  radius: number = turnRadius(),
): { x: number; y: number; fx: number; fy: number } {
  const { cx, cy, a0, sweep, r, straight } = curveGeometry(from, to, radius);
  const arc = (Math.PI / 2) * r;
  const d = t * (2 * straight + arc);
  if (d <= straight) {
    // Entry run: from the entry midpoint toward the tile centre.
    const k = 0.5 - d;
    return { x: 0.5 + DX[from] * k, y: 0.5 + DY[from] * k, fx: -DX[from], fy: -DY[from] };
  }
  if (d >= straight + arc) {
    // Exit run: from the end of the arc to the exit midpoint.
    const k = r + (d - straight - arc);
    return { x: 0.5 + DX[to] * k, y: 0.5 + DY[to] * k, fx: DX[to], fy: DY[to] };
  }
  const a = a0 + sweep * ((d - straight) / arc);
  const sign = Math.sign(sweep);
  return {
    x: cx + r * Math.cos(a),
    y: cy + r * Math.sin(a),
    fx: -Math.sin(a) * sign,
    fy: Math.cos(a) * sign,
  };
}

/**
 * Add the outline of a quarter turn band, `half` tiles wide on each side of the centre line,
 * to the current path (tile top-left at `(x, y)`, side `s`). The outer edge of the rails is
 * rounded by BELT_SHAPE.corner; every other edge is offset from it, so the rail stays the
 * same width all along the turn.
 */
function turnPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  from: Dir,
  to: Dir,
  half: number,
): void {
  const g = curveGeometry(from, to, 0);
  const ccw = g.sweep < 0;
  // Outer radius of this edge (rails or running surface), then the inner one.
  const ro = Math.max(0, Math.min(0.5 + half, BELT_SHAPE.corner - (BELT_SHAPE.band - half)));
  const ri = Math.max(0, ro - 2 * half);
  // Local frame: `a` toward the entry side, `b` toward the exit side, origin at the centre.
  const ax = DX[from];
  const ay = DY[from];
  const bx = DX[to];
  const by = DY[to];
  const X = (pa: number, pb: number): number => x + (0.5 + ax * pa + bx * pb) * s;
  const Y = (pa: number, pb: number): number => y + (0.5 + ay * pa + by * pb) * s;
  // Outer edge: entry side, rounded corner, exit side.
  ctx.moveTo(X(0.5, -half), Y(0.5, -half));
  const co = ro - half;
  ctx.arc(X(co, co), Y(co, co), ro * s, g.a0, g.a0 + g.sweep, ccw);
  ctx.lineTo(X(-half, 0.5), Y(-half, 0.5));
  // Inner edge, back to the entry side.
  ctx.lineTo(X(half, 0.5), Y(half, 0.5));
  const ci = half + ri;
  ctx.arc(X(ci, ci), Y(ci, ci), ri * s, g.a0 + g.sweep, g.a0, !ccw);
  ctx.lineTo(X(0.5, half), Y(0.5, half));
  ctx.closePath();
}

/** Draw a chevron pointing along `(fx, fy)` (unit vector), centred at `(cx, cy)`. */
function chevron(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  fx: number,
  fy: number,
  size: number,
): void {
  // Perpendicular.
  const px = -fy;
  const py = fx;
  const back = size * 0.5;
  const half = size;
  ctx.moveTo(cx - fx * back + px * half, cy - fy * back + py * half);
  ctx.lineTo(cx + fx * back * 0.6, cy + fy * back * 0.6);
  ctx.lineTo(cx - fx * back - px * half, cy - fy * back - py * half);
}

/** Sides a belt is joined on: its outputs, its inputs, and straight behind when unfed. */
function joints(b: Belt, inputs: number): number {
  return b.outputs | inputs;
}

/**
 * Add the band of one belt tile to the current path, `half` tiles wide on each side of the
 * centre line. A quarter turn is an annulus sector; anything else is a centre square with
 * an arm to every joined side (a straight belt is two opposite arms).
 */
function bandPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  b: Belt,
  inputs: number,
  half: number,
): void {
  const curve = curveOf(b.outputs, inputs);
  if (curve) {
    turnPath(ctx, x, y, s, curve.from, curve.to, half);
    return;
  }
  const mx = x + 0.5 * s;
  const my = y + 0.5 * s;
  const h = half * s;
  const mask = joints(b, inputs);
  let count = 0;
  for (const d of DIRS) {
    if (!(mask & (1 << d))) continue;
    count++;
    // Arm from the centre to the side, as wide as the band.
    const x0 = DX[d] === 0 ? mx - h : DX[d] > 0 ? mx : x;
    const x1 = DX[d] === 0 ? mx + h : DX[d] > 0 ? x + s : mx;
    const y0 = DY[d] === 0 ? my - h : DY[d] > 0 ? my : y;
    const y1 = DY[d] === 0 ? my + h : DY[d] > 0 ? y + s : my;
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
  }
  if (count === 1) {
    // A loose end (start of a line, or nothing joined yet): rounded by BELT_SHAPE.cap.
    ctx.roundRect(mx - h, my - h, 2 * h, 2 * h, BELT_SHAPE.cap * h);
  } else {
    ctx.rect(mx - h, my - h, 2 * h, 2 * h);
  }
}

/**
 * Belts layer (PLAN §10.2 layer 3): a continuous band joining each belt to what feeds it
 * and to where it leads, rounded in turns, with chevrons animated along the flow (they
 * follow the curve in a turn). `phase` ∈ [0, 1) scrolls with time × belt speed. `part`
 * draws only the static band or only the chevrons (below zoom 0.3 belts are plain lines and
 * count as base). `inputsOf` tells which sides feed each belt.
 */
export function drawBelts(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  belts: Iterable<Belt>,
  phase: number,
  part: 'all' | 'base' | 'chevrons' = 'all',
  inputsOf: InputsOf = straightInputs,
): void {
  const s = cam.scale;
  const list = Array.isArray(belts) ? (belts as Belt[]) : [...belts];
  if (cam.zoom < LOD.buildingText) {
    if (part === 'chevrons') return;
    // Lines only.
    ctx.strokeStyle = BELT_COLORS.line;
    ctx.lineWidth = Math.max(1, cam.zoom < LOD.depositText ? 0.15 * s : 0.3 * s);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const b of list) {
      const inputs = inputsOf(b);
      const curve = curveOf(b.outputs, inputs);
      const p = cam.worldToScreen(b.x, b.y);
      if (curve) {
        const { from, to } = curve;
        ctx.moveTo(p.x + (0.5 + DX[from] * 0.5) * s, p.y + (0.5 + DY[from] * 0.5) * s);
        ctx.arcTo(
          p.x + 0.5 * s,
          p.y + 0.5 * s,
          p.x + (0.5 + DX[to] * 0.5) * s,
          p.y + (0.5 + DY[to] * 0.5) * s,
          turnRadius() * s,
        );
        ctx.lineTo(p.x + (0.5 + DX[to] * 0.5) * s, p.y + (0.5 + DY[to] * 0.5) * s);
        continue;
      }
      const mask = joints(b, inputs);
      for (const d of DIRS) {
        if (!(mask & (1 << d))) continue;
        ctx.moveTo(p.x + 0.5 * s, p.y + 0.5 * s);
        ctx.lineTo(p.x + (0.5 + DX[d] * 0.5) * s, p.y + (0.5 + DY[d] * 0.5) * s);
      }
    }
    ctx.stroke();
    return;
  }

  if (part !== 'chevrons') {
    // Rails (darker edge), then the running surface: neighbouring tiles join seamlessly.
    for (const [color, half] of [
      [BELT_COLORS.rail, BELT_SHAPE.band],
      [BELT_COLORS.base, BELT_SHAPE.surface],
    ] as const) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (const b of list) {
        const p = cam.worldToScreen(b.x, b.y);
        bandPath(ctx, p.x, p.y, s, b, inputsOf(b), half);
      }
      ctx.fill('nonzero');
    }
  }

  if (part === 'base') return;

  const animated = cam.zoom >= LOD.full;
  ctx.strokeStyle = BELT_COLORS.chevron;
  ctx.lineWidth = Math.max(1, 0.07 * s);
  // Round ends cost a lot on thousands of live chevrons and do not show on thin lines:
  // keep them where chevrons are cached (static) or large (zoom ≥ 1).
  const round = !animated || cam.zoom >= 1;
  ctx.lineCap = round ? 'round' : 'butt';
  ctx.lineJoin = round ? 'round' : 'miter';
  ctx.beginPath();
  const size = 0.17 * s;
  for (const b of list) {
    const p = cam.worldToScreen(b.x, b.y);
    const cx = p.x + 0.5 * s;
    const cy = p.y + 0.5 * s;
    const curve = curveOf(b.outputs, inputsOf(b));
    if (curve) {
      // Two chevrons along the arc, turning with it.
      for (let i = 0; i < 2; i++) {
        const t = animated ? (phase + i * 0.5) % 1 : 0.25 + i * 0.5;
        const c = curvePoint(curve.from, curve.to, 0.1 + t * 0.8);
        chevron(ctx, p.x + c.x * s, p.y + c.y * s, c.fx, c.fy, size);
      }
      continue;
    }
    let outs = 0;
    for (const d of DIRS) if (hasOutput(b, d)) outs++;
    for (const d of DIRS) {
      if (!hasOutput(b, d)) continue;
      if (outs === 1) {
        // Two chevrons across the whole tile, scrolling.
        for (let i = 0; i < 2; i++) {
          const t = (animated ? (phase + i * 0.5) % 1 : 0.25 + i * 0.5) - 0.5;
          const off = t * 0.8;
          chevron(ctx, cx + DX[d] * off * s, cy + DY[d] * off * s, DX[d], DY[d], size);
        }
      } else {
        // One chevron on the half tile toward each output.
        const t = animated ? 0.15 + (phase % 1) * 0.25 : 0.27;
        chevron(ctx, cx + DX[d] * t * s, cy + DY[d] * t * s, DX[d], DY[d], size * 0.9);
      }
    }
  }
  ctx.stroke();
}

/** Default feed: from straight behind a single output (bridge lanes, previews). */
export function straightInputs(b: Belt): number {
  for (const d of DIRS) if (b.outputs === 1 << d) return 1 << opposite(d);
  return 0;
}
