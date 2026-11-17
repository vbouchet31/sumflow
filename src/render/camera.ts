import { CAMERA, TILE_PX } from '../config/keymap';
import { COORD_MAX, COORD_MIN } from '../core/grid';

/**
 * 2D camera. `x`, `y` is the world point (in tiles) shown at the viewport centre.
 * Pure logic, no DOM: testable under Node.
 */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  viewW = 0;
  viewH = 0;

  setViewport(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
  }

  /** CSS pixels per tile at the current zoom. */
  get scale(): number {
    return TILE_PX * this.zoom;
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: (wx - this.x) * this.scale + this.viewW / 2,
      y: (wy - this.y) * this.scale + this.viewH / 2,
    };
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.viewW / 2) / this.scale + this.x,
      y: (sy - this.viewH / 2) / this.scale + this.y,
    };
  }

  /** Move the view by a screen-space offset (a drag of `dx, dy` pixels moves the world with it). */
  panScreen(dx: number, dy: number): void {
    this.flight = null; // the player takes over
    this.x -= dx / this.scale;
    this.y -= dy / this.scale;
    this.clampPosition();
  }

  /** Multiply the zoom, keeping the world point under `(sx, sy)` fixed on screen. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.screenToWorld(sx, sy);
    this.zoom = Math.min(CAMERA.maxZoom, Math.max(CAMERA.minZoom, this.zoom * factor));
    const after = this.screenToWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clampPosition();
  }

  /**
   * One step of a two-finger gesture: the fingers' midpoint went from `(px, py)` to
   * `(cx, cy)` and their distance was multiplied by `factor`. The world point that was
   * under the midpoint stays under it.
   */
  pinch(px: number, py: number, cx: number, cy: number, factor: number): void {
    this.zoomAt(px, py, factor);
    this.panScreen(cx - px, cy - py);
  }

  /** Where an animated move (`flyTo`) is heading, or null. */
  private flight: { x: number; y: number } | null = null;

  /** Glide to centre on a world point (see `step`); `centerOn` jumps at once. */
  flyTo(wx: number, wy: number): void {
    this.flight = { x: wx, y: wy };
  }

  get flying(): boolean {
    return this.flight !== null;
  }

  /** Advance an animated move by `dt` seconds (call every frame). Eases out, ~0.5 s. */
  step(dt: number): void {
    const f = this.flight;
    if (!f) return;
    const k = 1 - Math.exp(-dt * 9);
    this.x += (f.x - this.x) * k;
    this.y += (f.y - this.y) * k;
    this.clampPosition();
    if (Math.hypot(f.x - this.x, f.y - this.y) * this.scale < 0.5) {
      this.x = f.x;
      this.y = f.y;
      this.clampPosition();
      this.flight = null;
    }
  }

  centerOn(wx: number, wy: number): void {
    this.flight = null;
    this.x = wx;
    this.y = wy;
    this.clampPosition();
  }

  /** Visible tile range (inclusive), with an optional margin in tiles. */
  visibleTiles(margin = 0): { x0: number; y0: number; x1: number; y1: number } {
    const tl = this.screenToWorld(0, 0);
    const br = this.screenToWorld(this.viewW, this.viewH);
    return {
      x0: Math.floor(tl.x) - margin,
      y0: Math.floor(tl.y) - margin,
      x1: Math.ceil(br.x) + margin,
      y1: Math.ceil(br.y) + margin,
    };
  }

  private clampPosition(): void {
    this.x = Math.min(COORD_MAX, Math.max(COORD_MIN, this.x));
    this.y = Math.min(COORD_MAX, Math.max(COORD_MIN, this.y));
  }
}
