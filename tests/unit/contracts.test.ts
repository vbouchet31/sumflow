import { describe, expect, it } from 'vitest';
import { CONTRACTS, TICK_RATE } from '../../src/config/balance';
import { boostFactor, drawContract, stepContracts } from '../../src/sim/contracts';
import { deliver, setLevel } from '../../src/sim/progression';
import { createInitialState } from '../../src/sim/state';
import { currentBeltSpeed } from '../../src/sim/upgrades';
import { deserialize, serialize } from '../../src/save/serialize';
import { validateSave } from '../../src/save/schema';
import { makeWorld } from './helpers/scenario';

function advance(s: ReturnType<typeof createInitialState>, seconds: number): void {
  for (let i = 0; i < seconds * TICK_RATE; i++) {
    s.tick += 1;
    stepContracts(s);
  }
}

describe('hub contracts', () => {
  it('wait for the level, then offer a deterministic contract', () => {
    const s = createInitialState(7);
    advance(s, 120);
    expect(s.contracts.current).toBeNull();
    setLevel(s, CONTRACTS.fromLevel);
    advance(s, CONTRACTS.firstDelay + 1);
    const c = s.contracts.current;
    expect(c).not.toBeNull();
    expect(c?.value).not.toBe(s.levelRequirement?.value);
    expect(c?.value).not.toBe(10);
    expect(drawContract(s, 1).value).toBe(c?.value);
  });

  it('fulfilling one grants the overdrive; it then wears off', () => {
    const s = createInitialState(7);
    setLevel(s, 5);
    advance(s, CONTRACTS.firstDelay + 1);
    const c = s.contracts.current;
    if (!c) throw new Error('no contract');
    const base = currentBeltSpeed(s);
    for (let i = 0; i < c.required; i++) deliver(s, c.value);
    expect(s.contracts.current).toBeNull();
    expect(s.contracts.completed).toBe(1);
    expect(boostFactor(s)).toBe(CONTRACTS.boostFactor);
    expect(currentBeltSpeed(s)).toBeCloseTo(base * CONTRACTS.boostFactor);
    advance(s, CONTRACTS.boostSeconds + 1);
    expect(boostFactor(s)).toBe(1);
  });

  it('expires without penalty and comes back after the cooldown', () => {
    const s = createInitialState(7);
    setLevel(s, 5);
    advance(s, CONTRACTS.firstDelay + 1);
    advance(s, CONTRACTS.duration + 1);
    expect(s.contracts.current).toBeNull();
    expect(s.contracts.failed).toBe(1);
    advance(s, CONTRACTS.cooldown + 1);
    expect(s.contracts.current?.index).toBe(2);
  });

  it('survives a save round trip', () => {
    const world = makeWorld(7);
    setLevel(world.state, 5);
    advance(world.state, CONTRACTS.firstDelay + 1);
    const data = validateSave(
      JSON.parse(JSON.stringify(serialize(world, { x: 0, y: 0, zoom: 1 }))),
    );
    expect(deserialize(data).state.contracts).toEqual(world.state.contracts);
  });
});
