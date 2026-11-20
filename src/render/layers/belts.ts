import { BELT_COLORS, COLORS } from '../../config/colors';
import { DIRS, type Dir, DX, DY } from '../../core/grid';
import { type Belt, hasOutput } from '../../sim/entities';
import type { Camera } from '../camera';
import { LOD } from '../lod';
import { hash01, tileSeed } from '../chalk';

/**
 * Draw a chalk chevron pointing along `d`, centred at `(cx, cy)`. `seed` gives each one its
 * own hand: unequal arms, slightly bent, tilted, with the tip a little off.
 */
function chevron(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  d: Dir,
  size: number,
  seed = 0,
): void {
  const r1 = hash01(seed, 11);
  const r2 = hash01(seed, 23);
  const r3 = hash01(seed, 37);
  const r4 = hash01(seed, 41);
  const fx = DX[d];
  const fy = DY[d];
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

/**
 * Draft "tableau noir": belts as continuous hand-drawn rails. Belts are joined into chains
 * (each belt followed by the belt it feeds, as long as that one has no other feeder, or is
 * fed straight on), and each rail of a chain is a single smoothed stroke over its whole
 * length, so corners come out rounded. A chain that merges into another belt stops against
 * its rail; one leaving a splitter starts from it. Every wobble is derived from world
 * positions, so cached regions drawn separately meet without a seam.
 */
function drawRails(ctx: CanvasRenderingContext2D, cam: Camera, list: Belt[]): void {
  const s = cam.scale;
  const K = 0.38;
  const key = (x: number, y: number): number => x * 1_000_003 + y;
  const byPos = new Map<number, Belt>();
  for (const b of list) byPos.set(key(b.x, b.y), b);
  const outs = (b: Belt): Dir[] => DIRS.filter((d) => hasOutput(b, d));
  const target = (b: Belt, d: Dir): Belt | undefined => byPos.get(key(b.x + DX[d], b.y + DY[d]));
  const feeders = new Map<Belt, Belt[]>();
  for (const b of list) {
    for (const d of outs(b)) {
      const t = target(b, d);
      if (t) feeders.set(t, [...(feeders.get(t) ?? []), b]);
    }
  }
  // Link b → next.
  const next = new Map<Belt, Belt>();
  const linked = new Set<Belt>();
  for (const b of list) {
    const o = outs(b);
    const d = o[0];
    if (o.length !== 1 || d === undefined) continue;
    const t = target(b, d);
    if (!t) continue;
    const f = feeders.get(t) ?? [];
    const straightOn = outs(t).length === 1 && outs(t)[0] === d;
    if (f.length === 1 || straightOn) {
      next.set(b, t);
      linked.add(t);
    }
  }

  // Splitters: the chain goes straight on, side branches start from its rail.
  for (const b of list) {
    if (outs(b).length < 2) continue;
    const f = (feeders.get(b) ?? []).find((x) => next.get(x) === b);
    if (!f) continue;
    const d = DIRS.find((x) => DX[x] === b.x - f.x && DY[x] === b.y - f.y);
    if (d === undefined || !hasOutput(b, d)) continue;
    const t = target(b, d);
    if (t && !linked.has(t)) {
      next.set(b, t);
      linked.add(t);
    }
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
  ctx.save();
  ctx.strokeStyle = BELT_COLORS.line;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const chain of chains) {
    const head = chain[0] as Belt;
    const tail = chain[chain.length - 1] as Belt;
    const pts: Pt[] = chain.map(centre);
    // Start: from the feeder (a splitter, or a belt merging here) or from the tile edge.
    const hd = outs(head)[0] ?? 0;
    const feeder = feeders.get(head)?.find((f) => next.get(f) !== head);
    if (feeder) {
      const c = centre(feeder);
      const dx = head.x - feeder.x;
      const dy = head.y - feeder.y;
      pts.unshift({ x: c.x + dx * K, y: c.y + dy * K });
    } else pts.unshift({ x: head.x + 0.5 - DX[hd] * 0.5, y: head.y + 0.5 - DY[hd] * 0.5 });
    // End: against the rail of the belt it merges into, or at the tile edge.
    const to = outs(tail);
    const td = to[0];
    if (to.length === 1 && td !== undefined) {
      const t = target(tail, td);
      const c = centre(tail);
      if (t && next.get(tail) !== t)
        pts.push({ x: c.x + DX[td] * (1 - K), y: c.y + DY[td] * (1 - K) });
      else if (!t) pts.push({ x: c.x + DX[td] * 0.5, y: c.y + DY[td] * 0.5 });
    } else if (to.length > 1) {
      // A splitter: the chain stops in the middle, its branches start from there.
      const prev = pts[pts.length - 2];
      const c = centre(tail);
      if (prev) pts[pts.length - 1] = { x: (prev.x + c.x) / 2, y: (prev.y + c.y) / 2 };
    }
    for (const side of [1, -1]) {
      for (let pass = 0; pass < 2; pass++) {
        const rail: Pt[] = [];
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i] as Pt;
          const a = pts[Math.max(0, i - 1)] as Pt;
          const c = pts[Math.min(pts.length - 1, i + 1)] as Pt;
          let tx = c.x - a.x;
          let ty = c.y - a.y;
          const tl = Math.hypot(tx, ty) || 1;
          tx /= tl;
          ty /= tl;
          // Miter: keep the rail at distance K from both segments at a corner.
          const sx = (p.x - a.x || c.x - p.x) * 1;
          const sy = (p.y - a.y || c.y - p.y) * 1;
          const sl = Math.hypot(sx, sy) || 1;
          const cos = Math.max(0.5, Math.abs((sx / sl) * tx + (sy / sl) * ty));
          const w =
            (hash01(Math.round(p.x * 8) + side * 7 + pass * 3, Math.round(p.y * 8) - pass * 5) -
              0.5) *
            (pass ? 0.12 : 0.08);
          const off = (K * side) / cos + w;
          rail.push(cam.worldToScreen(p.x - ty * off, p.y + tx * off));
        }
        ctx.lineWidth = Math.max(1, (pass ? 0.03 : 0.055) * s);
        ctx.globalAlpha = pass ? 0.45 : 0.9;
        ctx.beginPath();
        const first = rail[0] as Pt;
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < rail.length - 1; i++) {
          const p = rail[i] as Pt;
          const q = rail[i + 1] as Pt;
          ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
        }
        const last = rail[rail.length - 1] as Pt;
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
      const d = DIRS.find((x) => DX[x] === f.x - b.x && DY[x] === f.y - b.y);
      if (d !== undefined && !(outs(b).length === 1 && outs(b)[0] === d)) gap(b, d);
    }
    if (outs(b).length > 1) {
      for (const d of outs(b)) {
        const t = target(b, d);
        if (t && next.get(b) !== t) gap(b, d);
      }
    }
  }
  ctx.restore();
}

/**
 * Belts layer (PLAN §10.2 layer 3): tile base plus chevrons animated along each output.
 * `phase` ∈ [0, 1) scrolls with time × belt speed. `part` draws only the static tile bases
 * or only the chevrons (below zoom 0.3 belts are plain lines and count as base).
 */
export function drawBelts(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  belts: Iterable<Belt>,
  phase: number,
  part: 'all' | 'base' | 'chevrons' = 'all',
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
      const c = cam.worldToScreen(b.x + 0.5, b.y + 0.5);
      for (const d of DIRS) {
        if (!hasOutput(b, d)) continue;
        ctx.moveTo(c.x - DX[d] * 0.5 * s, c.y - DY[d] * 0.5 * s);
        ctx.lineTo(c.x + DX[d] * 0.5 * s, c.y + DY[d] * 0.5 * s);
      }
    }
    ctx.stroke();
    return;
  }

  if (part !== 'chevrons') drawRails(ctx, cam, list);

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
    const c0 = cam.worldToScreen(b.x + 0.5, b.y + 0.5);
    const wob = (hash01(b.x, b.y) - 0.5) * 0.1 * s;
    const c = { x: c0.x + wob, y: c0.y - wob };
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
            c.x + DX[d] * off * s,
            c.y + DY[d] * off * s,
            d,
            size,
            tileSeed(b.x * 2 + i, b.y),
          );
        }
      } else {
        // One chevron on the half tile toward each output.
        const t = animated ? 0.15 + (phase % 1) * 0.25 : 0.27;
        chevron(
          ctx,
          c.x + DX[d] * t * s,
          c.y + DY[d] * t * s,
          d,
          size * 0.9,
          tileSeed(b.x, b.y * 2 + d),
        );
      }
    }
  }
  ctx.stroke();
}
