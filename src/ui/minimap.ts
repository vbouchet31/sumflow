import { BUILDING_COLORS, COLORS } from '../config/colors';
import { CHUNK_SIZE } from '../core/grid';
import { t } from '../i18n';
import type { Camera } from '../render/camera';
import { itemColor } from '../render/itemColor';
import { buildingSize } from '../sim/entities';
import type { World } from '../sim/world';
import { isExtractable } from '../world/deposits';
import { el } from './dom';

/** Side of the minimap (CSS pixels) by size, redraw period, smallest area shown (tiles). */
const SIDES = { large: 180, small: 112 } as const;
const REDRAW_MS = 250;
const MIN_SPAN = 72;
/** Deposits are 3×3 tiles around their centre; past this many chunks they are not drawn. */
const DEPOSIT_HALF = 1;
const MAX_DEPOSIT_CHUNKS = 1600;

export type MinimapSize = keyof typeof SIDES;

/** What the player chose: open or closed, and its size. */
export interface MinimapState {
  open: boolean;
  size: MinimapSize;
}

/**
 * Minimap (`M`): the whole factory at a glance, fitted to what is built plus the current
 * view, with the view as a frame. Deposits show in the colour of their number (dim while
 * locked), to spot the next useful one. A press or a drag on it moves the camera there.
 * Under it, buttons make it smaller or larger and close it; closed, one button opens it.
 */
export class Minimap {
  private readonly box = el('section', 'minimap');
  private readonly canvas = el('canvas', 'minimap-canvas');
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly sizeBtn = el('button', 'minimap-btn minimap-size');
  private readonly closeBtn = el('button', 'minimap-btn minimap-close', '✕');
  private readonly openBtn = el('button', 'minimap-btn minimap-open', '▣');
  private last = -Infinity;
  /** World rectangle shown: top-left tile and tiles per pixel. */
  private view = { x: 0, y: 0, k: 1 };
  private dragging = false;
  /** False until the first draw: before it, `view` maps nothing. */
  private drawn = false;
  private state: MinimapState;

  constructor(
    root: HTMLElement,
    private readonly camera: Camera,
    start: MinimapState,
    /** Called when the player opens, closes or resizes it (to remember the choice). */
    private readonly onChange: (state: MinimapState) => void = () => {},
  ) {
    this.state = { ...start };
    this.box.setAttribute('aria-label', t('minimap.label'));
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', t('minimap.label'));
    const button = (btn: HTMLButtonElement, action: () => void): void => {
      btn.type = 'button';
      btn.addEventListener('click', (e) => {
        action();
        // Keyboard users keep the focus; a mouse or a finger leaves nothing highlighted.
        if (e.detail > 0) btn.blur();
        else this.focusVisibleButton();
      });
    };
    button(this.sizeBtn, () => this.setSize(this.state.size === 'large' ? 'small' : 'large'));
    button(this.closeBtn, () => this.setOpen(false));
    button(this.openBtn, () => this.setOpen(true));
    this.label(this.closeBtn, t('minimap.close'));
    this.label(this.openBtn, t('minimap.open'));
    const buttons = el('div', 'minimap-buttons', this.sizeBtn, this.closeBtn, this.openBtn);
    this.box.append(this.canvas, buttons);
    this.ctx = this.canvas.getContext('2d');
    root.append(this.box);
    const go = (e: PointerEvent): void => {
      if (!this.drawn) return;
      const r = this.canvas.getBoundingClientRect();
      const x = this.view.x + (e.clientX - r.left) * this.view.k;
      const y = this.view.y + (e.clientY - r.top) * this.view.k;
      this.camera.centerOn(x, y);
      this.last = -Infinity; // redraw the frame at once
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

  get open(): boolean {
    return this.state.open;
  }

  /** `M`: open or close. */
  toggle(): void {
    this.setOpen(!this.state.open);
  }

  setOpen(open: boolean): void {
    if (open === this.state.open) return;
    this.state.open = open;
    this.changed();
  }

  setSize(size: MinimapSize): void {
    if (size === this.state.size) return;
    this.state.size = size;
    this.changed();
  }

  private changed(): void {
    this.last = -Infinity;
    this.sync();
    this.onChange({ ...this.state });
  }

  private label(btn: HTMLButtonElement, text: string): void {
    btn.title = `${text} (M)`;
    btn.setAttribute('aria-label', text);
  }

  /** After a keyboard press, the button pressed may be gone: focus its replacement. */
  private focusVisibleButton(): void {
    (this.state.open ? this.closeBtn : this.openBtn).focus();
  }

  /** Phones (`ui-compact`) always get the small map: the large one would not fit. */
  private get compact(): boolean {
    return document.documentElement.classList.contains('ui-compact');
  }

  /** Side of the map on screen, in CSS pixels. */
  private side(): number {
    return SIDES[this.compact ? 'small' : this.state.size];
  }

  private sync(): void {
    const { open, size } = this.state;
    const side = this.side();
    this.box.classList.toggle('is-open', open);
    this.box.classList.toggle('is-small', size === 'small');
    this.canvas.hidden = !open;
    this.sizeBtn.hidden = !open || this.compact;
    this.closeBtn.hidden = !open;
    this.openBtn.hidden = open;
    // Sized at once: the browser's default 300×150 would cover the map until the first draw.
    this.canvas.style.width = `${side}px`;
    this.canvas.style.height = `${side}px`;
    const large = size === 'large';
    this.sizeBtn.textContent = large ? '−' : '+';
    this.sizeBtn.title = t(large ? 'minimap.shrink' : 'minimap.grow');
    this.sizeBtn.setAttribute('aria-label', t(large ? 'minimap.shrink' : 'minimap.grow'));
  }

  update(world: World, now: number): void {
    const { ctx } = this;
    if (!this.state.open || !ctx || now - this.last < REDRAW_MS) return;
    this.last = now;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const side = this.side();
    // The screen may have turned (phone layout on or off): follow it.
    if (this.canvas.style.width !== `${side}px`) this.sync();
    const px = Math.round(side * dpr);
    if (this.canvas.width !== px) {
      this.canvas.width = px;
      this.canvas.height = px;
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
    for (const b of world.state.buildings.values()) {
      const { w, h } = buildingSize(b.type, b.rot);
      grow(b.x, b.y);
      grow(b.x + w - 1, b.y + h - 1);
    }
    for (const b of world.state.belts.values()) grow(b.x, b.y);
    const span = Math.max(MIN_SPAN, x1 - x0 + 8, y1 - y0 + 8);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const k = span / side; // tiles per CSS pixel
    this.view = { x: cx - span / 2, y: cy - span / 2, k };
    this.drawn = true;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, side, side);
    const sx = (x: number): number => (x - this.view.x) / k;
    const sy = (y: number): number => (y - this.view.y) / k;
    this.drawDeposits(ctx, world, k, side);
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
    ctx.strokeRect(sx(v.x0), sy(v.y0), (v.x1 - v.x0) / k, (v.y1 - v.y0) / k);
  }

  /** Deposits in the frame, as squares in the colour of their number. */
  private drawDeposits(
    ctx: CanvasRenderingContext2D,
    world: World,
    k: number,
    sideCss: number,
  ): void {
    const { x, y } = this.view;
    const span = sideCss * k;
    const c0x = Math.floor((x - DEPOSIT_HALF) / CHUNK_SIZE);
    const c0y = Math.floor((y - DEPOSIT_HALF) / CHUNK_SIZE);
    const c1x = Math.floor((x + span + DEPOSIT_HALF) / CHUNK_SIZE);
    const c1y = Math.floor((y + span + DEPOSIT_HALF) / CHUNK_SIZE);
    if ((c1x - c0x + 1) * (c1y - c0y + 1) > MAX_DEPOSIT_CHUNKS) return;
    const side = Math.max(2, (2 * DEPOSIT_HALF + 1) / k);
    const max = world.state.maxExtraction;
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        for (const d of world.deposits.getChunk(cx, cy)) {
          ctx.globalAlpha = isExtractable(d.value, max) ? 0.9 : 0.25;
          ctx.fillStyle = itemColor(d.value);
          const px = (d.x + 0.5 - x) / k;
          const py = (d.y + 0.5 - y) / k;
          ctx.fillRect(px - side / 2, py - side / 2, side, side);
        }
      }
    }
    ctx.globalAlpha = 1;
  }
}
