/**
 * Draft "tableau noir" theme: strokes the current path like a stick of chalk. Two passes with
 * broken dash patterns leave small gaps where the board shows through.
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

/** Small deterministic PRNG, so a sketch keeps the same wobble from one frame to the next. */
function rng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seed from a tile position. */
export function tileSeed(x: number, y: number): number {
  return Math.imul(x, 73856093) ^ Math.imul(y, 19349663);
}

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
  const J = (): number => (r() - 0.5) * 2 * j;
  const pts = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ] as const;
  ctx.save();
  const alpha = ctx.globalAlpha;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    ctx.lineWidth = pass ? lw * 0.6 : lw;
    ctx.globalAlpha = alpha * (pass ? 0.55 : 0.9);
    ctx.setLineDash(pass ? [lw * 9, lw * 1.2] : [lw * 14, lw * 0.7]);
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = pts[i] as readonly [number, number];
      const [bx, by] = pts[(i + 1) % 4] as readonly [number, number];
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const ux = (bx - ax) / len;
      const uy = (by - ay) / len;
      const o1 = j * (0.2 + r() * 0.9);
      const o2 = j * (0.2 + r() * 0.9);
      const sx = ax - ux * o1 + J() * 0.4;
      const sy = ay - uy * o1 + J() * 0.4;
      const ex = bx + ux * o2 + J() * 0.4;
      const ey = by + uy * o2 + J() * 0.4;
      const bend = J();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo((sx + ex) / 2 - uy * bend, (sy + ey) / 2 + ux * bend, ex, ey);
    }
    ctx.stroke();
  }
  ctx.restore();
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
  ctx.save();
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
  ctx.restore();
}

/** Stable pseudo-random value in [0, 1) for a pair of integers. */
export function hash01(x: number, y: number): number {
  return rng(tileSeed(x, y))();
}

/**
 * Coloured-in with chalk: slightly bent, unevenly spaced diagonal strokes clipped to the
 * rectangle, with ragged ends that leave a few gaps, like a child colouring a shape.
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

const hatchSprites = new Map<string, HTMLCanvasElement>();

/**
 * Chalk colouring of a `size` square from a cache: only 3 hatch variants per colour and
 * size, each shown under one of 8 orientations (4 quarter turns, with or without a mirror)
 * picked from `seed`, so neighbouring tiles still look different.
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
  const px = Math.max(4, Math.round(size * dpr));
  const h = seed >>> 0;
  const variant = h % 3;
  const key = `${color}|${px}|${variant}`;
  let sprite = hatchSprites.get(key);
  if (!sprite) {
    if (hatchSprites.size > 256) hatchSprites.clear();
    sprite = document.createElement('canvas');
    sprite.width = px;
    sprite.height = px;
    const g = sprite.getContext('2d');
    if (g) hatchRect(g, 0, 0, px, px, variant * 7919 + 13, color, lw * dpr);
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
