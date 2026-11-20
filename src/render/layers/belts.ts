import { BELT_COLORS, BELT_SHAPE, CHALK, COLORS } from '../../config/colors';
import { DIRS, type Dir, DX, DY, opposite } from '../../core/grid';
import { axisOf, type Belt, hasOutput } from '../../sim/entities';
import type { Camera } from '../camera';
import { LOD } from '../lod';
import { chalkCurve, chalkLine, hash01, tileSeed } from '../chalk';
import { beltChains, type RailNode, railNodes } from '../beltChains';
import { type BeltLinks, NO_BELT_LINKS } from '../beltLinks';

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
 * Draw a chalk chevron pointing along `(fx, fy)` (unit vector), centred at `(cx, cy)`.
 * `seed` gives each one its own hand: unequal arms, a tilt, the tip a little off, and the
 * second arm not quite starting where the first one ended. Thousands are drawn every frame:
 * straight segments, and all the randomness from one hash.
 */
function chevron(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  fx: number,
  fy: number,
  size: number,
  seed = 0,
): void {
  const h = tileSeed(seed, 11);
  const r1 = (h & 255) / 255;
  const r2 = ((h >>> 8) & 255) / 255;
  const r3 = ((h >>> 16) & 255) / 255;
  const r4 = (h >>> 24) / 255;
  const tilt = (r1 - 0.5) * 0.45;
  const px = -fy + fx * tilt;
  const py = fx + fy * tilt;
  const back = size * (0.45 + r2 * 0.2);
  const tipX = cx + fx * back * 0.6 + px * (r3 - 0.5) * size * 0.2;
  const tipY = cy + fy * back * 0.6 + py * (r3 - 0.5) * size * 0.2;
  const armA = size * (0.8 + r4 * 0.35);
  const armB = size * (0.8 + r2 * 0.35);
  const backB = back * (0.85 + r1 * 0.3);
  ctx.moveTo(cx - fx * back + px * armA, cy - fy * back + py * armA);
  ctx.lineTo(tipX, tipY);
  ctx.lineTo(cx - fx * backB - px * armB, cy - fy * backB - py * armB);
}

/**
 * Belt rails in chalk (DECISIONS: "Tableau noir"): each chain of belts (see beltChains.ts)
 * gets two rails, each one continuous stroke in two passes. Where a belt joins another from
 * the side, that piece of rail is rubbed out; against a building, a chalk threshold closes
 * the rails; a loose end is closed by a rounded stroke (BELT_SHAPE.cap). Every wobble is
 * derived from world positions, so cached regions drawn separately meet without a seam.
 */
function drawRails(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  list: readonly Belt[],
  inputsOf: InputsOf,
  links: BeltLinks,
): void {
  const s = cam.scale;
  const K = BELT_SHAPE.band;
  const radius = turnRadius();
  const { chains, gaps } = beltChains(list, inputsOf, links);
  ctx.save();
  ctx.strokeStyle = BELT_COLORS.line;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const chain of chains) {
    for (const side of [1, -1] as const) {
      for (let pass = 0; pass < 2; pass++) {
        const nodes = railNodes(
          chain.points,
          side,
          radius,
          (p) =>
            (hash01(Math.round(p.x * 8) + side * 7 + pass * 3, Math.round(p.y * 8) - pass * 5) -
              0.5) *
            (pass ? 0.1 : 0.06),
        );
        ctx.lineWidth = Math.max(1, (pass ? 0.03 : 0.055) * s);
        ctx.globalAlpha = pass ? 0.45 : 0.9;
        ctx.beginPath();
        const first = cam.worldToScreen((nodes[0] as RailNode).x, (nodes[0] as RailNode).y);
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < nodes.length - 1; i++) {
          const n = nodes[i] as RailNode;
          const m = nodes[i + 1] as RailNode;
          const p = cam.worldToScreen(n.x, n.y);
          const q = cam.worldToScreen(m.x, m.y);
          // A corner keeps its radius; elsewhere the stroke flows through the midpoints.
          if (n.r !== undefined) ctx.arcTo(p.x, p.y, q.x, q.y, n.r * s);
          else if (m.r !== undefined) ctx.lineTo(p.x, p.y);
          else ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
        }
        const last = nodes[nodes.length - 1] as RailNode;
        const l = cam.worldToScreen(last.x, last.y);
        ctx.lineTo(l.x, l.y);
        ctx.stroke();
      }
    }
  }

  // Rub out the rail where a belt joins from the side or a branch leaves.
  ctx.globalAlpha = 1;
  ctx.fillStyle = COLORS.background;
  for (const g of gaps) {
    const cx = g.x + 0.5 + DX[g.d] * K;
    const cy = g.y + 0.5 + DY[g.d] * K;
    const hw = DY[g.d] ? K * 0.8 : 0.1;
    const hh = DX[g.d] ? K * 0.8 : 0.1;
    const p = cam.worldToScreen(cx - hw, cy - hh);
    ctx.fillRect(p.x, p.y, 2 * hw * s, 2 * hh * s);
  }

  // Ends against a building (threshold) or against nothing (rounded cap).
  for (const chain of chains) {
    for (const end of [chain.start, chain.end]) {
      if (end.kind !== 'door' && end.kind !== 'loose') continue;
      const px = -DY[end.d];
      const py = DX[end.d];
      const a = cam.worldToScreen(end.x + px * K, end.y + py * K);
      const b = cam.worldToScreen(end.x - px * K, end.y - py * K);
      const seed = tileSeed(Math.round(end.x * 4), Math.round(end.y * 4));
      if (end.kind === 'door') {
        chalkLine(ctx, a.x, a.y, b.x, b.y, seed, CHALK.threshold, Math.max(1, 0.06 * s));
      } else {
        const bulge = 2 * K * BELT_SHAPE.cap;
        const c = cam.worldToScreen(end.x + DX[end.d] * bulge, end.y + DY[end.d] * bulge);
        chalkCurve(ctx, a.x, a.y, c.x, c.y, b.x, b.y, seed, CHALK.rail, Math.max(1, 0.055 * s));
      }
    }
  }
  ctx.restore();
}

/** Sides a belt is joined on: its outputs, its inputs, and straight behind when unfed. */
function joints(b: Belt, inputs: number): number {
  return b.outputs | inputs;
}

/**
 * Belts layer (PLAN §10.2 layer 3): two chalk rails joining each belt to what feeds it and
 * to where it leads, with tight turns, and chalk chevrons animated along the flow (they
 * follow the curve in a turn). `phase` ∈ [0, 1) scrolls with time × belt speed. `part`
 * draws only the static rails or only the chevrons (below zoom 0.3 belts are plain lines
 * and count as base). `inputsOf` tells which sides feed each belt, `links` where belts meet
 * buildings.
 */
export function drawBelts(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  belts: Iterable<Belt>,
  phase: number,
  part: 'all' | 'base' | 'chevrons' = 'all',
  inputsOf: InputsOf = straightInputs,
  links: BeltLinks = NO_BELT_LINKS,
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

  if (part !== 'chevrons') drawRails(ctx, cam, list, inputsOf, links);

  if (part === 'base') return;

  const animated = cam.zoom >= LOD.full;
  ctx.strokeStyle = BELT_COLORS.chevron;
  ctx.lineWidth = Math.max(1, 0.1 * s);
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
        chevron(ctx, p.x + c.x * s, p.y + c.y * s, c.fx, c.fy, size, tileSeed(b.x * 2 + i, b.y));
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
          chevron(
            ctx,
            cx + DX[d] * off * s,
            cy + DY[d] * off * s,
            DX[d],
            DY[d],
            size,
            tileSeed(b.x * 2 + i, b.y),
          );
        }
      } else {
        // One chevron on the half tile toward each output.
        const t = animated ? 0.15 + (phase % 1) * 0.25 : 0.27;
        chevron(
          ctx,
          cx + DX[d] * t * s,
          cy + DY[d] * t * s,
          DX[d],
          DY[d],
          size * 0.9,
          tileSeed(b.x, b.y * 2 + d),
        );
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
