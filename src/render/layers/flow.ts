import { FLOW_COLORS } from '../../config/colors';
import { buildingSize } from '../../sim/entities';
import type { FlowTrace } from '../../sim/trace';
import type { World } from '../../sim/world';
import type { Camera } from '../camera';

/**
 * Highlight of a traced line (hover without a tool): the rest of the map is dimmed, the
 * belts that feed the hovered one are tinted blue, those it leads to green, and the
 * buildings at both ends are outlined.
 */
export function drawFlow(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  world: World,
  flow: FlowTrace,
): void {
  const s = cam.scale;
  const ends: { x: number; y: number; w: number; h: number; sink: boolean }[] = [];
  for (const [ids, sink] of [
    [flow.sources, false],
    [flow.sinks, true],
  ] as const) {
    for (const id of ids) {
      const b = world.state.buildings.get(id);
      if (b) ends.push({ x: b.x, y: b.y, ...buildingSize(b.type, b.rot), sink });
    }
  }
  // Dim everything but the line and its ends (holes cut with even-odd filling).
  ctx.fillStyle = FLOW_COLORS.dim;
  ctx.beginPath();
  ctx.rect(0, 0, cam.viewW, cam.viewH);
  for (const t of flow.tiles) {
    const p = cam.worldToScreen(t.x, t.y);
    ctx.rect(p.x, p.y, s, s);
  }
  for (const e of ends) {
    const p = cam.worldToScreen(e.x, e.y);
    ctx.rect(p.x, p.y, e.w * s, e.h * s);
  }
  ctx.fill('evenodd');

  for (const t of flow.tiles) {
    const p = cam.worldToScreen(t.x, t.y);
    ctx.fillStyle = t.way === 0 ? FLOW_COLORS.here : t.way < 0 ? FLOW_COLORS.up : FLOW_COLORS.down;
    ctx.fillRect(p.x, p.y, s, s);
  }
  ctx.lineWidth = Math.max(2, 0.08 * s);
  for (const e of ends) {
    const p = cam.worldToScreen(e.x, e.y);
    ctx.strokeStyle = e.sink ? FLOW_COLORS.sinkEdge : FLOW_COLORS.sourceEdge;
    ctx.strokeRect(p.x + 1, p.y + 1, e.w * s - 2, e.h * s - 2);
  }
}
