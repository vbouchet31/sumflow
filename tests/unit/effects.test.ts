import { describe, expect, it } from 'vitest';
import { ToolController, type ToolEvents } from '../../src/build/tools';
import type { Footprint, Touched } from '../../src/build/touched';
import { EFFECTS } from '../../src/config/effects';
import { E } from '../../src/core/grid';
import { Camera } from '../../src/render/camera';
import {
  beltDustTiles,
  effectEvents,
  Effects,
  spongePath,
  tileRuns,
} from '../../src/render/layers/effects';
import { deserialize, serialize } from '../../src/save/serialize';
import { runTicks } from '../../src/sim/tick';
import { World } from '../../src/sim/world';
import type { World as WorldType } from '../../src/sim/world';
import { DepositMap } from '../../src/world/chunks';
import { beltLine, makeWorld } from './helpers/scenario';

const NO_MODS = { ctrl: false, shift: false, alt: false };
const DUST_END = EFFECTS.dust.maxLifeMs + EFFECTS.dust.staggerMs;

function unlockAll(world: WorldType): void {
  world.state.unlockedBuildings.push(
    'adder',
    'multiplier',
    'subtractor',
    'divider',
    'exponent',
    'storage',
    'bridge',
  );
  world.state.unlockedFeatures.push('priorities');
}

/** A tool controller whose events are recorded. */
function recorded(world: WorldType): { tools: ToolController; log: [string, unknown][] } {
  const log: [string, unknown][] = [];
  const events: ToolEvents = {
    onBuild: (t) => log.push(['build', t]),
    onDemolish: (t) => log.push(['demolish', t]),
    onClear: (n, area) => log.push(['clear', { n, area }]),
    onRestore: (t) => log.push(['restore', t]),
  };
  return { tools: new ToolController(world, events), log };
}

function click(tools: ToolController, x: number, y: number): void {
  tools.pointerMove(x, y, NO_MODS);
  tools.pointerDown(x, y, NO_MODS);
  tools.pointerUp(x, y, NO_MODS);
}

function drag(tools: ToolController, x0: number, y0: number, x1: number, y1: number): void {
  tools.pointerMove(x0, y0, NO_MODS);
  tools.pointerDown(x0, y0, NO_MODS);
  tools.pointerMove(x1, y1, NO_MODS);
  tools.pointerUp(x1, y1, NO_MODS);
}

const building = (x: number, y: number, w: number, h: number, type: Footprint['type']) => ({
  x,
  y,
  w,
  h,
  type,
});

/** A canvas context that accepts every call and counts the drawing ones. */
function stubContext(): { ctx: CanvasRenderingContext2D; draws: () => number } {
  let draws = 0;
  const counted = new Set(['stroke', 'fill', 'fillRect']);
  const ctx = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (typeof prop !== 'string') return undefined;
        return (..._args: unknown[]) => {
          if (counted.has(prop)) draws++;
        };
      },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, draws: () => draws };
}

function cameraAt(x: number, y: number, zoom: number): Camera {
  const cam = new Camera();
  cam.setViewport(1000, 640);
  cam.centerOn(x, y);
  cam.zoom = zoom;
  return cam;
}

describe('what an action touched (tool events)', () => {
  it('reports the footprint of a building placed with the tool', () => {
    const world = makeWorld();
    unlockAll(world);
    const { tools, log } = recorded(world);
    tools.setTool('adder');
    click(tools, 20, 20);
    const b = world.buildingAt(20, 20);
    expect(b).not.toBeNull();
    expect(log).toEqual([
      [
        'build',
        { placed: [building(b?.x ?? 0, b?.y ?? 0, 2, 2, 'adder')], removed: [], area: null },
      ],
    ]);
  });

  it('reports the tiles of a belt path, and nothing for a copy or a priority', () => {
    const world = makeWorld();
    unlockAll(world);
    const { tools, log } = recorded(world);
    tools.setTool('belt');
    drag(tools, 20, 20, 25, 20);
    const touched = log[0]?.[1] as Touched;
    expect(touched.placed.map((f) => `${f.x},${f.y},${f.type}`)).toEqual(
      [20, 21, 22, 23, 24, 25].map((x) => `${x},20,belt`),
    );
    tools.setTool('copy');
    drag(tools, 20, 20, 25, 20);
    expect(log[1]).toEqual(['build', { placed: [], removed: [], area: null }]);
  });

  it('reports what a demolition removed, and the zone of a zone demolition', () => {
    const world = makeWorld();
    unlockAll(world);
    world.addBuilding('multiplier', 20, 20, 0);
    beltLine(world, 20, 24, E, 4);
    const { tools, log } = recorded(world);
    tools.pointerMove(21, 20, NO_MODS);
    tools.deletePressed();
    expect(log[0]).toEqual([
      'demolish',
      { placed: [], removed: [building(20, 20, 3, 1, 'multiplier')], area: null },
    ]);
    tools.setTool('demolish');
    drag(tools, 19, 23, 30, 26);
    const zone = log[1]?.[1] as Touched;
    expect(zone.area).toEqual({ x0: 19, y0: 23, x1: 30, y1: 26 });
    expect(zone.removed).toHaveLength(4);
  });

  it('reports the zone of a clear and of a cut', () => {
    const world = makeWorld();
    unlockAll(world);
    beltLine(world, 20, 24, E, 4);
    const { tools, log } = recorded(world);
    tools.setTool('clear');
    drag(tools, 19, 23, 24, 25);
    expect(log[0]).toEqual(['clear', { n: 0, area: { x0: 19, y0: 23, x1: 24, y1: 25 } }]);
    tools.setTool('cut');
    drag(tools, 19, 23, 24, 25);
    expect(log[1]?.[0]).toBe('demolish');
    expect((log[1]?.[1] as Touched).area).toEqual({ x0: 19, y0: 23, x1: 24, y1: 25 });
  });

  it('undo wipes what comes off, redo dusts what comes back', () => {
    const world = makeWorld();
    unlockAll(world);
    const { tools, log } = recorded(world);
    tools.setTool('adder');
    click(tools, 20, 20);
    const placed = (log[0]?.[1] as Touched).placed;
    tools.undo();
    expect(log[1]).toEqual(['restore', { placed: [], removed: placed, area: null }]);
    tools.redo();
    expect(log[2]).toEqual(['restore', { placed, removed: [], area: null }]);
    // Nothing left to redo: no event.
    tools.redo();
    expect(log).toHaveLength(3);
  });

  it('a moved building is placed again, its old belts are not wiped', () => {
    const world = makeWorld();
    unlockAll(world);
    const b = world.addBuilding('adder', 20, 20, 0);
    const { tools, log } = recorded(world);
    tools.select(20, 20);
    tools.pointerMove(20, 20, NO_MODS);
    tools.pointerDown(20, 20, NO_MODS);
    tools.pointerMove(26, 20, NO_MODS);
    tools.pointerUp(26, 20, NO_MODS);
    expect(log[0]?.[0]).toBe('build');
    expect((log[0]?.[1] as Touched).placed).toEqual([building(26, 20, 2, 2, 'adder')]);
    expect(world.state.buildings.get(b?.id ?? -1)?.x).toBe(26);
  });
});

describe('chalk effects', () => {
  it('a puff of dust per building, gone after its last grain', () => {
    const fx = new Effects();
    fx.dust([building(0, 0, 2, 2, 'adder'), building(5, 5, 3, 3, 'storage')], 1000);
    expect(fx.size).toBe(2);
    expect(fx.grains).toBeGreaterThanOrEqual(2 * EFFECTS.dust.minGrains);
    fx.prune(1000 + DUST_END);
    expect(fx.size).toBe(2);
    fx.prune(1000 + DUST_END + 1);
    expect(fx.size).toBe(0);
    expect(fx.grains).toBe(0);
  });

  it('a sponge per removed building, one stroke per straight run of belts', () => {
    const fx = new Effects();
    const belts = [0, 1, 2, 3].map((x) => building(x, 10, 1, 1, 'belt'));
    fx.sponge([building(0, 0, 2, 2, 'adder'), ...belts], null, 0);
    expect(fx.size).toBe(2);
    fx.prune(EFFECTS.sponge.lifeMs);
    expect(fx.size).toBe(2);
    fx.prune(EFFECTS.sponge.lifeMs + 1);
    expect(fx.size).toBe(0);
  });

  it('a zone is one sweep, whatever it held', () => {
    const fx = new Effects();
    const many = Array.from({ length: 5000 }, (_, i) =>
      building(i % 100, Math.floor(i / 100), 1, 1, 'belt'),
    );
    fx.sponge(many, { x0: 0, y0: 0, x1: 99, y1: 49 }, 0);
    expect(fx.size).toBe(1);
    fx.prune(EFFECTS.sweep.lifeMs + 1);
    expect(fx.size).toBe(0);
  });

  it('too many removed objects are wiped in one sweep', () => {
    const fx = new Effects();
    const scattered = Array.from({ length: 40 }, (_, i) =>
      building(i * 4, (i % 3) * 4, 2, 2, 'adder'),
    );
    fx.sponge(scattered, null, 0);
    expect(fx.size).toBe(1);
  });

  it('caps the effects and the grains alive', () => {
    const fx = new Effects();
    for (let i = 0; i < 200; i++) fx.sponge([building(i * 3, 0, 1, 1, 'belt')], null, i);
    expect(fx.size).toBe(EFFECTS.maxEffects);
    const dust = new Effects();
    for (let i = 0; i < 200; i++) dust.dust([building(i * 4, 0, 3, 3, 'storage')], i);
    expect(dust.grains).toBeLessThanOrEqual(EFFECTS.maxGrains);
    expect(dust.size).toBeLessThanOrEqual(EFFECTS.maxEffects);
    // A paste of many buildings only puffs the first few.
    const paste = new Effects();
    paste.dust(
      Array.from({ length: 100 }, (_, i) => building(i * 3, 0, 2, 2, 'adder')),
      0,
    );
    expect(paste.size).toBe(EFFECTS.dust.maxPuffsPerAction);
  });

  it('belts get a few grains only: at their ends and on some tiles', () => {
    const path = Array.from({ length: 60 }, (_, i) => ({ x: i, y: 0 }));
    const tiles = beltDustTiles(path);
    expect(tiles.length).toBeLessThanOrEqual(EFFECTS.beltDust.maxPuffsPerAction);
    expect(tiles.slice(0, 2)).toEqual([
      { x: 0, y: 0 },
      { x: 59, y: 0 },
    ]);
    // Stable: the same path gives the same tiles.
    expect(beltDustTiles(path)).toEqual(tiles);
    const fx = new Effects();
    fx.dust(
      path.map((t) => building(t.x, t.y, 1, 1, 'belt')),
      0,
    );
    expect(fx.grains).toBe(tiles.length * EFFECTS.beltDust.grains);
  });

  it('nothing with reduced motion, and switching it on drops what is alive', () => {
    const fx = new Effects();
    fx.dust([building(0, 0, 2, 2, 'adder')], 0);
    fx.reducedMotion = true;
    expect(fx.size).toBe(0);
    fx.dust([building(0, 0, 2, 2, 'adder')], 0);
    fx.sponge([building(0, 0, 2, 2, 'adder')], { x0: 0, y0: 0, x1: 9, y1: 9 }, 0);
    expect(fx.size).toBe(0);
    expect(fx.grains).toBe(0);
  });

  it('draws while alive and on screen, and not below the zoom thresholds', () => {
    const fx = new Effects();
    fx.dust([building(0, 0, 2, 2, 'adder')], 0);
    fx.sponge([building(4, 0, 2, 2, 'adder')], null, 0);
    const near = stubContext();
    const cam = cameraAt(2, 1, 1);
    fx.drawUnder(near.ctx, cam, 100);
    fx.drawOver(near.ctx, cam, 100);
    expect(near.draws()).toBeGreaterThan(0);
    // Off screen: nothing drawn.
    const away = stubContext();
    fx.drawUnder(away.ctx, cameraAt(500, 500, 1), 100);
    fx.drawOver(away.ctx, cameraAt(500, 500, 1), 100);
    expect(away.draws()).toBe(0);
    // Zoomed out past the thresholds: nothing drawn (they still expire).
    const far = stubContext();
    fx.drawUnder(far.ctx, cameraAt(2, 1, EFFECTS.spongeMinZoom / 2), 100);
    fx.drawOver(far.ctx, cameraAt(2, 1, EFFECTS.spongeMinZoom / 2), 100);
    expect(far.draws()).toBe(0);
    expect(fx.size).toBe(2);
  });

  it('sponge paths are stable by position, and cover their rectangle', () => {
    const a = spongePath(10, 20, 3, 3, 1234, 'object');
    expect(spongePath(10, 20, 3, 3, 1234, 'object')).toEqual(a);
    expect(a.legs.length).toBeGreaterThanOrEqual(EFFECTS.sponge.minLegs);
    expect(a.legs.length).toBeLessThanOrEqual(EFFECTS.sponge.maxLegs);
    // The zigzag is joined: each stroke starts where the previous one ends.
    for (let i = 1; i < a.legs.length; i++) {
      expect(a.legs[i]?.ax).toBe(a.legs[i - 1]?.bx);
    }
    const zone = spongePath(0, 0, 128, 128, 99, 'zone');
    expect(zone.legs.length).toBeLessThanOrEqual(EFFECTS.sweep.maxLegs);
    expect(zone.width * zone.legs.length).toBeGreaterThanOrEqual(128);
  });

  it('splits belt tiles into straight runs', () => {
    const L = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
    ];
    expect(tileRuns(L)).toEqual([
      { x0: 0, y0: 0, x1: 2, y1: 0 },
      { x0: 2, y0: 1, x1: 2, y1: 2 },
    ]);
  });
});

describe('effects only follow the player', () => {
  it('loading a save, then running the game, plays nothing', () => {
    // A game built with the tools: effects play.
    const world = makeWorld(7);
    unlockAll(world);
    const fx = new Effects();
    const tools = new ToolController(
      world,
      effectEvents(fx, () => 0),
    );
    tools.setTool('adder');
    click(tools, 20, 20);
    tools.setTool('belt');
    drag(tools, 20, 22, 20, 28);
    expect(fx.size).toBeGreaterThan(0);

    // The same game loaded from its save, as at start-up: nothing plays.
    const { state } = deserialize(
      JSON.parse(JSON.stringify(serialize(world, { x: 0, y: 0, zoom: 1 }))),
    );
    const loaded = new World(state, new DepositMap(state.seed));
    const fresh = new Effects();
    const loadedTools = new ToolController(
      loaded,
      effectEvents(fresh, () => 0),
    );
    runTicks(loaded, 600); // includes what a catch-up would simulate
    expect(loaded.state.buildings.size).toBe(world.state.buildings.size);
    expect(fresh.size).toBe(0);
    // The undo history is not saved: undo cannot replay the build either.
    expect(loadedTools.undo()).toBe(false);
    expect(fresh.size).toBe(0);
  });
});
