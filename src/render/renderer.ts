import type { Ghost } from '../build/tools';
import { TICK_DT } from '../config/balance';
import { COLORS } from '../config/colors';
import { currentBeltSpeed } from '../sim/upgrades';
import type { World } from '../sim/world';
import type { Camera } from './camera';
import { drawBelts } from './layers/belts';
import { drawBuildings } from './layers/buildings';
import { drawDeposits } from './layers/deposits';
import { drawGhosts } from './layers/ghosts';
import { drawGrid } from './layers/grid';
import { drawItems } from './layers/items';
import { drawWave } from './layers/wave';

/** Maximum device pixel ratio honoured by the canvas (PLAN §10.4). */
const MAX_DPR = 2;

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  /** Time (ms, same clock as `draw`'s `nowMs`) of the last level-complete wave. */
  waveStart: number | null = null;
  reducedMotion = false;

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

  /**
   * Draw one frame in layer order (PLAN §10.2). Reads the world, never mutates it.
   */
  draw(world: World, ghost: Ghost, nowMs: number): void {
    const { ctx, camera } = this;
    const { state } = world;
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, camera.viewW, camera.viewH);
    drawGrid(ctx, camera);
    drawDeposits(ctx, camera, world.deposits, state);
    const v = camera.visibleTiles(1);
    const belts = [...world.beltsInRect(v.x0, v.y0, v.x1, v.y1)];
    // Chevrons follow simulation time, so they stop when the game is paused.
    const phase = (state.tick * TICK_DT * currentBeltSpeed(state)) % 1;
    drawBelts(ctx, camera, belts, phase);
    drawBuildings(
      ctx,
      camera,
      world.buildingsInRect(v.x0, v.y0, v.x1, v.y1),
      state,
      this.reducedMotion,
    );
    drawItems(ctx, camera, belts);
    drawGhosts(ctx, camera, ghost);
    if (this.waveStart !== null && !this.reducedMotion)
      drawWave(ctx, camera, nowMs - this.waveStart);
  }
}
