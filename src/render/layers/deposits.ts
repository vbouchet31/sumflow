import { COLORS, FONT_NUM } from '../../config/colors';
import { CHUNK_SIZE } from '../../core/grid';
import type { GameState } from '../../sim/state';
import type { DepositMap } from '../../world/chunks';
import { type Deposit, isExtractable } from '../../world/deposits';
import type { Camera } from '../camera';
import { LOD } from '../lod';

/** Visible deposits: chunks in view plus a one-chunk margin (PLAN §10.4). */
function visibleDeposits(cam: Camera, map: DepositMap): Deposit[] {
  const { x0, y0, x1, y1 } = cam.visibleTiles();
  const cx0 = Math.floor(x0 / CHUNK_SIZE) - 1;
  const cy0 = Math.floor(y0 / CHUNK_SIZE) - 1;
  const cx1 = Math.floor(x1 / CHUNK_SIZE) + 1;
  const cy1 = Math.floor(y1 / CHUNK_SIZE) + 1;
  const out: Deposit[] = [];
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) out.push(...map.getChunk(cx, cy));
  }
  return out;
}

function drawLock(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const w = size;
  const h = size * 0.75;
  ctx.fillStyle = COLORS.depositLocked;
  ctx.strokeStyle = COLORS.depositLocked;
  ctx.lineWidth = Math.max(1, size * 0.16);
  ctx.beginPath();
  ctx.arc(x + w / 2, y, w * 0.3, Math.PI, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, size * 0.12);
  ctx.fill();
}

/**
 * Deposits layer (PLAN §4.3, §10.1). Squares are batched in a single path; text and
 * padlocks follow the LOD table.
 */
export function drawDeposits(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  map: DepositMap,
  state: GameState,
): void {
  const deposits = visibleDeposits(cam, map);
  const s = cam.scale;
  const inset = cam.zoom >= LOD.buildingText ? 0.08 * s : 0;
  const size = 3 * s - 2 * inset;
  const radius = cam.zoom >= LOD.buildingText ? 0.6 * s : 0;

  ctx.fillStyle = COLORS.deposit;
  ctx.beginPath();
  for (const d of deposits) {
    const p = cam.worldToScreen(d.x - 1, d.y - 1);
    if (p.x > cam.viewW || p.y > cam.viewH || p.x + 3 * s < 0 || p.y + 3 * s < 0) continue;
    if (radius > 0) ctx.roundRect(p.x + inset, p.y + inset, size, size, radius);
    else ctx.rect(p.x, p.y, Math.max(1, size), Math.max(1, size));
  }
  ctx.fill();

  if (cam.zoom < LOD.depositText) return;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const d of deposits) {
    const c = cam.worldToScreen(d.x + 0.5, d.y + 0.5);
    if (c.x < -2 * s || c.y < -2 * s || c.x > cam.viewW + 2 * s || c.y > cam.viewH + 2 * s)
      continue;
    const unlocked = isExtractable(d.value, state.maxExtraction);
    const text = String(d.value);
    const fontPx = (text.length >= 3 ? 1.05 : 1.35) * s;
    ctx.font = `700 ${fontPx}px ${FONT_NUM}`;
    ctx.fillStyle = unlocked ? COLORS.text : COLORS.depositLocked;
    ctx.fillText(text, c.x, c.y + 0.05 * s);
    if (!unlocked && cam.zoom >= LOD.buildingText) {
      const lock = 0.5 * s;
      drawLock(
        ctx,
        c.x + 1.5 * s - inset - lock - 0.18 * s,
        c.y + 1.5 * s - inset - 0.55 * s,
        lock,
      );
    }
  }
}
