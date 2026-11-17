import { el } from './dom';

/** Diameter of the loupe (CSS pixels), its magnification and its distance above the finger. */
const SIZE = 132;
const ZOOM = 2;
const LIFT = 96;

/**
 * Touch loupe (PLAN-tactile §3): while a finger aims with a tool, a magnified disc of the
 * map under it floats above the finger, with a cross on the exact point, so the tile the
 * finger hides can be seen. Copies the map canvas after each frame; no extra drawing.
 */
export class Loupe {
  private readonly canvas = el('canvas', 'loupe');
  private readonly ctx: CanvasRenderingContext2D | null;

  constructor(
    root: HTMLElement,
    private readonly source: HTMLCanvasElement,
  ) {
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.hidden = true;
    this.ctx = this.canvas.getContext('2d');
    root.append(this.canvas);
  }

  /** Call after the map is drawn. `at`: the aiming finger, or null to hide the loupe. */
  update(at: { x: number; y: number } | null, viewW: number): void {
    const { canvas, ctx } = this;
    if (!at || !ctx) {
      canvas.hidden = true;
      return;
    }
    const dpr = this.source.width / Math.max(1, viewW);
    const px = Math.round(SIZE * dpr);
    if (canvas.width !== px) {
      canvas.width = px;
      canvas.height = px;
      canvas.style.width = `${SIZE}px`;
      canvas.style.height = `${SIZE}px`;
    }
    canvas.hidden = false;
    // Above the finger; below it near the top edge. Kept inside the screen sideways.
    const above = at.y - LIFT - SIZE / 2 >= 0;
    const cy = above ? at.y - LIFT : at.y + LIFT;
    const cx = Math.min(viewW - SIZE / 2 - 4, Math.max(SIZE / 2 + 4, at.x));
    canvas.style.transform = `translate(${cx - SIZE / 2}px, ${cy - SIZE / 2}px)`;

    const src = (SIZE / ZOOM) * dpr;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0f1422';
    ctx.fillRect(0, 0, px, px);
    ctx.drawImage(this.source, at.x * dpr - src / 2, at.y * dpr - src / 2, src, src, 0, 0, px, px);
    // Cross on the aimed point.
    const c = px / 2;
    const arm = 9 * dpr;
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = 'rgba(10, 14, 26, 0.9)';
    this.cross(ctx, c, arm);
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeStyle = '#ffffff';
    this.cross(ctx, c, arm);
  }

  private cross(ctx: CanvasRenderingContext2D, c: number, arm: number): void {
    ctx.beginPath();
    ctx.moveTo(c - arm, c);
    ctx.lineTo(c + arm, c);
    ctx.moveTo(c, c - arm);
    ctx.lineTo(c, c + arm);
    ctx.stroke();
  }
}
