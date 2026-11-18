import { BUILDING_COLORS, COLORS } from '../config/colors';
import { t } from '../i18n';
import type { Camera } from '../render/camera';
import { buildingSize } from '../sim/entities';
import type { World } from '../sim/world';
import { el } from './dom';

/** Side of the minimap (CSS pixels), redraw period, and smallest area it shows (tiles). */
const SIZE = 180;
const REDRAW_MS = 250;
const MIN_SPAN = 72;

/**
 * Minimap (`M`): the whole factory at a glance, fitted to what is built plus the current
 * view, with the view as a frame. A press or a drag on it moves the camera there.
 */
export class Minimap {
  private readonly box = el('section', 'minimap');
  private readonly canvas = el('canvas', 'minimap-canvas');
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly toggleBtn = el('button', 'minimap-toggle', '▣');
  private last = 0;
  /** World rectangle shown: top-left tile and tiles per pixel. */
  private view = { x: 0, y: 0, k: 1 };
  private dragging = false;
  open: boolean;

  constructor(
    root: HTMLElement,
    private readonly camera: Camera,
    startOpen: boolean,
  ) {
    this.open = startOpen;
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', t('minimap.label'));
    this.toggleBtn.type = 'button';
    this.toggleBtn.title = `${t('minimap.toggle')} (M)`;
    this.toggleBtn.setAttribute('aria-label', t('minimap.toggle'));
    this.toggleBtn.addEventListener('click', (e) => {
      this.toggle();
      if (e.detail > 0) this.toggleBtn.blur();
    });
    this.ctx = this.canvas.getContext('2d');
    this.box.append(this.canvas, this.toggleBtn);
    root.append(this.box);
    const go = (e: PointerEvent): void => {
      const r = this.canvas.getBoundingClientRect();
      const x = this.view.x + (e.clientX - r.left) * this.view.k;
      const y = this.view.y + (e.clientY - r.top) * this.view.k;
      this.camera.centerOn(x, y);
      this.last = 0; // redraw the frame at once
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.canvas.setPointerCapture(e.pointerId);
      go(e);
      e.preventDefault();
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (this.dragging) go(e);
    });
    const stop = (): void => {
      this.dragging = false;
    };
    this.canvas.addEventListener('pointerup', stop);
    this.canvas.addEventListener('pointercancel', stop);
    this.sync();
  }

  toggle(): void {
    this.open = !this.open;
    this.last = 0;
    this.sync();
  }

  private sync(): void {
    this.box.classList.toggle('is-open', this.open);
    this.canvas.hidden = !this.open;
    this.toggleBtn.setAttribute('aria-pressed', String(this.open));
  }

  update(world: World, now: number): void {
    const { ctx } = this;
    if (!this.open || !ctx || now - this.last < REDRAW_MS) return;
    this.last = now;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.round(SIZE * dpr);
    if (this.canvas.width !== px) {
      this.canvas.width = px;
      this.canvas.height = px;
      this.canvas.style.width = `${SIZE}px`;
      this.canvas.style.height = `${SIZE}px`;
    }
    // Fit what is built and what is seen.
    const cam = this.camera;
    const v = cam.visibleTiles();
    let x0 = v.x0;
    let y0 = v.y0;
    let x1 = v.x1;
    let y1 = v.y1;
    const grow = (x: number, y: number): void => {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    };
    for (const b of world.state.buildings.values()) grow(b.x, b.y);
    for (const b of world.state.belts.values()) grow(b.x, b.y);
    const span = Math.max(MIN_SPAN, x1 - x0 + 8, y1 - y0 + 8);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const k = span / SIZE; // tiles per CSS pixel
    this.view = { x: cx - span / 2, y: cy - span / 2, k };

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, SIZE, SIZE);
    const sx = (x: number): number => (x - this.view.x) / k;
    const sy = (y: number): number => (y - this.view.y) / k;
    const dot = Math.max(1, 1 / k);
    ctx.fillStyle = '#5b6b8f';
    for (const b of world.state.belts.values()) ctx.fillRect(sx(b.x), sy(b.y), dot, dot);
    ctx.fillStyle = '#7f90b8';
    for (const b of world.state.bridges.values()) ctx.fillRect(sx(b.x), sy(b.y), dot, dot);
    for (const b of world.state.buildings.values()) {
      const { w, h } = buildingSize(b.type, b.rot);
      ctx.fillStyle = b.type === 'hub' ? COLORS.hub : BUILDING_COLORS[b.type];
      ctx.fillRect(sx(b.x), sy(b.y), Math.max(2, w / k), Math.max(2, h / k));
    }
    for (const m of world.state.markers.values()) {
      ctx.fillStyle = '#ffd866';
      ctx.beginPath();
      ctx.arc(sx(m.x + 0.5), sy(m.y + 0.5), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // The camera's view.
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(sx(v.x0), sy(v.y0), (v.x1 - v.x0 + 1) / k, (v.y1 - v.y0 + 1) / k);
  }
}
