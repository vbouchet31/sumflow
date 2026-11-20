import { BUILDINGS } from '../config/buildings';
import {
  DIRS,
  type Dir,
  DX,
  DY,
  E,
  isInBounds,
  key,
  N,
  normalizeRot,
  opposite,
  type Rot,
  S,
  W,
} from '../core/grid';
import {
  axisOf,
  type Belt,
  type Building,
  buildingSize,
  dirMask,
  footprintTiles,
  hasOutput,
  isInputKind,
  isOutputKind,
  type LocalPortFace,
  localPortFaces,
  portKey,
} from '../sim/entities';
import { isBuildingUnlocked } from '../sim/state';
import type { World } from '../sim/world';
import {
  applyBeltPlan,
  computeLPath,
  isStraightBelt,
  type PathTile,
  type PlannedBelt,
  type PlanStatus,
} from './beltPath';
import { type BuildingPlan, centredOrigin } from './placement';

/** How far back along a belt line a moved building may pull it (tiles). */
const MAX_CHAIN = 24;

/**
 * Moving (or rotating) a building with its belts (see docs/DECISIONS.md, "Sélection et
 * déplacement"). Every belt line that feeds one of its ports, or starts at one, is
 * stretched or shortened like a rubber band so it reaches the same port at the new place.
 * A line that cannot reach it stays where it is, disconnected.
 */
export interface MovePlan {
  id: number;
  /** The building at its new place; `ok` false when the footprint is taken. */
  building: BuildingPlan;
  /** Belts written (rerouted ends), with their final outputs. */
  belts: PlannedBelt[];
  /** Belt tiles removed (the part of a line the building no longer needs). */
  removed: { x: number; y: number }[];
  /** Ends of lines that could not follow: left as they are, drawn in red. */
  broken: { x: number; y: number; dir: Dir }[];
}

/** Buildings that can be moved: not the hub, not an extractor (tied to its deposit). */
export function isMovable(b: Building): boolean {
  return b.type !== 'hub' && b.type !== 'extractor';
}

/** Can the player rotate it in place? */
export function isRotatable(b: Building): boolean {
  return isMovable(b) && BUILDINGS[b.type].rotatable;
}

/** Origin of `b` turned by `delta` quarter turns around its middle tile. */
export function rotatedOrigin(b: Building, delta: number): { x: number; y: number; rot: Rot } {
  const size = buildingSize(b.type, b.rot);
  const cx = b.x + Math.floor((size.w - 1) / 2);
  const cy = b.y + Math.floor((size.h - 1) / 2);
  const rot = normalizeRot(b.rot + delta);
  return { ...centredOrigin(b.type, cx, cy, rot), rot };
}

/** A line of belts attached to a port: `chain[0]` touches the port, then away from it. */
interface Link {
  port: LocalPortFace;
  /** True when the line feeds the port, false when the port feeds the line. */
  input: boolean;
  chain: Belt[];
}

/** Lanes pushing into tile `(x, y)`: plain belts (`belt`) or bridge lanes (`belt` null). */
function feeders(
  world: World,
  x: number,
  y: number,
): { x: number; y: number; belt: Belt | null }[] {
  const out: { x: number; y: number; belt: Belt | null }[] = [];
  for (const side of DIRS) {
    const push = opposite(side);
    const nx = x + DX[side];
    const ny = y + DY[side];
    const lane = world.laneAt(nx, ny, axisOf(push));
    if (lane && hasOutput(lane.belt, push)) {
      out.push({ x: nx, y: ny, belt: world.beltAt(nx, ny) });
    }
  }
  return out;
}

function singleDir(b: Belt): Dir | null {
  for (const d of DIRS) if (b.outputs === dirMask(d)) return d;
  return null;
}

/** The belt lines attached to the ports of `b`, where it is now. */
function findLinks(world: World, b: Building): Link[] {
  const links: Link[] = [];
  const mine = (x: number, y: number): boolean => world.occupancy.get(key(x, y)) === b.id;
  for (const port of localPortFaces(b.type, b.x, b.y, b.rot, b.mirror === true)) {
    const nx = port.x + DX[port.face];
    const ny = port.y + DY[port.face];
    const first = world.beltAt(nx, ny);
    if (!first) continue;
    const toPort = opposite(port.face);
    const takes = isInputKind(port.kind) || port.kind === 'dynamic';
    const gives = isOutputKind(port.kind) || port.kind === 'dynamic';
    const chain: Belt[] = [first];
    const seen = new Set([key(nx, ny)]);
    if (hasOutput(first, toPort)) {
      if (!takes) continue;
      // Upstream, while the line is a single file: one belt feeding, one output.
      for (let cur = first; chain.length < MAX_CHAIN;) {
        if (singleDir(cur) === null) break;
        const f = feeders(world, cur.x, cur.y);
        const up = f[0];
        if (f.length !== 1 || !up?.belt || seen.has(key(up.x, up.y))) break;
        chain.push(up.belt);
        seen.add(key(up.x, up.y));
        cur = up.belt;
      }
      links.push({ port, input: true, chain });
    } else {
      // A line starting at the port: nothing else feeds its first belt.
      if (!gives || feeders(world, nx, ny).length > 0) continue;
      for (let cur = first; chain.length < MAX_CHAIN;) {
        const d = singleDir(cur);
        if (d === null) break;
        const x = cur.x + DX[d];
        const y = cur.y + DY[d];
        const next = world.beltAt(x, y);
        if (!next || seen.has(key(x, y)) || mine(x, y) || feeders(world, x, y).length !== 1) break;
        chain.push(next);
        seen.add(key(x, y));
        cur = next;
      }
      links.push({ port, input: false, chain });
    }
  }
  return links;
}

/** A planned belt, and whether the line goes straight through its tile (a bridge can cross). */
interface RoutedBelt extends PlannedBelt {
  straight: boolean;
}

interface Candidate {
  /** Index of the belt kept in `chain` (the anchor); those before it are removed. */
  anchor: number;
  /** Port face reached at the new place. */
  target: LocalPortFace;
  belts: RoutedBelt[];
  cost: number;
}

/** What the planner knows while it routes the lines one after the other. */
interface Routing {
  world: World;
  id: number;
  /** Footprint at the new place. */
  newFoot: Set<number>;
  /** Port keys of faces that push items out, at the new place. */
  newOutputs: Set<number>;
  /** Tiles written by the lines already routed (null: kept free, in front of a port). */
  reserved: Map<number, RoutedBelt | null>;
  /** Belts removed by the lines already routed. */
  freed: Set<number>;
  /** Belts of the lines not routed yet: obstacles. */
  linked: Set<number>;
  bridges: boolean;
}

/** Longest rerouted stretch, in tiles: beyond it the line is left behind. */
const MAX_STRETCH = 160;

/**
 * Plan moving building `id` to origin `(x, y)` with rotation `rot`. Null when the building
 * cannot be moved.
 */
export function planMove(
  world: World,
  id: number,
  x: number,
  y: number,
  rot: Rot,
): MovePlan | null {
  const b = world.state.buildings.get(id);
  if (!b || !isMovable(b)) return null;
  const mirror = b.mirror === true;
  const r: Rot = BUILDINGS[b.type].rotatable ? normalizeRot(rot) : 0;
  const foot = footprintTiles(b.type, x, y, r, mirror);
  const newFoot = new Set(foot.map((t) => key(t.x, t.y)));
  const ok = foot.every((t) => {
    if (!isInBounds(t.x, t.y)) return false;
    const other = world.occupancy.get(key(t.x, t.y));
    return other === undefined || other === id;
  });
  const plan: MovePlan = {
    id,
    building: { type: b.type, x, y, rot: r, mirror, ok },
    belts: [],
    removed: [],
    broken: [],
  };
  if (!ok || (x === b.x && y === b.y && r === b.rot)) return plan;

  const ports = localPortFaces(b.type, x, y, r, mirror);
  const newOutputs = new Set(
    ports
      .filter((p) => isOutputKind(p.kind) || p.kind === 'dynamic')
      .map((p) => portKey(key(p.x, p.y), p.face)),
  );
  const links = findLinks(world, b);
  const bridges = isBuildingUnlocked(world.state, 'bridge');
  const attempt = (order: Link[]): Routed => {
    const ctx: Routing = {
      world,
      id,
      newFoot,
      newOutputs,
      reserved: new Map(),
      freed: new Set(),
      linked: new Set(),
      bridges,
    };
    return routeLinks(ctx, order, ports);
  };
  // The lines are routed one after the other, so the order matters: when one is left
  // behind, try again with each line first, and keep the best result.
  let best = attempt(links);
  for (let i = 1; i < links.length && best.broken.length > 0; i++) {
    const link = links[i];
    if (!link) continue;
    const other = attempt([link, ...links.filter((l) => l !== link)]);
    const better =
      other.broken.length < best.broken.length ||
      (other.broken.length === best.broken.length && other.belts.length < best.belts.length);
    if (better) best = other;
  }
  plan.belts = best.belts;
  plan.removed = best.removed;
  plan.broken = best.broken;
  return plan;
}

interface Routed {
  belts: PlannedBelt[];
  removed: { x: number; y: number }[];
  broken: { x: number; y: number; dir: Dir }[];
}

/** Route the lines in this order, each one around the ones before it. */
function routeLinks(ctx: Routing, links: Link[], ports: LocalPortFace[]): Routed {
  const out: Routed = { belts: [], removed: [], broken: [] };
  for (const l of links) for (const belt of l.chain) ctx.linked.add(key(belt.x, belt.y));
  const used = new Set<LocalPortFace>();
  for (const link of links) {
    const targets = ports.filter((p) => p.kind === link.port.kind && !used.has(p));
    const best = bestCandidate(ctx, link, targets);
    if (!best) {
      const first = link.chain[0];
      if (first && !ctx.newFoot.has(key(first.x, first.y))) {
        const dir = singleDir(first) ?? opposite(link.port.face);
        out.broken.push({ x: first.x, y: first.y, dir });
      }
      continue;
    }
    used.add(best.target);
    for (let i = 0; i < best.anchor; i++) {
      const belt = link.chain[i];
      if (!belt) continue;
      const k = key(belt.x, belt.y);
      ctx.freed.add(k);
      if (!ctx.newFoot.has(k)) out.removed.push({ x: belt.x, y: belt.y });
    }
    for (const belt of link.chain) ctx.linked.delete(key(belt.x, belt.y));
    const t = best.target;
    const front = key(t.x + DX[t.face], t.y + DY[t.face]);
    if (!ctx.reserved.has(front)) ctx.reserved.set(front, null);
    for (const belt of best.belts) {
      const k = key(belt.x, belt.y);
      // Crossing a line routed before: both become the lanes of a bridge.
      const crossed = ctx.reserved.get(k);
      if (crossed && belt.status === 'bridge') crossed.status = 'bridge';
      ctx.reserved.set(k, belt);
      out.belts.push(belt);
    }
  }
  // A removed tile that a rerouted belt reuses is not removed.
  out.removed = out.removed.filter((t) => !ctx.reserved.has(key(t.x, t.y)));
  return out;
}

/**
 * The cheapest way to bring `link` to one of the `targets` faces (same port kind): fewest
 * belts written and removed, the same face as before on a tie.
 */
function bestCandidate(ctx: Routing, link: Link, targets: LocalPortFace[]): Candidate | null {
  let best: Candidate | null = null;
  for (const target of targets) {
    const same = target.tile === link.port.tile && target.local === link.port.local;
    const own = new Set<number>();
    for (let a = 0; a < link.chain.length; a++) {
      const anchor = link.chain[a];
      if (!anchor) break;
      if (a > 0) {
        const prev = link.chain[a - 1];
        if (prev) own.add(key(prev.x, prev.y));
      }
      if (ctx.newFoot.has(key(anchor.x, anchor.y))) continue;
      // Output of the anchor toward the rest of the line (or the old port), replaced.
      const towardOld = a === 0 ? opposite(link.port.face) : dirTo(anchor, link.chain[a - 1]);
      for (const swap of [false, true]) {
        const belts = link.input
          ? routeIn(ctx, anchor, towardOld, target, swap, own)
          : routeOut(ctx, anchor, target, swap, own);
        if (!belts) continue;
        const cost = belts.length + a + (same ? 0 : 0.5);
        if (!best || cost < best.cost) best = { anchor: a, target, belts, cost };
      }
    }
  }
  return best;
}

function dirTo(from: Belt, to: Belt | undefined): Dir {
  if (!to) return E;
  if (to.x > from.x) return E;
  if (to.x < from.x) return W;
  return to.y > from.y ? S : N;
}

/**
 * A belt at `(x, y)` facing `dir` would catch the items of a building output face next to
 * it (of the moved building at its new place, or of another one). `self`: ignore the moved
 * building (the first belt of a line it feeds is there on purpose).
 */
function catchesOutput(ctx: Routing, x: number, y: number, dir: Dir, self: boolean): boolean {
  for (const side of DIRS) {
    if (side === dir) continue; // a belt pointing at a face takes nothing from it
    const nx = x + DX[side];
    const ny = y + DY[side];
    const face = opposite(side);
    const k = key(nx, ny);
    if (ctx.newFoot.has(k)) {
      if (!self && ctx.newOutputs.has(portKey(k, face))) return true;
      continue;
    }
    const ref = ctx.world.portAt(nx, ny, face);
    if (!ref || ref.building.id === ctx.id) continue;
    if (isOutputKind(ref.port.kind) || ref.port.kind === 'dynamic') return true;
  }
  return false;
}

/**
 * Status of path tile `i` of a rerouted line, or null when it cannot go there. `own`: belts
 * of the line itself that it may build over (they are removed).
 */
function tileStatus(
  ctx: Routing,
  path: readonly PathTile[],
  i: number,
  own: Set<number>,
  self: boolean,
): PlanStatus | null {
  const t = path[i];
  if (!t) return null;
  const { world } = ctx;
  const k = key(t.x, t.y);
  if (!isInBounds(t.x, t.y) || ctx.newFoot.has(k)) return null;
  const occ = world.occupancy.get(k);
  if (occ !== undefined && occ !== ctx.id) return null;
  if (catchesOutput(ctx, t.x, t.y, t.dir, self)) return null;
  // Straight through an existing belt or bridge: a bridge, as the belt tool does.
  const straight = isStraightThrough(path, i);
  const crossing = straight && ctx.bridges && !ctx.linked.has(k);
  if (ctx.reserved.has(k)) {
    const r = ctx.reserved.get(k);
    const across = r && r.straight && r.status === 'new' && axisOf(r.dir) !== axisOf(t.dir);
    return crossing && across ? 'bridge' : null;
  }
  const br = world.bridgeAt(t.x, t.y);
  if (br) return crossing && (axisOf(t.dir) === 0 ? br.h : br.v) === null ? 'bridge' : null;
  const belt = world.beltAt(t.x, t.y);
  if (!belt) return 'new';
  if (own.has(k) || (ctx.freed.has(k) && !ctx.linked.has(k))) return 'replace';
  const d = crossing ? isStraightBelt(world, belt) : null;
  return d !== null && axisOf(d) !== axisOf(t.dir) ? 'bridge' : null;
}

/** The line enters and leaves path tile `i` in the same direction (not an end). */
function isStraightThrough(path: readonly PathTile[], i: number): boolean {
  return i > 0 && i < path.length - 1 && path[i - 1]?.dir === path[i]?.dir;
}

/** Line feeding the port: from the anchor to the tile in front of the new port. */
function routeIn(
  ctx: Routing,
  anchor: Belt,
  towardOld: Dir,
  target: LocalPortFace,
  swap: boolean,
  own: Set<number>,
): RoutedBelt[] | null {
  const nx = target.x + DX[target.face];
  const ny = target.y + DY[target.face];
  const toPort = opposite(target.face);
  const path: PathTile[] =
    anchor.x === nx && anchor.y === ny
      ? [{ x: nx, y: ny, dir: toPort }]
      : computeLPath(anchor.x, anchor.y, nx, ny, swap);
  if (path.length > MAX_STRETCH) return null;
  const last = path[path.length - 1];
  const first = path[0];
  if (!last || !first) return null;
  const before = path[path.length - 2];
  // The last belt turns into the port; it cannot turn back where it came from.
  if (before && toPort === opposite(before.dir)) return null;
  last.dir = toPort;
  const planned: RoutedBelt[] = [];
  for (let i = 1; i < path.length; i++) {
    const t = path[i];
    const status = tileStatus(ctx, path, i, own, false);
    if (!t || !status) return null;
    planned.push({ ...t, status, outputs: dirMask(t.dir), straight: isStraightThrough(path, i) });
  }
  // The anchor turns toward the new path; it must not push into what feeds it.
  const ahead = ctx.world.laneAt(
    anchor.x + DX[first.dir],
    anchor.y + DY[first.dir],
    axisOf(first.dir),
  );
  if (path.length === 1 && ahead && hasOutput(ahead.belt, opposite(first.dir))) return null;
  const outputs = (anchor.outputs & ~dirMask(towardOld)) | dirMask(first.dir);
  return [{ ...first, status: 'replace', outputs, straight: false }, ...planned];
}

/** Line starting at the port: from the tile in front of the new port to the anchor. */
function routeOut(
  ctx: Routing,
  anchor: Belt,
  target: LocalPortFace,
  swap: boolean,
  own: Set<number>,
): RoutedBelt[] | null {
  const nx = target.x + DX[target.face];
  const ny = target.y + DY[target.face];
  if (anchor.x === nx && anchor.y === ny) {
    // The anchor is right in front of the new port: it must not point back into it.
    if (hasOutput(anchor, opposite(target.face))) return null;
    return catchesOutputElsewhere(ctx, anchor, target) ? null : [];
  }
  const path = computeLPath(nx, ny, anchor.x, anchor.y, swap);
  if (path.length > MAX_STRETCH) return null;
  const arrive = path[path.length - 2];
  // Entering the anchor head-on would block the line.
  if (!arrive || hasOutput(anchor, opposite(arrive.dir))) return null;
  const planned: RoutedBelt[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const t = path[i];
    // Only the first belt sits in front of the moved building on purpose.
    const status = tileStatus(ctx, path, i, own, i === 0);
    if (!t || !status) return null;
    planned.push({ ...t, status, outputs: dirMask(t.dir), straight: isStraightThrough(path, i) });
  }
  return planned;
}

/** The anchor would also sit in front of another building's output. */
function catchesOutputElsewhere(ctx: Routing, anchor: Belt, target: LocalPortFace): boolean {
  const d = singleDir(anchor) ?? opposite(target.face);
  return catchesOutput(ctx, anchor.x, anchor.y, d, true);
}

/** Apply a move plan as it was computed. Returns false when nothing was done. */
export function applyMove(world: World, plan: MovePlan): boolean {
  const b = world.state.buildings.get(plan.id);
  const { x, y, rot, ok } = plan.building;
  if (!b || !ok || (b.x === x && b.y === y && b.rot === rot)) return false;
  for (const t of plan.removed) world.removeBelt(t.x, t.y);
  world.moveBuilding(plan.id, x, y, rot);
  applyBeltPlan(world, plan.belts);
  return true;
}
