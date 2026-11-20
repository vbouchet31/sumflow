/**
 * Chalk drawing (DECISIONS: "Tableau noir"): what the player builds is sketched by hand
 * (wobbling outlines, hatching, broken strokes), what the game gives (the hub) is ruled.
 *
 * Every irregularity comes from a seed derived from world positions, never from
 * `Math.random`: a sketch looks the same from one frame to the next, and two pieces of a
 * layer drawn separately (cached regions) meet without a seam.
 */

/** Small deterministic PRNG (mulberry32): the same seed gives the same sequence. */
export function rng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seed from a pair of integers (usually a tile position), well mixed (MurmurHash3 finaliser). */
export function tileSeed(x: number, y: number): number {
  let h = (Math.imul(x, 0x9e3779b1) + Math.imul(y, 0x85ebca77)) | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Stable pseudo-random value in [0, 1) for a pair of integers. */
export function hash01(x: number, y: number): number {
  return rng(tileSeed(x, y))();
}

/** Mix a #rrggbb colour toward black (f < 0) or white (f > 0), as an rgb() string. */
export function shade(hex: string, f: number): string {
  const id = `${hex}${f}`;
  let c = shades.get(id);
  if (c === undefined) {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
      Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f),
    );
    c = `rgb(${ch[0]}, ${ch[1]}, ${ch[2]})`;
    shades.set(id, c);
  }
  return c;
}

const shades = new Map<string, string>();

/**
 * Stroke the current path like a stick of chalk: two passes with broken dash patterns leave
 * small gaps where the board shows through.
 */
export function chalkStroke(ctx: CanvasRenderingContext2D, color: string, w: number): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = w;
  ctx.globalAlpha *= 0.9;
  ctx.setLineDash([w * 7, w * 0.8, w * 3, w * 0.6]);
  ctx.stroke();
  ctx.lineWidth = w * 0.55;
  ctx.globalAlpha *= 0.6;
  ctx.setLineDash([w * 4, w * 1.4, w * 9, w * 1.1]);
  ctx.lineDashOffset = w * 2.5;
  ctx.stroke();
  ctx.restore();
}

/**
 * A hand-drawn curve from (x0, y0) to (x1, y1) bending toward (cx, cy), in two passes. With
 * the control point halfway, a straight line that the hand bends a little.
 */
export function chalkCurve(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  seed: number,
  color: string,
  lw: number,
): void {
  const r = rng(seed);
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const nx = -(y1 - y0) / len;
  const ny = (x1 - x0) / len;
  const alpha = ctx.globalAlpha;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) {
    const bend = (r() - 0.5) * len * 0.06;
    const jx0 = (r() - 0.5) * lw * 1.2;
    const jy0 = (r() - 0.5) * lw * 1.2;
    const jx1 = (r() - 0.5) * lw * 1.2;
    const jy1 = (r() - 0.5) * lw * 1.2;
    ctx.lineWidth = pass ? lw * 0.6 : lw;
    ctx.globalAlpha = alpha * (pass ? 0.5 : 0.9);
    ctx.beginPath();
    ctx.moveTo(x0 + jx0, y0 + jy0);
    ctx.quadraticCurveTo(cx + nx * bend, cy + ny * bend, x1 + jx1, y1 + jy1);
    ctx.stroke();
  }
  ctx.globalAlpha = alpha;
}

/** A single hand-drawn chalk line from (x0, y0) to (x1, y1). */
export function chalkLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  seed: number,
  color: string,
  lw: number,
): void {
  chalkCurve(ctx, x0, y0, (x0 + x1) / 2, (y0 + y1) / 2, x1, y1, seed, color, lw);
}

const CORNERS = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
] as const;

/**
 * Hand-drawn rectangle: each side is a slightly bent line that overshoots the corners, drawn
 * twice with a different wobble, like a player sketching with chalk.
 */
export function sketchRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
  color: string,
  lw: number,
): void {
  const r = rng(seed);
  const j = Math.min(w, h) * 0.07;
  const alpha = ctx.globalAlpha;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    ctx.lineWidth = pass ? lw * 0.6 : lw;
    ctx.globalAlpha = alpha * (pass ? 0.55 : 0.9);
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = CORNERS[i] as readonly [number, number];
      const b = CORNERS[(i + 1) % 4] as readonly [number, number];
      const ax = x + a[0] * w;
      const ay = y + a[1] * h;
      const bx = x + b[0] * w;
      const by = y + b[1] * h;
      // Unit vector of the side (sides are axis aligned).
      const ux = Math.sign(bx - ax);
      const uy = Math.sign(by - ay);
      const o1 = j * (0.2 + r() * 0.9);
      const o2 = j * (0.2 + r() * 0.9);
      const sx = ax - ux * o1 + (r() - 0.5) * j * 0.8;
      const sy = ay - uy * o1 + (r() - 0.5) * j * 0.8;
      const ex = bx + ux * o2 + (r() - 0.5) * j * 0.8;
      const ey = by + uy * o2 + (r() - 0.5) * j * 0.8;
      const bend = (r() - 0.5) * 2 * j;
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo((sx + ex) / 2 - uy * bend, (sy + ey) / 2 + ux * bend, ex, ey);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = alpha;
}

/** Hand-drawn circle: two loose loops that do not quite close. */
export function sketchCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rad: number,
  seed: number,
  color: string,
  lw: number,
): void {
  const r = rng(seed);
  const alpha = ctx.globalAlpha;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) {
    ctx.lineWidth = pass ? lw * 0.6 : lw;
    ctx.globalAlpha = alpha * (pass ? 0.55 : 0.95);
    const a0 = r() * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(
      cx + (r() - 0.5) * rad * 0.08,
      cy + (r() - 0.5) * rad * 0.08,
      rad * (1 + (r() - 0.5) * 0.1),
      rad * (1 + (r() - 0.5) * 0.1),
      r() * Math.PI,
      a0,
      a0 + Math.PI * 2 * (0.9 + r() * 0.15),
    );
    ctx.stroke();
  }
  ctx.globalAlpha = alpha;
}

/**
 * Colour a rectangle in with chalk: slightly bent, unevenly spaced diagonal strokes clipped
 * to it, with ragged ends that leave a few gaps, like a child colouring a shape.
 */
export function hatchRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
  color: string,
  lw: number,
): void {
  const r = rng(seed ^ 0x5bd1e995);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  const ang = -Math.PI / 4 + (r() - 0.5) * 0.35;
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const half = Math.hypot(w, h) / 2;
  const gap = lw * 2.2;
  ctx.beginPath();
  for (let t = -half; t <= half; t += gap * (0.75 + r() * 0.5)) {
    const ox = cx - uy * t;
    const oy = cy + ux * t;
    const l1 = half * (0.6 + r() * 0.5);
    const l2 = half * (0.6 + r() * 0.5);
    const sx = ox - ux * l1;
    const sy = oy - uy * l1;
    const ex = ox + ux * l2;
    const ey = oy + uy * l2;
    const bend = (r() - 0.5) * gap * 1.5;
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo((sx + ex) / 2 - uy * bend, (sy + ey) / 2 + ux * bend, ex, ey);
  }
  ctx.stroke();
  ctx.restore();
}

/** Hatch variants per colour and size: few, and reused under 8 orientations. */
export const HATCH_VARIANTS = 3;
/** Largest side of a hatch picture: beyond, it is scaled up (hatching stays hatching). */
const HATCH_MAX_PX = 512;
/** Memory budget of the hatch pictures, in pixels (4 bytes each): 32 MB. */
const HATCH_PIXEL_BUDGET = 8_000_000;
const hatchSprites = new Map<string, HTMLCanvasElement>();
let hatchPixels = 0;

/**
 * Chalk colouring of a `size` square, from a cache: only HATCH_VARIANTS hatchings per colour
 * and size, each shown under one of 8 orientations (4 quarter turns, with or without a
 * mirror) picked from `seed`, so neighbouring tiles still look different.
 */
export function drawHatch(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  seed: number,
  color: string,
  lw: number,
): void {
  const dpr = ctx.getTransform().a;
  // Sizes in steps of a quarter octave: while zooming, a few pictures are scaled instead
  // of a new one being drawn every frame.
  const px = Math.min(
    HATCH_MAX_PX,
    Math.max(8, Math.round(2 ** (Math.ceil(Math.log2(size * dpr) * 4) / 4))),
  );
  const h = seed >>> 0;
  const variant = h % HATCH_VARIANTS;
  const key = `${color}|${px}|${variant}`;
  let sprite = hatchSprites.get(key);
  if (!sprite) {
    if (hatchPixels + px * px > HATCH_PIXEL_BUDGET) {
      for (const c of hatchSprites.values()) c.width = 0; // release the bitmaps now
      hatchSprites.clear();
      hatchPixels = 0;
    }
    hatchPixels += px * px;
    sprite = document.createElement('canvas');
    sprite.width = px;
    sprite.height = px;
    const g = sprite.getContext('2d');
    if (g) hatchRect(g, 0, 0, px, px, variant * 7919 + 13, color, (lw * px) / size);
    hatchSprites.set(key, sprite);
  }
  const t = (h >>> 3) % 8;
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  ctx.rotate(((t & 3) * Math.PI) / 2);
  if (t & 4) ctx.scale(-1, 1);
  ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
  ctx.restore();
}

/**
 * A square of a building in chalk: a faint wash, the hatching, then the hand-drawn outline.
 * `x, y, size` is the outline; the hatching stays a little inside it.
 */
export function chalkSquare(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  seed: number,
  colors: { wash: string; hatch: string; outline: string },
  lw: { hatch: number; outline: number },
): void {
  const alpha = ctx.globalAlpha;
  const pad = lw.outline * 0.75;
  ctx.fillStyle = colors.wash;
  ctx.globalAlpha = alpha * 0.12;
  ctx.fillRect(x, y, size, size);
  ctx.globalAlpha = alpha * 0.75;
  drawHatch(ctx, x + pad, y + pad, size - 2 * pad, seed, colors.hatch, lw.hatch);
  ctx.globalAlpha = alpha;
  sketchRect(ctx, x, y, size, size, seed, colors.outline, lw.outline);
}
