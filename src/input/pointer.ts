import { CAMERA } from '../config/keymap';
import type { Camera } from '../render/camera';
import { Gestures } from './gestures';

export interface PointerMods {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}

const NO_MODS: PointerMods = { ctrl: false, shift: false, alt: false };

export interface PointerHandlers {
  /** Left button or building finger, in world tile coordinates. */
  onDown: (tx: number, ty: number, mods: PointerMods) => void;
  onMove: (tx: number, ty: number, mods: PointerMods) => void;
  onUp: (tx: number, ty: number, mods: PointerMods) => void;
  /** The gesture was interrupted (system, second finger): nothing must be built. */
  onCancel?: () => void;
  /** Touch: no finger is on the map any more (there is no hover on a touch screen). */
  onLeave?: () => void;
  /** Touch: a brief press ended (after its `onDown` / `onUp`). */
  onTap?: (tx: number, ty: number) => void;
  /** Touch: the finger stayed still on a tile. Return true if that did something. */
  onLongPress?: (tx: number, ty: number) => boolean;
  /** Touch: true when a one-finger drag builds (a tool is active) instead of panning. */
  buildsOnDrag?: () => boolean;
  /** Wheel; return true to consume it (no zoom). `delta` > 0 = scroll down. */
  onWheel?: (delta: number, mods: PointerMods) => boolean;
}

/**
 * Pointer input on the map, by pointer type rather than by device (PLAN-tactile §2).
 * - Mouse: left button → tools; right or middle drag pans; wheel zooms around the cursor
 *   (PLAN §8.1).
 * - Touch and pen contact: gestures (`Gestures`). A hovering pen moves the ghost like a mouse.
 */
export class PointerInput {
  private panPointer: number | null = null;
  private buildPointer: number | null = null;
  private lastX = 0;
  private lastY = 0;
  /** Pointers currently handled as touches. */
  private readonly touches = new Set<number>();
  private readonly gestures: Gestures;
  /** Last known pointer position in CSS pixels, relative to the canvas. */
  x = 0;
  y = 0;
  /** A hovering pointer (mouse, pen) is over the map. */
  inside = false;
  /**
   * The last pointer to act can hover (mouse, pen in the air): the tile under it is the
   * hovered tile. False after a touch, which leaves nothing behind once the finger is up.
   */
  hovering = false;

  constructor(
    private readonly el: HTMLElement,
    private readonly camera: Camera,
    private readonly handlers: PointerHandlers,
  ) {
    this.gestures = new Gestures({
      buildsOnDrag: () => handlers.buildsOnDrag?.() ?? false,
      down: (x, y) => this.toTile(x, y, handlers.onDown),
      move: (x, y) => this.toTile(x, y, handlers.onMove),
      up: (x, y) => this.toTile(x, y, handlers.onUp),
      cancel: () => handlers.onCancel?.(),
      leave: () => handlers.onLeave?.(),
      tap: (x, y) => {
        const t = this.tileAt(x, y);
        handlers.onTap?.(t.x, t.y);
      },
      longPress: (x, y) => {
        const t = this.tileAt(x, y);
        return handlers.onLongPress?.(t.x, t.y) ?? false;
      },
      pan: (dx, dy) => camera.panScreen(dx, dy),
      pinch: (px, py, cx, cy, factor) => camera.pinch(px, py, cx, cy, factor),
    });
    el.addEventListener('pointerdown', (e) => this.onDown(e));
    el.addEventListener('pointermove', (e) => this.onMove(e));
    el.addEventListener('pointerup', (e) => this.onUp(e));
    el.addEventListener('pointercancel', (e) => this.onCancel(e));
    el.addEventListener('pointerleave', (e) => {
      if (!this.isTouch(e)) this.inside = false;
    });
    el.addEventListener('pointerenter', (e) => {
      if (!this.isTouch(e)) this.inside = true;
    });
    el.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    // Prevent middle-click autoscroll.
    el.addEventListener('mousedown', (e) => {
      if (e.button === 1) e.preventDefault();
    });
    // Safari's own pinch events would zoom the page whatever `touch-action` says.
    for (const type of ['gesturestart', 'gesturechange']) {
      el.ownerDocument.addEventListener(type, (e) => e.preventDefault());
    }
  }

  /** Call every frame (same clock as the events' `timeStamp`): long press detection. */
  update(now: number): void {
    this.gestures.update(now);
  }

  /** Finger contact, or a pen touching the screen. */
  private isTouch(e: PointerEvent): boolean {
    return e.pointerType === 'touch' || this.touches.has(e.pointerId);
  }

  private local(e: MouseEvent): { x: number; y: number } {
    const rect = this.el.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  /** Tile under the given screen point. */
  tileAt(sx: number, sy: number): { x: number; y: number } {
    const w = this.camera.screenToWorld(sx, sy);
    return { x: Math.floor(w.x), y: Math.floor(w.y) };
  }

  private toTile(
    sx: number,
    sy: number,
    fn: (tx: number, ty: number, mods: PointerMods) => void,
  ): void {
    const t = this.tileAt(sx, sy);
    fn(t.x, t.y, NO_MODS);
  }

  private mods(e: MouseEvent): PointerMods {
    return { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey, alt: e.altKey };
  }

  private onDown(e: PointerEvent): void {
    const p = this.local(e);
    this.x = p.x;
    this.y = p.y;
    if (e.pointerType !== 'mouse') {
      this.touches.add(e.pointerId);
      this.hovering = false;
      this.inside = false;
      this.gestures.pointerDown(e.pointerId, p.x, p.y, e.timeStamp);
      return;
    }
    this.inside = true;
    this.hovering = true;
    if (e.button === 1 || e.button === 2) {
      this.panPointer = e.pointerId;
      this.lastX = p.x;
      this.lastY = p.y;
      this.el.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button === 0) {
      this.buildPointer = e.pointerId;
      this.el.setPointerCapture(e.pointerId);
      const t = this.tileAt(p.x, p.y);
      this.handlers.onDown(t.x, t.y, this.mods(e));
    }
  }

  private onMove(e: PointerEvent): void {
    const p = this.local(e);
    this.x = p.x;
    this.y = p.y;
    if (this.touches.has(e.pointerId)) {
      this.gestures.pointerMove(e.pointerId, p.x, p.y);
      return;
    }
    if (e.pointerType === 'touch') return;
    this.inside = true;
    this.hovering = true;
    if (this.panPointer === e.pointerId) {
      this.camera.panScreen(p.x - this.lastX, p.y - this.lastY);
      this.lastX = p.x;
      this.lastY = p.y;
    }
    const t = this.tileAt(p.x, p.y);
    this.handlers.onMove(t.x, t.y, this.mods(e));
  }

  private onUp(e: PointerEvent): void {
    if (this.touches.delete(e.pointerId)) {
      const p = this.local(e);
      this.gestures.pointerUp(e.pointerId, p.x, p.y);
      return;
    }
    if (this.panPointer === e.pointerId) this.panPointer = null;
    if (this.buildPointer === e.pointerId && e.button === 0) {
      this.buildPointer = null;
      const p = this.local(e);
      const t = this.tileAt(p.x, p.y);
      this.handlers.onUp(t.x, t.y, this.mods(e));
    }
    if (this.el.hasPointerCapture(e.pointerId)) this.el.releasePointerCapture(e.pointerId);
  }

  private onCancel(e: PointerEvent): void {
    if (this.touches.delete(e.pointerId)) {
      this.gestures.pointerCancel(e.pointerId);
      return;
    }
    if (this.panPointer === e.pointerId) this.panPointer = null;
    if (this.buildPointer === e.pointerId) {
      this.buildPointer = null;
      this.handlers.onCancel?.();
    }
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    // Shift+wheel often arrives as a horizontal scroll.
    const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
    if (this.handlers.onWheel?.(delta, this.mods(e))) return;
    // Normalise line/page deltas to pixels.
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.camera.viewH : 1;
    const p = this.local(e);
    this.camera.zoomAt(p.x, p.y, Math.exp(-e.deltaY * unit * CAMERA.wheelZoomRate));
  }
}
