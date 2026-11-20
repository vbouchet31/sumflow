import { CHUNK_SIZE } from '../core/grid';
import { Camera } from './camera';

/** Tile rectangle, inclusive. */
export interface TileRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Paints the part of a layer inside `rect`, with a camera whose viewport is that rect. */
export type RegionPainter = (ctx: CanvasRenderingContext2D, cam: Camera, rect: TileRect) => void;

interface Region {
  canvas: HTMLCanvasElement;
  usedAt: number;
}

/** Smallest and largest side of a cached bitmap, in device pixels. */
const MIN_REGION_PX = 256;
const MAX_REGION_PX = 1024;

/**
 * Off-screen cache of a static layer (PLAN §10.1, §10.2), cut in square regions of whole
 * chunks. A region is painted once, then blitted every frame until it is invalidated, the
 * zoom changes or `signature` changes. Regions cover more chunks as the zoom goes down, so
 * their bitmaps stay between 256 and 512 pixels wide.
 */
export class RegionCache {
  private readonly regions = new Map<string, Region>();
  private zoom = 0;
  private dpr = 0;
  private signature = '';
  /** Region side in tiles. */
  private span = CHUNK_SIZE;
  private frame = 0;

  /** True when the layer can be cached at this zoom (bitmaps would not be too large). */
  static usable(cam: Camera, dpr: number): boolean {
    return CHUNK_SIZE * cam.scale * dpr <= MAX_REGION_PX;
  }

  /** Number of bitmaps currently held (for tests and debugging). */
  get size(): number {
    return this.regions.size;
  }

  clear(): void {
    for (const r of this.regions.values()) r.canvas.width = 0; // release the bitmap now
    this.regions.clear();
  }

  /** Forget the region that contains tile `(x, y)`. */
  invalidateTile(x: number, y: number): void {
    const id = `${Math.floor(x / this.span)},${Math.floor(y / this.span)}`;
    const r = this.regions.get(id);
    if (!r) return;
    r.canvas.width = 0;
    this.regions.delete(id);
  }

  /** Forget every region touching the tile rectangle (inclusive). */
  invalidateRect(x0: number, y0: number, x1: number, y1: number): void {
    const { span } = this;
    for (let ry = Math.floor(y0 / span); ry <= Math.floor(y1 / span); ry++) {
      for (let rx = Math.floor(x0 / span); rx <= Math.floor(x1 / span); rx++) {
        const id = `${rx},${ry}`;
        const r = this.regions.get(id);
        if (!r) continue;
        r.canvas.width = 0;
        this.regions.delete(id);
      }
    }
  }

  /**
   * Draw the layer over the visible area. `signature` describes everything the layer
   * depends on besides its tiles (for example the highest extractable value).
   */
  draw(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    dpr: number,
    signature: string,
    paint: RegionPainter,
  ): void {
    if (cam.zoom !== this.zoom || dpr !== this.dpr || signature !== this.signature) {
      this.clear();
      this.zoom = cam.zoom;
      this.dpr = dpr;
      this.signature = signature;
      let span = CHUNK_SIZE;
      while (span * cam.scale * dpr < MIN_REGION_PX) span *= 2;
      this.span = span;
    }
    this.frame++;
    const { span } = this;
    const sizePx = Math.ceil(span * cam.scale * dpr);
    const sizeCss = sizePx / dpr;
    const v = cam.visibleTiles();
    const rx0 = Math.floor(v.x0 / span);
    const ry0 = Math.floor(v.y0 / span);
    const rx1 = Math.floor(v.x1 / span);
    const ry1 = Math.floor(v.y1 / span);
    for (let ry = ry0; ry <= ry1; ry++) {
      for (let rx = rx0; rx <= rx1; rx++) {
        const id = `${rx},${ry}`;
        let region = this.regions.get(id);
        if (!region) {
          region = { canvas: this.paintRegion(cam, dpr, rx, ry, sizePx, paint), usedAt: 0 };
          this.regions.set(id, region);
        }
        region.usedAt = this.frame;
        const p = cam.worldToScreen(rx * span, ry * span);
        // Snapped to device pixels: bitmaps are copied 1:1, never resampled.
        ctx.drawImage(
          region.canvas,
          Math.round(p.x * dpr) / dpr,
          Math.round(p.y * dpr) / dpr,
          sizeCss,
          sizeCss,
        );
      }
    }
    const visible = (rx1 - rx0 + 1) * (ry1 - ry0 + 1);
    if (this.regions.size > Math.max(32, visible * 3)) {
      for (const [id, r] of this.regions) {
        if (r.usedAt === this.frame) continue;
        r.canvas.width = 0;
        this.regions.delete(id);
      }
    }
  }

  private paintRegion(
    cam: Camera,
    dpr: number,
    rx: number,
    ry: number,
    sizePx: number,
    paint: RegionPainter,
  ): HTMLCanvasElement {
    const { span } = this;
    const canvas = document.createElement('canvas');
    canvas.width = sizePx;
    canvas.height = sizePx;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sizeCss = sizePx / dpr;
    const local = new Camera();
    local.zoom = cam.zoom;
    local.setViewport(sizeCss, sizeCss);
    // Put the region's top-left tile corner exactly on the bitmap's origin.
    local.x = rx * span + sizeCss / (2 * cam.scale);
    local.y = ry * span + sizeCss / (2 * cam.scale);
    paint(ctx, local, {
      x0: rx * span,
      y0: ry * span,
      x1: (rx + 1) * span - 1,
      y1: (ry + 1) * span - 1,
    });
    return canvas;
  }
}

/**
 * Small pre-rendered pictures keyed by a number (an item value), all for one `scale`:
 * the cache empties itself when the scale changes or when it grows too large.
 */
export class SpriteCache {
  private readonly sprites = new Map<number, HTMLCanvasElement>();
  private scale = '';

  constructor(private readonly limit = 1024) {}

  get(
    key: number,
    scale: string,
    sizePx: number,
    paint: (ctx: CanvasRenderingContext2D) => void,
  ): HTMLCanvasElement {
    if (scale !== this.scale || this.sprites.size >= this.limit) {
      this.sprites.clear();
      this.scale = scale;
    }
    let sprite = this.sprites.get(key);
    if (!sprite) {
      sprite = document.createElement('canvas');
      sprite.width = sizePx;
      sprite.height = sizePx;
      const ctx = sprite.getContext('2d');
      if (ctx) paint(ctx);
      this.sprites.set(key, sprite);
    }
    return sprite;
  }
}
