import { describe, expect, it } from 'vitest';
import { DEMOS, type DemoId } from '../../src/tutorial/scenes';
import { DemoScript } from '../../src/tutorial/script';
import { HELP_TIPS } from '../../src/ui/help';

const ids = Object.keys(DEMOS) as DemoId[];

/** Play the whole script frame by frame (60 fps), then `extra` more seconds. */
function play(id: DemoId, touch: boolean, extra = 0): DemoScript {
  const script = new DemoScript(DEMOS[id], touch);
  let guard = 0;
  while (!script.done && guard++ < 10_000) script.advance(1000 / 60);
  for (let i = 0; i < extra * 60; i++) script.advance(1000 / 60);
  return script;
}

describe('tutorial demos', () => {
  for (const id of ids) {
    for (const touch of [false, true]) {
      it(`${id} (${touch ? 'finger' : 'mouse'}): the scripted factory delivers its target`, () => {
        const script = play(id, touch);
        expect(script.done).toBe(true);
        expect(script.delivered.get(DEMOS[id].target) ?? 0).toBeGreaterThan(0);
        // The scene's own objects are all in view.
        const { view } = DEMOS[id];
        for (const b of script.world.state.buildings.values()) {
          if (b.type === 'hub') continue;
          expect(b.x).toBeGreaterThanOrEqual(view.x0);
          expect(b.y).toBeGreaterThanOrEqual(view.y0);
          expect(b.x).toBeLessThanOrEqual(view.x1);
          expect(b.y).toBeLessThanOrEqual(view.y1);
        }
        for (const belt of script.world.state.belts.values()) {
          expect(belt.x).toBeGreaterThanOrEqual(view.x0);
          expect(belt.x).toBeLessThanOrEqual(view.x1);
          expect(belt.y).toBeGreaterThanOrEqual(view.y0);
          expect(belt.y).toBeLessThanOrEqual(view.y1);
        }
      });
    }
  }

  it('the divider demo delivers the quotient and the remainder', () => {
    const script = play('divider', false, 2);
    expect(script.delivered.get(3) ?? 0).toBeGreaterThan(0);
    expect(script.delivered.get(1) ?? 0).toBeGreaterThan(0);
  });

  it('the bridge demo crosses the first belt with a bridge', () => {
    const script = play('bridge', false);
    expect(script.world.state.bridges.size).toBe(1);
    expect(script.delivered.get(1) ?? 0).toBeGreaterThan(0);
  });

  it('nothing but the scene result reaches the hub in the operator demos', () => {
    for (const id of ['adder', 'multiplier', 'subtractor', 'exponent'] as const) {
      const script = play(id, false, 2);
      expect([...script.delivered.keys()]).toEqual([DEMOS[id].target]);
    }
  });

  it('a still picture ends with the factory built and running', () => {
    const script = new DemoScript(DEMOS.adder);
    script.finish();
    expect(script.done).toBe(true);
    expect(script.pointer.visible).toBe(false);
    expect(script.world.state.belts.size).toBeGreaterThan(4);
    expect(script.delivered.get(3) ?? 0).toBeGreaterThan(0);
  });

  it('a finger shows no ghost while it is up', () => {
    const script = new DemoScript(DEMOS.start, true);
    // Somewhere in the first move towards the deposit.
    script.advance(500);
    script.advance(100);
    expect(script.tools.ghost().buildings).toEqual([]);
  });

  it('every building tip has a demo, and every demo a tip', () => {
    const withDemo = HELP_TIPS.flatMap((tip) => (tip.demo ? [tip.demo] : []));
    expect(new Set(withDemo)).toEqual(new Set(ids));
  });
});
