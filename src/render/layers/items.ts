import { COLORS, FONT_NUM } from '../../config/colors';
import { type Dir, DX, DY, opposite } from '../../core/grid';
import { formatCompact } from '../../core/format';
import { type Belt, hasOutput } from '../../sim/entities';
import { SpriteCache } from '../cache';
import type { Camera } from '../camera';
import { itemColor } from '../itemColor';
import { LOD } from '../lod';

/** Output the item is heading to, for drawing: round-robin's next output. */
function exitDir(b: Belt): Dir | null {
  if (b.priority !== null && hasOutput(b, b.priority)) return b.priority;
  for (let i = 0; i < 4; i++) {
    const d = ((b.rr + i) & 3) as Dir;
    if (hasOutput(b, d)) return d;
  }
  return null;
}

/** Screen position of a belt item: entry edge → centre → exit edge (PLAN §6.4). */
function itemPosition(
  cam: Camera,
  b: Belt,
  progress: number,
  from: Dir | null,
): { x: number; y: number } {
  const out = exitDir(b);
  const entry = from ?? (out === null ? null : opposite(out));
  let ox = 0;
  let oy = 0;
  if (progress < 0.5) {
    if (entry !== null) {
      const t = 0.5 - progress;
      ox = DX[entry] * t;
      oy = DY[entry] * t;
    }
  } else if (out !== null) {
    const t = progress - 0.5;
    ox = DX[out] * t;
    oy = DY[out] * t;
  }
  return cam.worldToScreen(b.x + 0.5 + ox, b.y + 0.5 + oy);
}

const sprites = new SpriteCache();
/** Disc centres per colour, reused between frames to avoid allocations. */
const batches = new Map<string, number[]>();

function batchOf(color: string): number[] {
  let list = batches.get(color);
  if (!list) {
    if (batches.size > 512) batches.clear();
    list = [];
    batches.set(color, list);
  }
  return list;
}

/** Text size of an item value, as a fraction of a tile. */
function textFit(text: string): number {
  return text.length <= 2 ? 0.42 : text.length === 3 ? 0.32 : text.length === 4 ? 0.25 : 0.2;
}

/** Disc with its shadow and value, centred in a square of `sizePx` device pixels. */
function paintItem(ctx: CanvasRenderingContext2D, value: number, s: number, sizePx: number): void {
  const c = sizePx / 2;
  const r = 0.36 * s;
  ctx.fillStyle = 'rgba(255, 47, 214, 0.35)';
  ctx.beginPath();
  ctx.arc(c + 0 * s, c + 0 * s, r * 1.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = itemColor(value);
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fill();
  const text = formatCompact(value);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${textFit(text) * s}px ${FONT_NUM}`;
  ctx.fillStyle = COLORS.text;
  ctx.fillText(text, c, c + 0.02 * s);
}

/**
 * Items layer (PLAN §10.2 layer 5) with LOD (§10.3). `valuesAlways` (option) draws the
 * numbers on every disc instead of only from zoom 0.6. Discs with a number come from a
 * sprite cache (one picture per value); plain discs and dots are filled one colour at a time.
 */
export function drawItems(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  belts: Iterable<Belt>,
  valuesAlways = false,
): void {
  if (cam.zoom < LOD.depositText) return;
  const s = cam.scale;
  const dot = cam.zoom < LOD.buildingText;
  const withText = cam.zoom >= LOD.full || (valuesAlways && !dot);

  if (withText) {
    const dpr = ctx.getTransform().a;
    const sd = s * dpr;
    // Room for the disc (radius 0.36) and its shadow, plus a pixel of margin.
    const sizePx = Math.ceil(0.86 * sd) + 2;
    const sizeCss = sizePx / dpr;
    const scaleKey = `${sd}`;
    for (const b of belts) {
      const item = b.item;
      if (!item) continue;
      const p = itemPosition(cam, b, item.progress, item.from);
      const value = item.value;
      const sprite = sprites.get(value, scaleKey, sizePx, (c) => paintItem(c, value, sd, sizePx));
      // Snapped to device pixels so the numbers stay sharp.
      ctx.drawImage(
        sprite,
        Math.round((p.x - sizeCss / 2) * dpr) / dpr,
        Math.round((p.y - sizeCss / 2) * dpr) / dpr,
        sizeCss,
        sizeCss,
      );
    }
    return;
  }

  for (const b of belts) {
    const item = b.item;
    if (!item) continue;
    const p = itemPosition(cam, b, item.progress, item.from);
    batchOf(itemColor(item.value)).push(p.x, p.y);
  }
  const r = dot ? 1 : 0.36 * s;
  for (const [color, list] of batches) {
    if (list.length === 0) continue;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < list.length; i += 2) {
      const x = list[i] as number;
      const y = list[i + 1] as number;
      if (dot) ctx.rect(x - r, y - r, 2 * r, 2 * r);
      else {
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
    }
    ctx.fill();
    list.length = 0;
  }
}
