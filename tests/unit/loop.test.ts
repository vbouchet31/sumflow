import { describe, expect, it } from 'vitest';
import { CATCH_UP, TICK_DT, TICK_RATE } from '../../src/config/balance';
import { SimLoop } from '../../src/sim/loop';
import { makeWorld } from './helpers/scenario';

describe('simulation loop (PLAN §11.1)', () => {
  it('runs fixed 60 Hz steps and at most 8 ticks per frame', () => {
    const world = makeWorld();
    const loop = new SimLoop(world);
    expect(loop.advance(TICK_DT * 3 + 0.001)).toBe(3);
    expect(loop.advance(10)).toBe(8);
    expect(world.state.tick).toBe(11);
  });

  it('catches up a missed minute in batches of 600 ticks', () => {
    const world = makeWorld();
    const loop = new SimLoop(world);
    expect(loop.catchUpProgress).toBeNull();
    loop.queueCatchUp(60);
    expect(loop.catchUpProgress).toBe(0);
    const batches: number[] = [];
    while (loop.catchUpProgress !== null) batches.push(loop.advance(1 / 60));
    expect(batches).toEqual([600, 600, 600, 600, 600, 600]);
    expect(world.state.tick).toBe(60 * TICK_RATE);
    // Back to normal stepping afterwards.
    expect(loop.advance(TICK_DT + 0.001)).toBe(1);
  });

  it('caps the catch-up at 10 minutes', () => {
    const world = makeWorld();
    const loop = new SimLoop(world);
    loop.queueCatchUp(3 * 3600);
    let frames = 0;
    while (loop.catchUpProgress !== null) {
      loop.advance(1 / 60);
      frames++;
    }
    expect(world.state.tick).toBe(CATCH_UP.maxSeconds * TICK_RATE);
    expect(frames).toBe((CATCH_UP.maxSeconds * TICK_RATE) / CATCH_UP.ticksPerFrame);
  });

  it('reports progress and stops a batch early when the frame is over budget', () => {
    const world = makeWorld();
    const loop = new SimLoop(world);
    loop.queueCatchUp(20); // 1200 ticks
    const ran = loop.advance(1 / 60, () => true);
    expect(ran).toBeGreaterThan(0);
    expect(ran).toBeLessThan(CATCH_UP.ticksPerFrame);
    expect(loop.catchUpProgress).toBeCloseTo(ran / 1200, 10);
    while (loop.catchUpProgress !== null) loop.advance(1 / 60, () => true);
    expect(world.state.tick).toBe(1200);
  });

  it('owes nothing while paused, and keeps the debt if paused during a catch-up', () => {
    const world = makeWorld();
    const loop = new SimLoop(world);
    loop.paused = true;
    loop.queueCatchUp(60);
    expect(loop.catchUpProgress).toBeNull();
    loop.paused = false;
    loop.queueCatchUp(20);
    loop.advance(1 / 60);
    loop.paused = true;
    expect(loop.advance(1 / 60)).toBe(0);
    expect(world.state.tick).toBe(600);
    loop.paused = false;
    loop.advance(1 / 60);
    expect(world.state.tick).toBe(1200);
    expect(loop.catchUpProgress).toBeNull();
  });
});
