import { HUB } from '../config/balance';
import { BUILDING_COLORS } from '../config/colors';
import { CHUNK_SIZE } from '../core/grid';
import { t } from '../i18n';
import type { Camera } from '../render/camera';
import { itemColor } from '../render/itemColor';
import { buildingSize } from '../sim/entities';
import type { World } from '../sim/world';
import { isExtractable } from '../world/deposits';
import { el } from './dom';

/** CSS size of the map, in pixels. */
const SIZE = 184;
/** Redraw every this many frames (the map changes slowly). */
const EVERY = 12;
/** Smallest half-width shown, in tiles. */
const MIN_HALF = 48;
/** Margin around the factory and the view, in tiles. */
const MARGIN = 24;

/**
 * Minimap (proposal 18): deposits as coloured dots (dim when locked), belts, buildings, the
 * hub, and the part of the map on screen. It frames the factory and the view; a click or
 * a drag moves the camera there. `M` shows or hides it.
 */
export class Minimap {
  private readonly canvas = el('canvas', 'minimap-canvas');
  private readonly box = el('section', 'minimap', this.canvas);
  private readonly ctx: CanvasRenderingContext2D;
  private frame = 0;
  /** Frame of the last draw: world centre and tiles per pixel. */
  private view = { cx: 0, cy: 0, k: 1 };
  private dragging = false;

  constructor(
    root: HTMLElement,
    private readonly world: World,
    private readonly camera: Camera,
  ) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = SIZE * dpr;
    this.canvas.height = SIZE * dpr;
    this.canvas.style.width = `${SIZE}px`;
    this.canvas.style.height = `${SIZE}px`;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx = ctx;
    this.box.setAttribute('aria-label', t('minimap.label'));
    this.box.title = t('minimap.hint');
    const go = (e: PointerEvent): void => {
      const r = this.canvas.getBoundingClientRect();
      const { cx, cy, k } = this.view;
      this.camera.centerOn(
        cx + (e.clientX - r.left - SIZE / 2) * k,
        cy + (e.clientY - r.top - SIZE / 2) * k,
      );
      this.frame = 0;
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.canvas.setPointerCapture(e.pointerId);
      go(e);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (this.dragging) go(e);
    });
    this.canvas.addEventListener('pointerup', () => (this.dragging = false));
    root.append(this.box);
  }

  toggle(): void {
    this.box.hidden = !this.box.hidden;
    this.frame = 0;
  }

  update(): void {
    if (this.box.hidden || this.frame++ % EVERY !== 0) return;
    this.draw();
  }

  private draw(): void {
    const { ctx, world, camera } = this;
    const { state } = world;
    // Frame: the buildings and the camera view, with a margin, as a square.
    const v = camera.visibleTiles();
    let x0 = Math.min(v.x0, HUB.x);
    let y0 = Math.min(v.y0, HUB.y);
    let x1 = Math.max(v.x1, HUB.x + HUB.size);
    let y1 = Math.max(v.y1, HUB.y + HUB.size);
    for (const b of state.buildings.values()) {
      x0 = Math.min(x0, b.x);
      y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + 3);
      y1 = Math.max(y1, b.y + 3);
    }
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const half = Math.max(MIN_HALF, (x1 - x0) / 2 + MARGIN, (y1 - y0) / 2 + MARGIN);
    const k = (2 * half) / SIZE;
    this.view = { cx, cy, k };
    const px = (x: number): number => (x - cx) / k + SIZE / 2;
    const py = (y: number): number => (y - cy) / k + SIZE / 2;

    ctx.fillStyle = '#0b0f1b';
    ctx.fillRect(0, 0, SIZE, SIZE);
    // Deposits.
    const c0x = Math.floor((cx - half) / CHUNK_SIZE);
    const c1x = Math.floor((cx + half) / CHUNK_SIZE);
    const c0y = Math.floor((cy - half) / CHUNK_SIZE);
    const c1y = Math.floor((cy + half) / CHUNK_SIZE);
    const dot = Math.max(2, 3 / k);
    for (let gy = c0y; gy <= c1y; gy++) {
      for (let gx = c0x; gx <= c1x; gx++) {
        for (const d of world.deposits.getChunk(gx, gy)) {
          const open = isExtractable(d.value, state.maxExtraction);
          ctx.globalAlpha = open ? 0.95 : 0.25;
          ctx.fillStyle = itemColor(d.value);
          ctx.fillRect(px(d.x) - dot / 2, py(d.y) - dot / 2, dot, dot);
        }
      }
    }
    ctx.globalAlpha = 1;
    // Belts and bridges.
    ctx.fillStyle = '#56627e';
    const bs = Math.max(1, 1 / k);
    for (const b of state.belts.values()) ctx.fillRect(px(b.x), py(b.y), bs, bs);
    for (const b of state.bridges.values()) ctx.fillRect(px(b.x), py(b.y), bs, bs);
    // Buildings.
    for (const b of state.buildings.values()) {
      const size = buildingSize(b.type, b.rot);
      ctx.fillStyle =
        b.type === 'hub'
          ? '#3d8bfd'
          : ((BUILDING_COLORS as Record<string, string>)[b.type] ?? '#8090a8');
      ctx.fillRect(px(b.x), py(b.y), Math.max(2, size.w / k), Math.max(2, size.h / k));
    }
    // Markers.
    ctx.fillStyle = '#ffd866';
    for (const m of state.markers.values()) ctx.fillRect(px(m.x) - 1.5, py(m.y) - 1.5, 3, 3);
    // Camera view.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px(v.x0), py(v.y0), (v.x1 - v.x0) / k, (v.y1 - v.y0) / k);
  }
}
