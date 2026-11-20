import { BELT_COLORS, BELT_SHAPE, COLORS } from '../../config/colors';
import { DIRS, type Dir, DX, DY, opposite } from '../../core/grid';
import { axisOf, type Belt, hasOutput } from '../../sim/entities';
import type { Camera } from '../camera';
import { LOD } from '../lod';
import { chalkLine, hash01, tileSeed } from '../chalk';
import { type BuildingLinks, NO_BUILDING_LINKS } from '../beltLinks';

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
 * `seed` gives each one its own hand: unequal arms, slightly bent, tilted, tip a little off.
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
  const r1 = hash01(seed, 11);
  const r2 = hash01(seed, 23);
  const r3 = hash01(seed, 37);
  const r4 = hash01(seed, 41);
  const tilt = (r1 - 0.5) * 0.45;
  const px = -fy + fx * tilt;
  const py = fx + fy * tilt;
  const back = size * (0.45 + r2 * 0.2);
  const tipX = cx + fx * back * 0.6 + px * (r3 - 0.5) * size * 0.2;
  const tipY = cy + fy * back * 0.6 + py * (r3 - 0.5) * size * 0.2;
  const armA = size * (0.8 + r4 * 0.35);
  const armB = size * (0.8 + r2 * 0.35);
  const ax = cx - fx * back + px * armA;
  const ay = cy - fy * back + py * armA;
  const bx = cx - fx * back * (0.85 + r1 * 0.3) - px * armB;
  const by = cy - fy * back * (0.85 + r1 * 0.3) - py * armB;
  const bend = (r3 - 0.5) * size * 0.35;
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo((ax + tipX) / 2 + fx * bend, (ay + tipY) / 2 + fy * bend, tipX, tipY);
  // The pen does not quite start the second arm where the first one ended.
  ctx.moveTo(tipX - fx * size * 0.06, tipY - fy * size * 0.06);
  ctx.quadraticCurveTo((bx + tipX) / 2 - fx * bend, (by + tipY) / 2 - fy * bend, bx, by);
}

type Pt = { x: number; y: number };
/** A rail node: a point the stroke passes through, or a corner rounded with radius `r`. */
type Node = Pt & { r?: number };

/**
 * Draft "tableau noir": belts as continuous hand-drawn chalk rails. Belts are joined into
 * chains (each belt followed by the belt it feeds, if that one has no other feeder or is fed
 * straight on, and straight on through splitters), and each rail of a chain is one stroke
 * over its whole length. Corners keep the tight radius of BELT_SHAPE (outer rail
 * `turnRadius + band`, inner rail almost square). A chain merging into another belt stops
 * against its rail, a branch leaving a splitter starts from it, and the rail is rubbed out
 * where they join. Where a belt meets a building, a chalk threshold closes the rails and a
 * yellow arrow tells whether it goes in or out. Every wobble comes from world positions, so
 * cached regions drawn separately meet without a seam.
 */
function drawRails(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  list: Belt[],
  inputsOf: InputsOf,
  links: BuildingLinks,
): void {
  const s = cam.scale;
  const K = BELT_SHAPE.band;
  const rTurn = turnRadius();
  const key = (x: number, y: number): number => x * 1_000_003 + y;
  const byPos = new Map<number, Belt>();
  for (const b of list) byPos.set(key(b.x, b.y), b);
  const outs = (b: Belt): Dir[] => DIRS.filter((d) => hasOutput(b, d));
  const target = (b: Belt, d: Dir): Belt | undefined => byPos.get(key(b.x + DX[d], b.y + DY[d]));
  const dirTo = (a: Belt, b: Belt): Dir | undefined =>
    DIRS.find((d) => DX[d] === b.x - a.x && DY[d] === b.y - a.y);
  const feeders = new Map<Belt, Belt[]>();
  for (const b of list) {
    for (const d of outs(b)) {
      const t = target(b, d);
      if (t) feeders.set(t, [...(feeders.get(t) ?? []), b]);
    }
  }
  const next = new Map<Belt, Belt>();
  const linked = new Set<Belt>();
  const link = (b: Belt, t: Belt): void => {
    next.set(b, t);
    linked.add(t);
  };
  for (const b of list) {
    const o = outs(b);
    const d = o[0];
    if (o.length !== 1 || d === undefined) continue;
    const t = target(b, d);
    if (!t) continue;
    const straightOn = outs(t).length === 1 && outs(t)[0] === d;
    if ((feeders.get(t) ?? []).length === 1 || straightOn) link(b, t);
  }
  // Splitters: the chain goes straight on; side branches start from its rail.
  for (const b of list) {
    if (outs(b).length < 2) continue;
    const f = (feeders.get(b) ?? []).find((x) => next.get(x) === b);
    const d = f && dirTo(f, b);
    if (d === undefined || !hasOutput(b, d)) continue;
    const t = target(b, d);
    if (t && !linked.has(t)) link(b, t);
  }

  const seen = new Set<Belt>();
  const chains: Belt[][] = [];
  const walk = (start: Belt): void => {
    const chain: Belt[] = [];
    for (let b: Belt | undefined = start; b && !seen.has(b); b = next.get(b)) {
      seen.add(b);
      chain.push(b);
    }
    if (chain.length) chains.push(chain);
  };
  for (const b of list) if (!linked.has(b)) walk(b);
  for (const b of list) if (!seen.has(b)) walk(b); // loops

  const centre = (b: Belt): Pt => ({ x: b.x + 0.5, y: b.y + 0.5 });
  const doors: { x: number; y: number; d: Dir; out: boolean }[] = [];
  ctx.save();
  ctx.strokeStyle = BELT_COLORS.line;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const chain of chains) {
    const head = chain[0] as Belt;
    const tail = chain[chain.length - 1] as Belt;
    const pts: Pt[] = chain.map(centre);
    // Start: from the rail of a feeding splitter or junction, else the side it is fed from.
    const feeder = feeders.get(head)?.find((f) => next.get(f) !== head);
    const fd = feeder && dirTo(feeder, head);
    const h = centre(head);
    if (feeder && fd !== undefined) {
      const c = centre(feeder);
      pts.unshift({ x: c.x + DX[fd] * K, y: c.y + DY[fd] * K });
    } else {
      const fromMask = inputsOf(head);
      const side = DIRS.find((d) => fromMask & (1 << d)) ?? opposite(outs(head)[0] ?? 0);
      pts.unshift({ x: h.x + DX[side] * 0.5, y: h.y + DY[side] * 0.5 });
      if (links.from(head) & (1 << side))
        doors.push({
          x: h.x + DX[side] * 0.5,
          y: h.y + DY[side] * 0.5,
          d: opposite(side),
          out: true,
        });
    }
    // End: against the rail of the belt it merges into, else at the tile edge.
    const to = outs(tail);
    const td = to[0];
    const c = centre(tail);
    if (to.length === 1 && td !== undefined) {
      const t = target(tail, td);
      if (t && next.get(tail) !== t)
        pts.push({ x: c.x + DX[td] * (1 - K), y: c.y + DY[td] * (1 - K) });
      else if (!t) {
        pts.push({ x: c.x + DX[td] * 0.5, y: c.y + DY[td] * 0.5 });
        if (links.into(tail) & (1 << td))
          doors.push({ x: c.x + DX[td] * 0.5, y: c.y + DY[td] * 0.5, d: td, out: false });
      }
    }
    for (const sideSign of [1, -1]) {
      for (let pass = 0; pass < 2; pass++) {
        const nodes: Node[] = [];
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i] as Pt;
          const a = pts[i - 1];
          const n = pts[i + 1];
          const unit = (u: Pt, v: Pt): Pt => {
            const l = Math.hypot(v.x - u.x, v.y - u.y) || 1;
            return { x: (v.x - u.x) / l, y: (v.y - u.y) / l };
          };
          const tin = a ? unit(a, p) : n ? unit(p, n) : { x: 1, y: 0 };
          const tout = n ? unit(p, n) : tin;
          const w =
            (hash01(Math.round(p.x * 8) + sideSign * 7 + pass * 3, Math.round(p.y * 8) - pass * 5) -
              0.5) *
            (pass ? 0.1 : 0.06);
          const turn = Math.abs(tin.x * tout.y - tin.y * tout.x) > 0.5;
          if (turn) {
            // Mitre point at distance K from both legs; outer rail rounder than inner.
            const ox = (-tin.y - tout.y) * K * sideSign;
            const oy = (tin.x + tout.x) * K * sideSign;
            const outer = ox * tout.x + oy * tout.y < 0;
            nodes.push({
              x: p.x + ox,
              y: p.y + oy,
              r: outer ? rTurn + K : Math.max(0.04, rTurn - K + 0.06),
            });
          } else {
            const off = K * sideSign + w;
            nodes.push({ x: p.x - tin.y * off, y: p.y + tin.x * off });
          }
        }
        const sp = nodes.map((q) => ({ ...cam.worldToScreen(q.x, q.y), r: q.r }));
        ctx.lineWidth = Math.max(1, (pass ? 0.03 : 0.055) * s);
        ctx.globalAlpha = pass ? 0.45 : 0.9;
        ctx.beginPath();
        const first = sp[0] as Node;
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < sp.length - 1; i++) {
          const p = sp[i] as Node;
          const q = sp[i + 1] as Node;
          if (p.r !== undefined) ctx.arcTo(p.x, p.y, q.x, q.y, p.r * s);
          else if (q.r !== undefined) ctx.lineTo(p.x, p.y);
          else ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
        }
        const last = sp[sp.length - 1] as Node;
        ctx.lineTo(last.x, last.y);
        ctx.stroke();
      }
    }
  }

  // Where a belt joins or leaves from the side, rub out that piece of the rail.
  ctx.globalAlpha = 1;
  ctx.fillStyle = COLORS.background;
  const gap = (b: Belt, d: Dir): void => {
    const cx = b.x + 0.5 + DX[d] * K;
    const cy = b.y + 0.5 + DY[d] * K;
    const along = K * 0.8;
    const across = 0.1;
    const p = cam.worldToScreen(cx - (DY[d] ? along : across), cy - (DX[d] ? along : across));
    ctx.fillRect(p.x, p.y, 2 * (DY[d] ? along : across) * s, 2 * (DX[d] ? along : across) * s);
  };
  for (const b of list) {
    for (const f of feeders.get(b) ?? []) {
      if (next.get(f) === b) continue;
      const d = dirTo(b, f);
      if (d !== undefined && !(outs(b).length === 1 && outs(b)[0] === d)) gap(b, d);
    }
    if (outs(b).length > 1) {
      for (const d of outs(b)) {
        const t = target(b, d);
        if (t && next.get(b) !== t) gap(b, d);
      }
    }
  }

  // Doorways: a threshold across the rails and a yellow arrow, in or out of the building.
  for (const door of doors) {
    const px = -DY[door.d];
    const py = DX[door.d];
    const a = cam.worldToScreen(door.x + px * K, door.y + py * K);
    const b = cam.worldToScreen(door.x - px * K, door.y - py * K);
    const seed = tileSeed(Math.round(door.x * 4), Math.round(door.y * 4));
    chalkLine(ctx, a.x, a.y, b.x, b.y, seed, 'rgba(242, 239, 230, 0.85)', Math.max(1, 0.06 * s));
    const at = door.out ? 0.22 : -0.2;
    const c = cam.worldToScreen(door.x + DX[door.d] * at, door.y + DY[door.d] * at);
    ctx.strokeStyle = '#f3e08a';
    ctx.lineWidth = Math.max(1.5, 0.09 * s);
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    chevron(ctx, c.x, c.y, DX[door.d], DY[door.d], 0.24 * s, seed);
    const tail = cam.worldToScreen(
      door.x + DX[door.d] * (at - 0.3),
      door.y + DY[door.d] * (at - 0.3),
    );
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(c.x + DX[door.d] * 0.08 * s, c.y + DY[door.d] * 0.08 * s);
    ctx.stroke();
  }
  ctx.restore();
}

/** Sides a belt is joined on: its outputs, its inputs, and straight behind when unfed. */
function joints(b: Belt, inputs: number): number {
  return b.outputs | inputs;
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
  links: BuildingLinks = NO_BUILDING_LINKS,
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
  ctx.lineWidth = Math.max(1, 0.11 * s);
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
