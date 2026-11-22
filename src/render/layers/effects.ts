import type { Rect } from '../../build/area';
import type { ToolEvents } from '../../build/tools';
import type { Footprint } from '../../build/touched';
import { BUILDING_COLORS, CHALK, EDITION_COLORS } from '../../config/colors';
import { EFFECTS } from '../../config/effects';
import type { Camera } from '../camera';
import { chalkStroke, hash01, rng, shade, tileSeed } from '../chalk';
import { itemColor } from '../itemColor';

/**
 * Chalk effects of the player's actions (DECISIONS "Effets craie"): a sponge wiped over
 * what is demolished, a puff of chalk dust around what is built. Rendering only: they are
 * driven by real time (`nowMs`, the clock of `Renderer.draw`), drawn over the cached layers
 * every frame while they live, and never touch the world or the caches.
 *
 * Every random choice comes from a seed taken from the map position (`tileSeed`), and the
 * motion is a closed formula of the age: an effect looks the same whatever the frame rate.
 */

/** One straight stroke of the sponge, in tiles. */
interface Leg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  len: number;
}

/** Sponge path: strokes one after the other, and the sponge width (tiles). */
export interface SpongePath {
  width: number;
  legs: Leg[];
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Sponge {
  kind: 'sponge';
  start: number;
  passMs: number;
  holdMs: number;
  lifeMs: number;
  path: SpongePath;
  total: number;
  seed: number;
  box: Box;
}

interface Puff {
  kind: 'dust';
  start: number;
  x: number;
  y: number;
  w: number;
  h: number;
  grains: number;
  clouds: number;
  /** Chalk of the tinted grains (the building's colour, lightened), or none. */
  tint: string | null;
  seed: number;
  box: Box;
}

type Effect = Sponge | Puff;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Seed of a rectangle of the map: the same footprint always gets the same strokes. */
function rectSeed(x: number, y: number, w: number, h: number): number {
  return tileSeed(x, y) ^ Math.imul(w, 0x27d4eb2d) ^ Math.imul(h, 0x165667b1);
}

/**
 * The sponge's path over a rectangle (tiles, `x, y` top-left, `w × h`). `object`: a short
 * zigzag, one or two back and forths along the long side. `zone`: strokes that cross the
 * whole zone, rows overlapping, so that the zone is wiped in a few large gestures.
 */
export function spongePath(
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
  mode: 'object' | 'zone',
): SpongePath {
  const r = rng(seed);
  const horizontal = w === h ? r() < 0.5 : w > h;
  const long = horizontal ? w : h;
  const cross = horizontal ? h : w;
  let width: number;
  let legs: number;
  if (mode === 'object') {
    const o = EFFECTS.sponge;
    width = clamp(cross * o.widthShare, o.minWidth, o.maxWidth);
    legs = clamp(Math.ceil(cross / (width * 0.8)), o.minLegs, o.maxLegs);
  } else {
    const z = EFFECTS.sweep;
    legs = clamp(Math.ceil(cross / (long * 0.4)), 1, z.maxLegs);
    width = (cross / legs) * z.overlap;
  }
  const over = width * 0.2;
  // The sponge starts from either end and either side.
  const fromEnd = r() < 0.5;
  const fromSide = r() < 0.5;
  const at = (a: number, c: number): { x: number; y: number } =>
    horizontal ? { x: x + a, y: y + c } : { x: x + c, y: y + a };
  const leg = (a: { x: number; y: number }, b: { x: number; y: number }): Leg => ({
    ax: a.x,
    ay: a.y,
    bx: b.x,
    by: b.y,
    len: Math.hypot(b.x - a.x, b.y - a.y),
  });
  const jitter = (k: number): number => (r() - 0.5) * width * k;
  const out: Leg[] = [];
  if (mode === 'zone') {
    // Parallel strokes, all the same way (the sponge is lifted between two): a zigzag
    // across a large zone made a web of crossing streaks.
    for (let i = 0; i < legs; i++) {
      const row = fromSide ? legs - 1 - i : i;
      const c = ((row + 0.5) * cross) / legs;
      const a0 = -over + jitter(0.2);
      const a1 = long + over + jitter(0.2);
      const c0 = c + jitter(0.1);
      const c1 = c + jitter(0.1);
      out.push(fromEnd ? leg(at(a1, c1), at(a0, c0)) : leg(at(a0, c0), at(a1, c1)));
    }
    return { width, legs: out };
  }
  // An object: one connected zigzag, one or two back and forths.
  const margin = Math.min(width * 0.4, cross / 2);
  let prev: { x: number; y: number } | null = null;
  for (let i = 0; i <= legs; i++) {
    const end = (i % 2 === 0) !== fromEnd;
    const t = i / legs;
    const c = lerp(margin, cross - margin, fromSide ? 1 - t : t);
    const p = at((end ? long + over : -over) + jitter(0.2), c + jitter(0.16));
    if (prev) out.push(leg(prev, p));
    prev = p;
  }
  return { width, legs: out };
}

/**
 * Straight runs of belt and bridge tiles: one sponge stroke per run, rather than one per
 * tile. Horizontal runs first, then vertical runs of the tiles left alone.
 */
export function tileRuns(tiles: readonly { x: number; y: number }[]): Rect[] {
  const set = new Set(tiles.map((t) => `${t.x},${t.y}`));
  const has = (x: number, y: number): boolean => set.has(`${x},${y}`);
  const runs: Rect[] = [];
  const single: { x: number; y: number }[] = [];
  for (const t of tiles) {
    if (has(t.x - 1, t.y)) continue;
    let x1 = t.x;
    while (has(x1 + 1, t.y)) x1++;
    if (x1 > t.x) runs.push({ x0: t.x, y0: t.y, x1, y1: t.y });
    else single.push(t);
  }
  const alone = new Set(single.map((t) => `${t.x},${t.y}`));
  for (const t of single) {
    if (alone.has(`${t.x},${t.y - 1}`)) continue;
    let y1 = t.y;
    while (alone.has(`${t.x},${y1 + 1}`)) y1++;
    runs.push({ x0: t.x, y0: t.y, x1: t.x, y1 });
  }
  return runs;
}

/** Tiles of a belt path that get a few grains: its ends first, then a stable sample. */
export function beltDustTiles(
  tiles: readonly { x: number; y: number }[],
): { x: number; y: number }[] {
  const set = new Set(tiles.map((t) => `${t.x},${t.y}`));
  const neighbours = (x: number, y: number): number =>
    +set.has(`${x - 1},${y}`) +
    +set.has(`${x + 1},${y}`) +
    +set.has(`${x},${y - 1}`) +
    +set.has(`${x},${y + 1}`);
  const ends = tiles.filter((t) => neighbours(t.x, t.y) < 2);
  const sample = tiles.filter(
    (t) => neighbours(t.x, t.y) >= 2 && hash01(t.x, t.y) < EFFECTS.beltDust.sampleRate,
  );
  return ends.concat(sample).slice(0, EFFECTS.beltDust.maxPuffsPerAction);
}

function isTile(f: Footprint): boolean {
  return f.type === 'belt' || f.type === 'bridge';
}

/** Chalk of a building's tinted dust grains, or null for belts (plain white dust). */
function dustTint(f: Footprint): string | null {
  const lighten = EFFECTS.dust.tintLighten;
  // An edition was applied (or the building comes back with one): dust of its chalk.
  if (f.edition !== undefined) return EDITION_COLORS[f.edition].stops[1];
  if (f.type === 'extractor' && f.value !== undefined) return shade(itemColor(f.value), lighten);
  const base = (BUILDING_COLORS as Record<string, string | undefined>)[f.type];
  return base ? shade(base, lighten) : null;
}

/** Live chalk effects: create them from the player's actions, draw them each frame. */
export class Effects {
  private list: Effect[] = [];
  private grainCount = 0;
  private reduced = false;

  /** "Reduce motion": no effect at all (and those alive go at once). */
  get reducedMotion(): boolean {
    return this.reduced;
  }

  set reducedMotion(on: boolean) {
    this.reduced = on;
    if (on) this.clear();
  }

  /** Effects alive. */
  get size(): number {
    return this.list.length;
  }

  /** Dust grains of the puffs alive. */
  get grains(): number {
    return this.grainCount;
  }

  clear(): void {
    this.list = [];
    this.grainCount = 0;
  }

  /** A puff of dust around each building placed, a few grains along new belts. */
  dust(placed: readonly Footprint[], now: number): void {
    if (this.reduced || placed.length === 0) return;
    const d = EFFECTS.dust;
    const buildings = placed.filter((f) => !isTile(f)).slice(0, d.maxPuffsPerAction);
    for (const f of buildings) {
      const grains = clamp(
        Math.round(2 * (f.w + f.h) * d.grainsPerEdgeTile),
        d.minGrains,
        d.maxGrains,
      );
      this.addPuff(f.x, f.y, f.w, f.h, grains, d.clouds, dustTint(f), now);
    }
    for (const t of beltDustTiles(placed.filter(isTile))) {
      this.addPuff(t.x, t.y, 1, 1, EFFECTS.beltDust.grains, 0, null, now);
    }
  }

  /**
   * Wipe what was removed. With a zone (zone demolition, cut, clear), one sweep across it.
   * Otherwise a short zigzag on each building and on each straight run of belts; past
   * `maxSpongesPerAction`, one sweep across everything removed.
   */
  sponge(removed: readonly Footprint[], area: Rect | null, now: number): void {
    if (this.reduced) return;
    if (area) {
      this.wipeRect(area.x0, area.y0, area.x1 - area.x0 + 1, area.y1 - area.y0 + 1, now);
      return;
    }
    if (removed.length === 0) return;
    const rects: Rect[] = removed
      .filter((f) => !isTile(f))
      .map((f) => ({ x0: f.x, y0: f.y, x1: f.x + f.w - 1, y1: f.y + f.h - 1 }))
      .concat(tileRuns(removed.filter(isTile)));
    if (rects.length > EFFECTS.maxSpongesPerAction) {
      const box = rects.reduce((b, r) => ({
        x0: Math.min(b.x0, r.x0),
        y0: Math.min(b.y0, r.y0),
        x1: Math.max(b.x1, r.x1),
        y1: Math.max(b.y1, r.y1),
      }));
      this.wipeRect(box.x0, box.y0, box.x1 - box.x0 + 1, box.y1 - box.y0 + 1, now);
      return;
    }
    for (const r of rects) {
      this.addSponge(r.x0, r.y0, r.x1 - r.x0 + 1, r.y1 - r.y0 + 1, 'object', now);
    }
  }

  /** Drop the effects that have ended. */
  prune(now: number): void {
    const maxDust = EFFECTS.dust.maxLifeMs + EFFECTS.dust.staggerMs;
    let grains = 0;
    this.list = this.list.filter((e) => {
      const alive = now - e.start <= (e.kind === 'sponge' ? e.lifeMs : maxDust);
      if (alive && e.kind === 'dust') grains += e.grains;
      return alive;
    });
    this.grainCount = grains;
  }

  /** Sponge traces: on the board, under what is drawn on it (belts, buildings, items). */
  drawUnder(ctx: CanvasRenderingContext2D, cam: Camera, now: number): void {
    this.prune(now);
    if (this.list.length === 0 || cam.zoom < EFFECTS.spongeMinZoom) return;
    const view = cam.visibleTiles(1);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const e of this.list) {
      if (e.kind === 'sponge' && overlaps(e.box, view)) drawSponge(ctx, cam, e, now);
    }
    ctx.restore();
  }

  /** Dust: in the air, over everything but the markers. */
  drawOver(ctx: CanvasRenderingContext2D, cam: Camera, now: number): void {
    if (this.grainCount === 0 || cam.zoom < EFFECTS.dustMinZoom) return;
    const view = cam.visibleTiles(1);
    ctx.save();
    for (const e of this.list) {
      if (e.kind === 'dust' && overlaps(e.box, view)) drawPuff(ctx, cam, e, now);
    }
    ctx.restore();
  }

  private wipeRect(x: number, y: number, w: number, h: number, now: number): void {
    const small = Math.max(w, h) <= EFFECTS.sweep.objectMaxSide;
    this.addSponge(x, y, w, h, small ? 'object' : 'zone', now);
  }

  private addSponge(
    x: number,
    y: number,
    w: number,
    h: number,
    mode: 'object' | 'zone',
    now: number,
  ): void {
    const seed = rectSeed(x, y, w, h);
    const path = spongePath(x, y, w, h, seed, mode);
    const timing = mode === 'object' ? EFFECTS.sponge : EFFECTS.sweep;
    const m = path.width;
    this.add({
      kind: 'sponge',
      start: now,
      passMs: timing.passMs,
      holdMs: timing.holdMs,
      lifeMs: timing.lifeMs,
      path,
      total: path.legs.reduce((n, l) => n + l.len, 0),
      seed,
      box: { x0: x - m, y0: y - m, x1: x + w + m, y1: y + h + m },
    });
  }

  private addPuff(
    x: number,
    y: number,
    w: number,
    h: number,
    grains: number,
    clouds: number,
    tint: string | null,
    now: number,
  ): void {
    // The grains fly about half a tile and fall a little.
    this.add({
      kind: 'dust',
      start: now,
      x,
      y,
      w,
      h,
      grains,
      clouds,
      tint,
      seed: rectSeed(x, y, w, h) ^ 0x5f3759df,
      box: { x0: x - 1, y0: y - 1, x1: x + w + 1, y1: y + h + 1.5 },
    });
  }

  private add(e: Effect): void {
    const grains = e.kind === 'dust' ? e.grains : 0;
    // Make room: the oldest effects go first (and the oldest puffs, for the grains).
    while (this.list.length >= EFFECTS.maxEffects) this.removeAt(0);
    while (grains > 0 && this.grainCount + grains > EFFECTS.maxGrains) {
      const i = this.list.findIndex((o) => o.kind === 'dust');
      if (i < 0) break;
      this.removeAt(i);
    }
    this.list.push(e);
    this.grainCount += grains;
  }

  private removeAt(i: number): void {
    const [e] = this.list.splice(i, 1);
    if (e?.kind === 'dust') this.grainCount -= e.grains;
  }
}

function overlaps(a: Box, b: Box): boolean {
  return a.x1 >= b.x0 && a.x0 <= b.x1 && a.y1 >= b.y0 && a.y0 <= b.y1;
}

/**
 * A sponge trace: a wide band of chalk dust a little lighter than the slate, soft at the
 * edges (several passes, narrower ones on top), with broken streaks along the gesture. The
 * trace is revealed along the path while the sponge moves, holds, then fades; the streaks
 * last a little longer than the band, as chalk left in the grain of the board.
 */
function drawSponge(ctx: CanvasRenderingContext2D, cam: Camera, e: Sponge, now: number): void {
  const age = now - e.start;
  if (age < 0) return;
  const tr = EFFECTS.trace;
  const pass = Math.min(1, age / e.passMs);
  const fadeFrom = e.passMs + e.holdMs;
  const fade = age <= fadeFrom ? 0 : (age - fadeFrom) / (e.lifeMs - fadeFrom);
  const env = 1 - smooth(Math.min(1, fade));
  const streakEnv = 1 - smooth(Math.min(1, fade * 0.85));
  if (streakEnv <= 0) return;
  const reveal = smooth(pass) * e.total;
  const W = e.path.width * cam.scale;

  // How much of each stroke the sponge has covered so far.
  const revealed: number[] = [];
  let done = 0;
  for (const l of e.path.legs) {
    revealed.push(l.len > 0 ? clamp((reveal - done) / l.len, 0, 1) : 1);
    done += l.len;
  }

  // The band, stroked narrower and shorter each pass: soft at the sides and at both ends.
  // Flat ends: a sponge is a block, its trace starts and stops square.
  if (env > 0) {
    ctx.strokeStyle = CHALK.white;
    ctx.lineCap = 'butt';
    ctx.globalAlpha = tr.bandAlpha * env;
    for (let k = 0; k < tr.bandPasses; k++) {
      const trim = (k / tr.bandPasses) * 0.35 * e.path.width;
      if (!tracePath(ctx, cam, e.path.legs, trim, reveal - trim)) break;
      ctx.lineWidth = W * (1 - (0.6 * k) / tr.bandPasses);
      ctx.stroke();
    }
    ctx.lineCap = 'round';
  }

  // Streaks, in two kinds: broad and faint, thin and brighter. Slightly bent, not quite
  // parallel, broken like chalk.
  const n = clamp(Math.round(e.path.width * tr.streaksPerTile), tr.minStreaks, tr.maxStreaks);
  for (let kind = 0; kind < 2; kind++) {
    ctx.beginPath();
    for (const [i, l] of e.path.legs.entries()) {
      const f = revealed[i] ?? 0;
      if (f <= 0) break;
      const r = rng(e.seed ^ Math.imul(i * 2 + kind + 1, 0x9e3779b1));
      const ux = (l.bx - l.ax) / (l.len || 1);
      const uy = (l.by - l.ay) / (l.len || 1);
      /** Point at `t` along the stroke, `o` tiles to its side. */
      const at = (t: number, o: number): { x: number; y: number } =>
        cam.worldToScreen(l.ax + ux * l.len * t - uy * o, l.ay + uy * l.len * t + ux * o);
      for (let k = 0; k < n / 2; k++) {
        const o0 = (r() - 0.5) * 0.92 * e.path.width;
        const o1 = o0 + (r() - 0.5) * 0.12 * e.path.width;
        const bend = (r() - 0.5) * 0.08 * e.path.width;
        const t0 = r() * 0.35;
        const t1 = Math.min(1, t0 + 0.4 + r() * 0.6);
        if (f <= t0) continue;
        const te = Math.min(t1, f);
        const tm = (t0 + te) / 2;
        const p = at(t0, o0);
        const m = at(tm, lerp(o0, o1, tm) + bend);
        const q = at(te, lerp(o0, o1, te));
        ctx.moveTo(p.x, p.y);
        ctx.quadraticCurveTo(m.x, m.y, q.x, q.y);
      }
    }
    const broad = kind === 0;
    ctx.globalAlpha = tr.streakAlpha * streakEnv * (broad ? 0.4 : 1);
    // Fine lines whatever the sponge's size: a wide sweep has more of them, not thicker.
    const thin = Math.min(tr.streakWidth * W, tr.streakMaxWidth * cam.scale);
    chalkStroke(ctx, CHALK.white, Math.max(0.8, thin * (broad ? 2.2 : 1)));
  }
}

/** The stroke `b` starts where `a` ends. */
function joined(a: Leg | null, b: Leg): boolean {
  return a !== null && Math.abs(a.bx - b.ax) < 1e-9 && Math.abs(a.by - b.ay) < 1e-9;
}

/** Add to a new path the part of the strokes between distances `from` and `to` (tiles). */
function tracePath(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  legs: readonly Leg[],
  from: number,
  to: number,
): boolean {
  if (to <= from) return false;
  ctx.beginPath();
  let done = 0;
  let started = false;
  let prev: Leg | null = null;
  for (const l of legs) {
    const a = clamp((from - done) / (l.len || 1), 0, 1);
    const b = clamp((to - done) / (l.len || 1), 0, 1);
    done += l.len;
    if (b <= a) continue;
    const p = cam.worldToScreen(lerp(l.ax, l.bx, a), lerp(l.ay, l.by, a));
    const q = cam.worldToScreen(lerp(l.ax, l.bx, b), lerp(l.ay, l.by, b));
    // Strokes are joined (zigzag) or separate (sweep: the sponge is lifted between two).
    if (started && a === 0 && joined(prev, l)) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    started = true;
    prev = l;
  }
  return started;
}

/**
 * A puff of chalk dust: grains leave the edges of the footprint outward, slow down in the
 * air, fall a little down the board and vanish; a few faint clouds spread from the edges.
 * Positions are closed formulas of the age (drag and gravity), so nothing is stored.
 */
function drawPuff(ctx: CanvasRenderingContext2D, cam: Camera, e: Puff, now: number): void {
  const age = now - e.start;
  if (age < 0) return;
  const d = EFFECTS.dust;
  const r = rng(e.seed);
  const s = cam.scale;
  const tau = d.dragMs / 1000;
  const perimeter = 2 * (e.w + e.h);
  /** A point on the footprint's edge, with the outward normal there. */
  const onEdge = (u: number): { x: number; y: number; nx: number; ny: number } => {
    let p = u * perimeter;
    if (p < e.w) return { x: e.x + p, y: e.y, nx: 0, ny: -1 };
    p -= e.w;
    if (p < e.h) return { x: e.x + e.w, y: e.y + p, nx: 1, ny: 0 };
    p -= e.h;
    if (p < e.w) return { x: e.x + e.w - p, y: e.y + e.h, nx: 0, ny: 1 };
    p -= e.w;
    return { x: e.x, y: e.y + e.h - p, nx: -1, ny: 0 };
  };
  /** Where a grain is after `t` seconds, from `(x, y)` at speed `(vx, vy)`. */
  const fly = (
    x: number,
    y: number,
    vx: number,
    vy: number,
    t: number,
  ): { x: number; y: number } => {
    const k = 1 - Math.exp(-t / tau);
    return {
      x: x + vx * tau * k,
      y: y + vy * tau * k + d.gravity * tau * (t - tau * k),
    };
  };

  for (let i = 0; i < e.grains; i++) {
    const p = onEdge(r());
    const turn = (r() - 0.5) * 1.3;
    const speed = lerp(d.minSpeed, d.maxSpeed, r());
    const life = lerp(d.minLifeMs, d.maxLifeMs, r());
    const delay = r() * d.staggerMs;
    const size = lerp(d.minSize, d.maxSize, r());
    const tinted = e.tint !== null && r() < d.tinted;
    const t = age - delay;
    if (t < 0 || t > life) continue;
    const u = t / life;
    const c = Math.cos(turn);
    const sn = Math.sin(turn);
    const vx = (p.nx * c - p.ny * sn) * speed;
    const vy = (p.nx * sn + p.ny * c) * speed;
    const at = fly(p.x + p.nx * 0.04, p.y + p.ny * 0.04, vx, vy, t / 1000);
    const q = cam.worldToScreen(at.x, at.y);
    const px = Math.max(1, size * (1 - 0.4 * u) * s);
    ctx.globalAlpha = 0.9 * (1 - u * u);
    ctx.fillStyle = tinted ? (e.tint as string) : CHALK.white;
    ctx.fillRect(q.x - px / 2, q.y - px / 2, px, px);
  }

  // Faint clouds: soft discs growing out of the edges.
  ctx.fillStyle = CHALK.white;
  for (let i = 0; i < e.clouds; i++) {
    const p = onEdge(r());
    const life = lerp(d.minLifeMs, d.maxLifeMs, r());
    const grow = 0.6 + r() * 0.6;
    const u = age / life;
    if (u > 1) continue;
    const out = smooth(Math.min(1, u * 1.4)) * 0.3;
    const q = cam.worldToScreen(p.x + p.nx * out, p.y + p.ny * out + u * 0.08);
    ctx.globalAlpha = d.cloudAlpha * (1 - u);
    ctx.beginPath();
    ctx.arc(q.x, q.y, (0.12 + 0.3 * grow * smooth(u)) * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Tool events that play the effects (wired by the game and the tutorial demos): dust on
 * what a build placed, the sponge on what a demolition removed or on the zone it swept,
 * both after an undo or a redo (what comes back is dusted, what goes away is wiped). Only
 * the player's actions go through a `ToolController`: loading a save, importing, a new
 * game or the catch-up of a hidden tab never play anything.
 */
export function effectEvents(
  effects: Effects,
  clock: () => number,
): Required<Pick<ToolEvents, 'onBuild' | 'onDemolish' | 'onClear' | 'onRestore'>> {
  return {
    onBuild: (touched) => effects.dust(touched.placed, clock()),
    onDemolish: (touched) => effects.sponge(touched.removed, touched.area, clock()),
    onClear: (items, area) => {
      if (items > 0) effects.sponge([], area, clock());
    },
    onRestore: (touched) => {
      const now = clock();
      effects.sponge(touched.removed, null, now);
      effects.dust(touched.placed, now);
    },
  };
}
