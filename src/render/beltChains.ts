import { BELT_SHAPE } from '../config/colors';
import { DIRS, type Dir, DX, DY, opposite } from '../core/grid';
import { type Belt, hasOutput } from '../sim/entities';
import type { BeltLinks } from './beltLinks';

/**
 * Belts drawn as continuous chalk rails (DECISIONS: "Tableau noir"): the geometry, without
 * any drawing, so it can be tested.
 *
 * Belts are joined into chains: a belt is followed by the belt it feeds when that one has no
 * other feeder or is fed straight on, and a splitter carries on straight ahead. Each rail of
 * a chain is then one stroke over its whole length. A chain merging into another belt stops
 * against that belt's rail, a branch leaving a splitter starts from it, and the piece of rail
 * between them is rubbed out (a gap).
 */

export interface Pt {
  x: number;
  y: number;
}

/**
 * How a chain starts or ends, at `(x, y)` (world tiles) facing `d` (outward):
 * - `rail`: against the rail of another belt (merge, or branch of a splitter);
 * - `door`: against a building that feeds it or that it feeds (a chalk threshold);
 * - `loose`: nothing there (the rails are closed by a rounded stroke);
 * - `open`: something drawn elsewhere carries on (a bridge lane, or a belt off this list).
 */
export interface ChainEnd extends Pt {
  kind: 'rail' | 'door' | 'loose' | 'open';
  d: Dir;
}

export interface BeltChain {
  belts: Belt[];
  /** Centre line, world tiles: the start point, every belt centre, the end point. */
  points: Pt[];
  start: ChainEnd;
  end: ChainEnd;
}

/** A piece of the rail of belt `(x, y)` on side `d` to rub out, where another belt joins. */
export interface RailGap {
  x: number;
  y: number;
  d: Dir;
}

const key = (x: number, y: number): number => x * 1_000_003 + y;

function outputsOf(b: Belt): Dir[] {
  return DIRS.filter((d) => hasOutput(b, d));
}

function dirBetween(a: Pt, b: Pt): Dir | undefined {
  return DIRS.find((d) => DX[d] === b.x - a.x && DY[d] === b.y - a.y);
}

/**
 * Chains and gaps for a list of belts. `inputsOf` gives the sides feeding each belt
 * (bit d = side d), `links` where it meets buildings and whether its outputs lead on.
 */
export function beltChains(
  list: readonly Belt[],
  inputsOf: (b: Belt) => number,
  links: BeltLinks,
): { chains: BeltChain[]; gaps: RailGap[] } {
  const K = BELT_SHAPE.band;
  const byPos = new Map<number, Belt>();
  for (const b of list) byPos.set(key(b.x, b.y), b);
  const outs = new Map<Belt, Dir[]>();
  for (const b of list) outs.set(b, outputsOf(b));
  const outOf = (b: Belt): Dir[] => outs.get(b) ?? [];
  const target = (b: Belt, d: Dir): Belt | undefined => byPos.get(key(b.x + DX[d], b.y + DY[d]));

  const feeders = new Map<Belt, Belt[]>();
  for (const b of list) {
    for (const d of outOf(b)) {
      const t = target(b, d);
      if (!t) continue;
      const f = feeders.get(t);
      if (f) f.push(b);
      else feeders.set(t, [b]);
    }
  }

  const next = new Map<Belt, Belt>();
  const linked = new Set<Belt>();
  for (const b of list) {
    const o = outOf(b);
    const d = o[0];
    if (o.length !== 1 || d === undefined) continue;
    const t = target(b, d);
    if (!t) continue;
    const straightOn = outOf(t).length === 1 && outOf(t)[0] === d;
    if ((feeders.get(t) ?? []).length === 1 || straightOn) {
      next.set(b, t);
      linked.add(t);
    }
  }
  // Splitters: the chain carries on straight ahead.
  for (const b of list) {
    if (outOf(b).length < 2) continue;
    const f = (feeders.get(b) ?? []).find((x) => next.get(x) === b);
    const d = f && dirBetween(f, b);
    if (d === undefined || !hasOutput(b, d)) continue;
    const t = target(b, d);
    if (t && !linked.has(t)) {
      next.set(b, t);
      linked.add(t);
    }
  }

  const seen = new Set<Belt>();
  const runs: Belt[][] = [];
  const walk = (start: Belt): void => {
    const run: Belt[] = [];
    for (let b: Belt | undefined = start; b && !seen.has(b); b = next.get(b)) {
      seen.add(b);
      run.push(b);
    }
    if (run.length) runs.push(run);
  };
  for (const b of list) if (!linked.has(b)) walk(b);
  for (const b of list) if (!seen.has(b)) walk(b); // closed loops

  const centre = (b: Belt): Pt => ({ x: b.x + 0.5, y: b.y + 0.5 });
  const chains: BeltChain[] = [];
  /** The belt a chain starts from, when it starts from another belt's rail. */
  const startFeeder = new Map<Belt, Belt>();
  for (const run of runs) {
    const head = run[0] as Belt;
    const tail = run[run.length - 1] as Belt;
    const points = run.map(centre);
    const h = centre(head);

    // Start: from the rail of a feeding splitter or junction, else the side it is fed from.
    let start: ChainEnd;
    const feeder = feeders.get(head)?.find((f) => next.get(f) !== head);
    const fd = feeder && dirBetween(feeder, head);
    if (feeder && fd !== undefined) {
      startFeeder.set(head, feeder);
      const c = centre(feeder);
      start = { x: c.x + DX[fd] * K, y: c.y + DY[fd] * K, d: opposite(fd), kind: 'rail' };
    } else {
      const fed = inputsOf(head);
      const side = DIRS.find((d) => fed & (1 << d)) ?? opposite(outOf(head)[0] ?? 0);
      const kind = links.from(head) & (1 << side) ? 'door' : fed ? 'open' : 'loose';
      start = { x: h.x + DX[side] * 0.5, y: h.y + DY[side] * 0.5, d: side, kind };
    }

    // End: against the rail of the belt it merges into, else at the tile edge.
    const c = centre(tail);
    const to = outOf(tail);
    const td = to[0];
    let end: ChainEnd;
    if (to.length === 1 && td !== undefined) {
      const t = target(tail, td);
      if (t && next.get(tail) !== t) {
        end = { x: c.x + DX[td] * (1 - K), y: c.y + DY[td] * (1 - K), d: td, kind: 'rail' };
      } else {
        // Into a building, on into something drawn elsewhere (a closed loop, a bridge
        // lane), or nowhere.
        const kind =
          links.into(tail) & (1 << td)
            ? 'door'
            : t !== undefined || links.leads(tail) & (1 << td)
              ? 'open'
              : 'loose';
        end = { x: c.x + DX[td] * 0.5, y: c.y + DY[td] * 0.5, d: td, kind };
      }
    } else {
      // A splitter with no straight continuation, or a dead end with no output: the rails
      // stop at the centre and the branches start from there.
      end = { ...c, d: td ?? 0, kind: 'open' };
    }
    chains.push({
      belts: run,
      points: [{ x: start.x, y: start.y }, ...points, { x: end.x, y: end.y }],
      start,
      end,
    });
  }

  // Rub out the rail where a belt joins from the side or a branch leaves.
  const gaps: RailGap[] = [];
  for (const b of list) {
    for (const f of feeders.get(b) ?? []) {
      if (next.get(f) === b || startFeeder.get(b) === f) continue;
      const d = dirBetween(b, f);
      const o = outOf(b);
      if (d !== undefined && !(o.length === 1 && o[0] === d)) gaps.push({ x: b.x, y: b.y, d });
    }
    if (outOf(b).length > 1) {
      for (const d of outOf(b)) {
        const t = target(b, d);
        if (t && next.get(b) !== t) gaps.push({ x: b.x, y: b.y, d });
      }
    }
  }
  return { chains, gaps };
}

/** A rail node: a point the stroke passes through, or a corner rounded with radius `r`. */
export interface RailNode extends Pt {
  r?: number;
}

/**
 * One rail of a chain (`side` 1 or -1: left or right of the centre line), world tiles. At a
 * quarter turn the node is the mitre point, at distance `band` from both legs, with the
 * radius to round it: the outer rail follows BELT_SHAPE.corner, the inner one is almost
 * square. `wobble(p)` shifts a straight node across the line, to look drawn by hand.
 */
export function railNodes(
  points: readonly Pt[],
  side: 1 | -1,
  turnRadius: number,
  wobble: (p: Pt) => number = () => 0,
): RailNode[] {
  const K = BELT_SHAPE.band;
  const nodes: RailNode[] = [];
  const unit = (u: Pt, v: Pt): Pt => {
    const l = Math.hypot(v.x - u.x, v.y - u.y) || 1;
    return { x: (v.x - u.x) / l, y: (v.y - u.y) / l };
  };
  for (let i = 0; i < points.length; i++) {
    const p = points[i] as Pt;
    const a = points[i - 1];
    const n = points[i + 1];
    const tin = a ? unit(a, p) : n ? unit(p, n) : { x: 1, y: 0 };
    const tout = n ? unit(p, n) : tin;
    if (Math.abs(tin.x * tout.y - tin.y * tout.x) > 0.5) {
      const ox = (-tin.y - tout.y) * K * side;
      const oy = (tin.x + tout.x) * K * side;
      const outer = ox * tout.x + oy * tout.y < 0;
      nodes.push({
        x: p.x + ox,
        y: p.y + oy,
        r: outer ? turnRadius + K : Math.max(0.04, turnRadius - K + 0.06),
      });
    } else {
      const off = K * side + wobble(p);
      nodes.push({ x: p.x - tin.y * off, y: p.y + tin.x * off });
    }
  }
  return nodes;
}
