import { COLORS, FONT_NUM } from '../../config/colors';
import { type Dir, DX, DY, opposite } from '../../core/grid';
import { formatCompact } from '../../core/format';
import { type Belt, hasOutput } from '../../sim/entities';
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

/**
 * Items layer (PLAN §10.2 layer 5) with LOD (§10.3). `valuesAlways` (option) draws the
 * numbers on every disc instead of only from zoom 0.6.
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
  const r = dot ? 1 : 0.36 * s;
  if (withText) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
  }
  for (const b of belts) {
    const item = b.item;
    if (!item) continue;
    const p = itemPosition(cam, b, item.progress, item.from);
    ctx.fillStyle = itemColor(item.value);
    if (dot) {
      ctx.fillRect(p.x - r, p.y - r, 2 * r, 2 * r);
      continue;
    }
    if (withText) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.arc(p.x + 0.04 * s, p.y + 0.06 * s, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = itemColor(item.value);
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    if (withText) {
      const text = formatCompact(item.value);
      const fit =
        text.length <= 2 ? 0.42 : text.length === 3 ? 0.32 : text.length === 4 ? 0.25 : 0.2;
      ctx.font = `700 ${fit * s}px ${FONT_NUM}`;
      ctx.fillStyle = COLORS.text;
      ctx.fillText(text, p.x, p.y + 0.02 * s);
    }
  }
}
