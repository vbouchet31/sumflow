import { CAMERA } from '../config/keymap';
import type { Camera } from '../render/camera';

export interface PointerMods {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}

export interface MouseHandlers {
  /** Left button, in world tile coordinates. */
  onDown: (tx: number, ty: number, mods: PointerMods) => void;
  onMove: (tx: number, ty: number, mods: PointerMods) => void;
  onUp: (tx: number, ty: number, mods: PointerMods) => void;
  /** Wheel; return true to consume it (no zoom). `delta` > 0 = scroll down. */
  onWheel?: (delta: number, mods: PointerMods) => boolean;
}

/**
 * Left button → tools; right or middle drag pans; wheel zooms around the cursor
 * (PLAN §8.1).
 */
export class Mouse {
  private panPointer: number | null = null;
  private buildPointer: number | null = null;
  private lastX = 0;
  private lastY = 0;
  /** Last known cursor position in CSS pixels, relative to the canvas. */
  x = 0;
  y = 0;
  inside = false;

  constructor(
    private readonly el: HTMLElement,
    private readonly camera: Camera,
    private readonly handlers: MouseHandlers,
  ) {
    el.addEventListener('pointerdown', (e) => this.onDown(e));
    el.addEventListener('pointermove', (e) => this.onMove(e));
    el.addEventListener('pointerup', (e) => this.onUp(e));
    el.addEventListener('pointercancel', (e) => this.onCancel(e));
    el.addEventListener('pointerleave', () => (this.inside = false));
    el.addEventListener('pointerenter', () => (this.inside = true));
    el.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    // Prevent middle-click autoscroll.
    el.addEventListener('mousedown', (e) => {
      if (e.button === 1) e.preventDefault();
    });
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

  private mods(e: MouseEvent): PointerMods {
    return { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey, alt: e.altKey };
  }

  private onDown(e: PointerEvent): void {
    const p = this.local(e);
    this.x = p.x;
    this.y = p.y;
    this.inside = true;
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
    this.inside = true;
    if (this.panPointer === e.pointerId) {
      this.camera.panScreen(p.x - this.lastX, p.y - this.lastY);
      this.lastX = p.x;
      this.lastY = p.y;
    }
    const t = this.tileAt(p.x, p.y);
    this.handlers.onMove(t.x, t.y, this.mods(e));
  }

  private onUp(e: PointerEvent): void {
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
    if (this.panPointer === e.pointerId) this.panPointer = null;
    if (this.buildPointer === e.pointerId) this.buildPointer = null;
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
