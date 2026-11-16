import type { Camera } from '../render/camera';
import type { GameState } from '../sim/state';

export interface DebugContext {
  state: GameState;
  camera: Camera;
}

export interface DebugApi {
  getState: () => { state: GameState; camera: { x: number; y: number; zoom: number } };
}

declare global {
  interface Window {
    __sumflow?: DebugApi;
  }
}

export function isDebugEnabled(search: string): boolean {
  return import.meta.env.DEV || new URLSearchParams(search).get('debug') === '1';
}

/** Expose `window.__sumflow` (PLAN §13.4). Grows with each milestone. */
export function installDebugApi(ctx: DebugContext): void {
  window.__sumflow = {
    getState: () => ({
      state: structuredClone(ctx.state),
      camera: { x: ctx.camera.x, y: ctx.camera.y, zoom: ctx.camera.zoom },
    }),
  };
}
