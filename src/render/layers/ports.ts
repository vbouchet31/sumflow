import { FONT_NUM, PORT_COLORS } from '../../config/colors';
import { DX, DY, opposite } from '../../core/grid';
import {
  axisOf,
  type Building,
  hasOutput,
  isInputKind,
  isOutputKind,
  type PortFace,
} from '../../sim/entities';
import type { World } from '../../sim/world';
import type { Camera } from '../camera';
import { LOD } from '../lod';

/** A port face joined to a belt that goes the right way. */
function isJoined(world: World, f: PortFace): boolean {
  const nx = f.x + DX[f.face];
  const ny = f.y + DY[f.face];
  const lane = world.laneAt(nx, ny, axisOf(f.face));
  if (!lane) return false;
  const pointsIn = hasOutput(lane.belt, opposite(f.face));
  return isInputKind(f.kind) ? pointsIn : !pointsIn;
}

/**
 * Port hints while the belt tool is in hand (PLAN §6.3): just outside every input face an
 * amber arrow pointing in (with its letter, A or B), outside every output face a green arrow
 * pointing out. Ports already joined are faint, free ones bright and gently pulsing, so the
 * places a belt can connect stand out. `pulse` ∈ [0, 1].
 */
export function drawPortHints(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  world: World,
  buildings: readonly Building[],
  pulse: number,
): void {
  if (cam.zoom < LOD.buildingText) return;
  const s = cam.scale;
  const size = 0.17 * s;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${0.22 * s}px ${FONT_NUM}`;
  for (const b of buildings) {
    if (b.type === 'extractor' || b.type === 'storage') continue;
    for (const f of world.buildingPorts.get(b.id) ?? []) {
      const input = isInputKind(f.kind);
      if (!input && !isOutputKind(f.kind)) continue;
      const joined = isJoined(world, f);
      // Centre of the arrow: just outside the face.
      const c = cam.worldToScreen(f.x + 0.5 + DX[f.face] * 0.78, f.y + 0.5 + DY[f.face] * 0.78);
      const d = input ? opposite(f.face) : f.face;
      const fx = DX[d];
      const fy = DY[d];
      const a = joined ? 0.3 : 0.75 + 0.25 * pulse;
      ctx.globalAlpha = a;
      ctx.fillStyle = input ? PORT_COLORS.input : PORT_COLORS.output;
      ctx.beginPath();
      ctx.moveTo(c.x + fx * size, c.y + fy * size);
      ctx.lineTo(c.x - fx * size - fy * size, c.y - fy * size + fx * size);
      ctx.lineTo(c.x - fx * size + fy * size, c.y - fy * size - fx * size);
      ctx.closePath();
      ctx.fill();
      if (!joined && (f.kind === 'A' || f.kind === 'B' || f.kind === 'Q' || f.kind === 'R')) {
        // Letter beside the arrow, away from the building.
        ctx.fillStyle = PORT_COLORS.label;
        ctx.fillText(f.kind, c.x + DX[f.face] * 0.3 * s - fy * 0.0, c.y + DY[f.face] * 0.3 * s);
      }
    }
  }
  ctx.globalAlpha = 1;
}
