import { BUILDING_COLORS, COLORS, FONT_NUM } from '../../config/colors';
import { buildingSize, type Building, isOperator } from '../../sim/entities';
import type { GameState } from '../../sim/state';
import type { Camera } from '../camera';
import { LOD } from '../lod';
import { roundRect } from '../shapes';
import { drawHub } from './hub';
import { drawOperator } from './operators';
import { drawStorage } from './storage';

/** Cycle-end flash duration in ticks (150 ms, PLAN §6.2). */
const FLASH_TICKS = 9;

/** Extractor: rounded 3×3 block with the extracted value and notches on its 12 output faces. */
function drawExtractor(ctx: CanvasRenderingContext2D, cam: Camera, b: Building, alpha = 1): void {
  const s = cam.scale;
  const p = cam.worldToScreen(b.x, b.y);
  const inset = 0.1 * s;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = BUILDING_COLORS.extractor;
  roundRect(ctx, p.x + inset, p.y + inset, 3 * s - 2 * inset, 3 * s - 2 * inset, 0.7 * s);
  ctx.fill();
  if (cam.zoom >= LOD.buildingText) {
    // Output notches: small light bars on each outer face.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    const len = 0.36 * s;
    const th = 0.08 * s;
    for (let i = 0; i < 3; i++) {
      const mid = (i + 0.5) * s;
      ctx.fillRect(p.x + mid - len / 2, p.y + inset, len, th);
      ctx.fillRect(p.x + mid - len / 2, p.y + 3 * s - inset - th, len, th);
      ctx.fillRect(p.x + inset, p.y + mid - len / 2, th, len);
      ctx.fillRect(p.x + 3 * s - inset - th, p.y + mid - len / 2, th, len);
    }
  }
  if (cam.zoom >= LOD.buildingText && b.extractValue !== undefined) {
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = String(b.extractValue);
    ctx.font = `700 ${(text.length >= 3 ? 1.0 : 1.3) * s}px ${FONT_NUM}`;
    ctx.fillText(text, p.x + 1.5 * s, p.y + 1.55 * s);
  }
  ctx.globalAlpha = 1;
}

/** Buildings layer (PLAN §10.2 layer 4). */
export function drawBuildings(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  buildings: Iterable<Building>,
  state: GameState,
  reducedMotion = false,
): void {
  for (const b of buildings) {
    const size = buildingSize(b.type, b.rot);
    const p = cam.worldToScreen(b.x, b.y);
    if (
      p.x > cam.viewW ||
      p.y > cam.viewH ||
      p.x + size.w * cam.scale < 0 ||
      p.y + size.h * cam.scale < 0
    )
      continue;
    if (b.type === 'hub') drawHub(ctx, cam, state);
    else if (b.type === 'extractor') drawExtractor(ctx, cam, b);
    else if (b.type === 'storage') drawStorage(ctx, cam, b);
    else if (isOperator(b.type)) {
      const age = b.flashTick === undefined ? Infinity : state.tick - b.flashTick;
      const flash = !reducedMotion && age < FLASH_TICKS ? 1 - age / FLASH_TICKS : 0;
      drawOperator(ctx, cam, b.type, b.x, b.y, b.rot, { flash, mirror: b.mirror === true });
    }
  }
}
