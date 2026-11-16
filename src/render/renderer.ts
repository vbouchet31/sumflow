import { COLORS } from '../config/colors';
import type { GameState } from '../sim/state';
import type { Camera } from './camera';
import { drawGrid } from './layers/grid';
import { drawHub } from './layers/hub';

/** Maximum device pixel ratio honoured by the canvas (PLAN §10.4). */
const MAX_DPR = 2;

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera,
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
  }

  resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void {
    const dpr = Math.min(MAX_DPR, Math.max(1, devicePixelRatio));
    this.camera.setViewport(cssWidth, cssHeight);
    this.canvas.width = Math.round(cssWidth * dpr);
    this.canvas.height = Math.round(cssHeight * dpr);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Draw one frame. Reads the state, never mutates it (PLAN §13.2). */
  draw(state: GameState): void {
    const { ctx, camera } = this;
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, camera.viewW, camera.viewH);
    drawGrid(ctx, camera);
    drawHub(ctx, camera, state);
  }
}
