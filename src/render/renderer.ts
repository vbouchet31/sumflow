import { COLORS } from '../config/colors';

/** Maximum device pixel ratio honoured by the canvas (PLAN §10.4). */
const MAX_DPR = 2;

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private cssWidth = 0;
  private cssHeight = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
  }

  resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void {
    const dpr = Math.min(MAX_DPR, Math.max(1, devicePixelRatio));
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.canvas.width = Math.round(cssWidth * dpr);
    this.canvas.height = Math.round(cssHeight * dpr);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(): void {
    const { ctx } = this;
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);
  }
}
