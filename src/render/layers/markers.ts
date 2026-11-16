import { FONT_UI, MARKER_COLORS } from '../../config/colors';
import type { Marker } from '../../sim/clip';
import type { Camera } from '../camera';

/** Screen size of marker text, in CSS pixels (constant at every zoom, PLAN §10.2). */
const LABEL_PX = 13;

/**
 * Markers (PLAN §10.2 layer 8): a pin on the tile and its text in a pill above, at a
 * constant screen size so they stay readable when zoomed out.
 */
export function drawMarkers(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  markers: Iterable<Marker>,
): void {
  const v = cam.visibleTiles(2);
  ctx.font = `600 ${LABEL_PX}px ${FONT_UI}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const m of markers) {
    if (m.x < v.x0 || m.x > v.x1 || m.y < v.y0 || m.y > v.y1) continue;
    const c = cam.worldToScreen(m.x + 0.5, m.y + 0.5);
    const r = Math.max(4, Math.min(9, 0.25 * cam.scale));
    ctx.fillStyle = MARKER_COLORS.pin;
    ctx.strokeStyle = MARKER_COLORS.pinEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y - r);
    ctx.lineTo(c.x + r, c.y);
    ctx.lineTo(c.x, c.y + r);
    ctx.lineTo(c.x - r, c.y);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    const w = ctx.measureText(m.text).width + 12;
    const h = LABEL_PX + 8;
    const ly = c.y - r - 6 - h / 2;
    ctx.fillStyle = MARKER_COLORS.labelBg;
    ctx.beginPath();
    ctx.roundRect(c.x - w / 2, ly - h / 2, w, h, 6);
    ctx.fill();
    ctx.fillStyle = MARKER_COLORS.labelText;
    ctx.fillText(m.text, c.x, ly + 1);
  }
}
