import { BUILDING_COLORS, CHALK, COLORS, FONT_NUM } from '../../config/colors';
import { buildingSize, type Building, isOperator } from '../../sim/entities';
import type { GameState } from '../../sim/state';
import type { Camera } from '../camera';
import { itemColor } from '../itemColor';
import { LOD } from '../lod';
import { chalkSquare, shade, tileSeed } from '../chalk';
import { editionFrame } from '../editions';
import { drawHub } from './hub';
import { drawOperator } from './operators';
import { drawStorage } from './storage';

/**
 * Chalk colours of an extractor: the colour of its items, a little darker for the hatching.
 * Without a value (never on the map), the plain extractor colour.
 */
function extractorChalk(value: number | undefined): {
  wash: string;
  hatch: string;
  outline: string;
} {
  if (value === undefined) {
    const base = BUILDING_COLORS.extractor;
    return { wash: base, hatch: shade(base, 0.35), outline: shade(base, 0.65) };
  }
  const c = itemColor(value);
  return { wash: c, hatch: shade(c, -0.38), outline: shade(c, -0.12) };
}

/** Cycle-end flash duration in ticks (150 ms, PLAN §6.2). */
const FLASH_TICKS = 9;

/**
 * Extractor: a 3×3 block coloured with the chalk of its value (the colour of its items), its
 * value in white and notches on its 12 output faces.
 */
function drawExtractor(ctx: CanvasRenderingContext2D, cam: Camera, b: Building, alpha = 1): void {
  const s = cam.scale;
  const p = cam.worldToScreen(b.x, b.y);
  const inset = 0.1 * s;
  const value = b.extractValue;
  ctx.globalAlpha = alpha;
  const side = 3 * s - 2 * inset;
  // An edition keeps the colour of the items (what it produces) and adds its frame, glint
  // and mark in the edition chalk, as on every building.
  const seed = tileSeed(b.x, b.y);
  chalkSquare(ctx, p.x + inset, p.y + inset, side, seed, extractorChalk(value), {
    hatch: Math.max(1, 0.09 * s),
    outline: Math.max(1.5, 0.09 * s),
  });
  if (b.edition)
    editionFrame(ctx, b.edition, [{ x: p.x + inset, y: p.y + inset, s: side, seed }], s);
  if (cam.zoom >= LOD.buildingText) {
    // Output notches: small light bars on each outer face.
    ctx.fillStyle = CHALK.markFaint;
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
  if (cam.zoom >= LOD.buildingText && value !== undefined) {
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = String(value);
    ctx.font = `700 ${(text.length >= 3 ? 1.0 : 1.3) * s}px ${FONT_NUM}`;
    ctx.fillText(text, p.x + 1.5 * s, p.y + 1.55 * s);
  }
  ctx.globalAlpha = 1;
}

/**
 * One building as on the map (the hub excepted): also used for the ghost of the Edition
 * tool, a copy of the hovered building with its new edition.
 */
export function drawBuilding(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  b: Building,
  flash = 0,
): void {
  if (b.type === 'extractor') drawExtractor(ctx, cam, b);
  else if (b.type === 'storage') drawStorage(ctx, cam, b);
  else if (isOperator(b.type)) {
    drawOperator(ctx, cam, b.type, b.x, b.y, b.rot, {
      flash,
      mirror: b.mirror === true,
      edition: b.edition,
    });
  }
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
    if (b.type === 'hub') {
      drawHub(ctx, cam, state);
      continue;
    }
    const age = b.flashTick === undefined ? Infinity : state.tick - b.flashTick;
    drawBuilding(ctx, cam, b, !reducedMotion && age < FLASH_TICKS ? 1 - age / FLASH_TICKS : 0);
  }
}
