import { CAMERA } from '../config/keymap';
import type { Camera } from '../render/camera';

/** Right or middle button drag pans; the wheel zooms around the cursor (PLAN §8.1). */
export class Mouse {
  private dragPointer: number | null = null;
  private lastX = 0;
  private lastY = 0;
  /** Last known cursor position in CSS pixels, relative to the canvas. */
  x = 0;
  y = 0;

  constructor(
    private readonly el: HTMLElement,
    private readonly camera: Camera,
  ) {
    el.addEventListener('pointerdown', (e) => this.onDown(e));
    el.addEventListener('pointermove', (e) => this.onMove(e));
    el.addEventListener('pointerup', (e) => this.onUp(e));
    el.addEventListener('pointercancel', (e) => this.onUp(e));
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

  private onDown(e: PointerEvent): void {
    if (e.button !== 1 && e.button !== 2) return;
    this.dragPointer = e.pointerId;
    const p = this.local(e);
    this.lastX = p.x;
    this.lastY = p.y;
    this.el.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  private onMove(e: PointerEvent): void {
    const p = this.local(e);
    this.x = p.x;
    this.y = p.y;
    if (this.dragPointer !== e.pointerId) return;
    this.camera.panScreen(p.x - this.lastX, p.y - this.lastY);
    this.lastX = p.x;
    this.lastY = p.y;
  }

  private onUp(e: PointerEvent): void {
    if (this.dragPointer !== e.pointerId) return;
    this.dragPointer = null;
    if (this.el.hasPointerCapture(e.pointerId)) this.el.releasePointerCapture(e.pointerId);
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    // Normalise line/page deltas to pixels.
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.camera.viewH : 1;
    const p = this.local(e);
    this.camera.zoomAt(p.x, p.y, Math.exp(-e.deltaY * unit * CAMERA.wheelZoomRate));
  }
}
