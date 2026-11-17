import { describe, expect, it } from 'vitest';
import { TOUCH } from '../../src/config/keymap';
import { edgeScroll, Gestures, type GestureSink, PanInertia } from '../../src/input/gestures';

/** A sink that records what the gestures ask for, as short strings. */
function recorder(tool: boolean, longPress = true): { log: string[]; sink: GestureSink } {
  const log: string[] = [];
  const sink: GestureSink = {
    buildsOnDrag: () => tool,
    down: (x, y) => log.push(`down ${x},${y}`),
    move: (x, y) => log.push(`move ${x},${y}`),
    up: (x, y) => log.push(`up ${x},${y}`),
    cancel: () => log.push('cancel'),
    leave: () => log.push('leave'),
    tap: (x, y) => log.push(`tap ${x},${y}`),
    longPress: (x, y) => {
      log.push(`long ${x},${y}`);
      return longPress;
    },
    pan: (dx, dy) => log.push(`pan ${dx},${dy}`),
    pinch: (px, py, cx, cy, f) => log.push(`pinch ${px},${py}>${cx},${cy} x${f}`),
  };
  return { log, sink };
}

describe('Gestures without a tool', () => {
  it('a brief press is a click, then a tap', () => {
    const { log, sink } = recorder(false);
    const g = new Gestures(sink);
    g.pointerDown(1, 100, 100, 0);
    expect(log).toEqual([]); // nothing until we know what the gesture is
    g.pointerMove(1, 104, 103); // within the slop
    g.pointerUp(1, 104, 103);
    expect(log).toEqual(['down 100,100', 'up 100,100', 'tap 100,100', 'leave']);
    expect(g.phase).toBe('idle');
  });

  it('one finger pans the map, from the point first touched', () => {
    const { log, sink } = recorder(false);
    const g = new Gestures(sink);
    g.pointerDown(1, 100, 100, 0);
    g.pointerMove(1, 100 + TOUCH.slopPx, 100); // still a tap
    expect(log).toEqual([]);
    g.pointerMove(1, 120, 100);
    g.pointerMove(1, 125, 110);
    g.pointerUp(1, 125, 110);
    expect(log).toEqual(['pan 20,0', 'pan 5,10', 'leave']);
  });

  it('a long press fires once, and the rest of the gesture does nothing', () => {
    const { log, sink } = recorder(false);
    const g = new Gestures(sink);
    g.pointerDown(1, 50, 60, 1000);
    g.update(1000 + TOUCH.longPressMs - 1);
    expect(log).toEqual([]);
    g.update(1000 + TOUCH.longPressMs);
    g.update(1000 + TOUCH.longPressMs + 100);
    g.pointerMove(1, 200, 200);
    g.pointerUp(1, 200, 200);
    expect(log).toEqual(['long 50,60', 'leave']);
  });

  it('moving cancels the long press', () => {
    const { log, sink } = recorder(false);
    const g = new Gestures(sink);
    g.pointerDown(1, 50, 60, 0);
    g.pointerMove(1, 90, 60);
    g.update(10_000);
    expect(log).toEqual(['pan 40,0']);
  });
});

describe('Gestures with a tool', () => {
  it('shows the ghost at once and builds on release', () => {
    const { log, sink } = recorder(true);
    const g = new Gestures(sink);
    g.pointerDown(1, 100, 100, 0);
    expect(log).toEqual(['down 100,100']);
    g.pointerMove(1, 105, 100); // jitter: no drag yet
    expect(log).toEqual(['down 100,100']);
    g.pointerMove(1, 150, 100);
    expect(g.phase).toBe('build');
    expect(g.buildPoint).toEqual({ x: 150, y: 100 });
    g.pointerMove(1, 200, 100);
    g.pointerUp(1, 200, 100);
    expect(log).toEqual(['down 100,100', 'move 150,100', 'move 200,100', 'up 200,100', 'leave']);
  });

  it('a tap builds at the point first touched, whatever the jitter', () => {
    const { log, sink } = recorder(true);
    const g = new Gestures(sink);
    g.pointerDown(1, 100, 100, 0);
    g.pointerMove(1, 108, 96);
    g.pointerUp(1, 108, 96);
    expect(log).toEqual(['down 100,100', 'up 100,100', 'tap 100,100', 'leave']);
  });

  it('a second finger abandons the build and never resumes it', () => {
    const { log, sink } = recorder(true);
    const g = new Gestures(sink);
    g.pointerDown(1, 100, 100, 0);
    g.pointerMove(1, 160, 100);
    g.pointerDown(2, 300, 100, 50);
    expect(g.phase).toBe('pinch');
    expect(log).toEqual(['down 100,100', 'move 160,100', 'cancel']);
    log.length = 0;
    // Lifting the second finger: the first one only pans from now on.
    g.pointerUp(2, 300, 100);
    expect(g.phase).toBe('pan');
    g.pointerMove(1, 170, 110);
    g.pointerUp(1, 170, 110);
    expect(log).toEqual(['pan 10,10', 'leave']);
  });

  it('a second finger right after the first cancels the pending press', () => {
    const { log, sink } = recorder(true);
    const g = new Gestures(sink);
    g.pointerDown(1, 100, 100, 0);
    g.pointerDown(2, 200, 100, 10);
    g.pointerUp(1, 100, 100);
    g.pointerUp(2, 200, 100);
    expect(log).toEqual(['down 100,100', 'cancel', 'leave']);
  });

  it('a long press abandons the press before firing', () => {
    const { log, sink } = recorder(true);
    const g = new Gestures(sink);
    g.pointerDown(1, 100, 100, 0);
    g.update(TOUCH.longPressMs);
    g.pointerUp(1, 100, 100);
    expect(log).toEqual(['down 100,100', 'long 100,100', 'cancel', 'leave']);
  });

  it('a long press on nothing leaves the gesture alone: holding still to aim still builds', () => {
    const { log, sink } = recorder(true, false);
    const g = new Gestures(sink);
    g.pointerDown(1, 100, 100, 0);
    g.update(TOUCH.longPressMs);
    g.update(TOUCH.longPressMs * 2); // asked once only
    g.pointerMove(1, 160, 100);
    g.pointerUp(1, 160, 100);
    expect(log).toEqual(['down 100,100', 'long 100,100', 'move 160,100', 'up 160,100', 'leave']);
  });

  it('a pointer cancelled by the system builds nothing', () => {
    const { log, sink } = recorder(true);
    const g = new Gestures(sink);
    g.pointerDown(1, 100, 100, 0);
    g.pointerMove(1, 160, 100);
    g.pointerCancel(1);
    expect(log).toEqual(['down 100,100', 'move 160,100', 'cancel', 'leave']);
    expect(g.phase).toBe('idle');
  });
});

describe('Pinch', () => {
  it('reports the midpoint move and the distance ratio', () => {
    const { log, sink } = recorder(false);
    const g = new Gestures(sink);
    g.pointerDown(1, 100, 100, 0);
    g.pointerDown(2, 200, 100, 0);
    g.pointerMove(2, 300, 100); // distance 100 → 200, midpoint 150 → 200
    g.pointerMove(1, 100, 140); // distance 200 → ~203.96, midpoint (200,100) → (200,120)
    expect(log[0]).toBe('pinch 150,100>200,100 x2');
    expect(log[1]).toMatch(/^pinch 200,100>200,120 x1\.0198/);
  });

  it('keeps going with the two fingers left when a third one lifts', () => {
    const { log, sink } = recorder(false);
    const g = new Gestures(sink);
    g.pointerDown(1, 100, 100, 0);
    g.pointerDown(2, 200, 100, 0);
    g.pointerDown(3, 300, 300, 0);
    g.pointerUp(1, 100, 100);
    expect(g.phase).toBe('pinch');
    g.pointerMove(3, 300, 100); // fingers 2 and 3: distance ~223.6 → 100
    expect(log).toHaveLength(1);
    expect(log[0]).toMatch(/^pinch 250,200>250,100 x0\.447/);
  });

  it('ignores pointers it never saw go down', () => {
    const { log, sink } = recorder(false);
    const g = new Gestures(sink);
    g.pointerMove(7, 10, 10);
    g.pointerUp(7, 10, 10);
    g.pointerCancel(7);
    expect(log).toEqual([]);
  });
});

describe('edge scroll while building', () => {
  it('is zero away from the edges', () => {
    expect(edgeScroll(400, 300, 800, 600)).toEqual({ dx: 0, dy: 0 });
    expect(edgeScroll(TOUCH.edgePx, 600 - TOUCH.edgePx, 800, 600)).toEqual({ dx: 0, dy: 0 });
  });

  it('moves the world away from the edge the finger is at, faster the closer it gets', () => {
    // Right edge: the view goes right, so the world goes left (negative pan).
    expect(edgeScroll(800, 300, 800, 600)).toEqual({ dx: -TOUCH.edgeSpeedPx, dy: 0 });
    expect(edgeScroll(0, 300, 800, 600)).toEqual({ dx: TOUCH.edgeSpeedPx, dy: 0 });
    const half = edgeScroll(400, 600 - TOUCH.edgePx / 2, 800, 600);
    expect(half.dx).toBe(0);
    expect(half.dy).toBeCloseTo(-TOUCH.edgeSpeedPx / 2);
    // A finger dragged past the screen edge still scrolls at full speed, not more.
    expect(edgeScroll(-40, -40, 800, 600)).toEqual({
      dx: TOUCH.edgeSpeedPx,
      dy: TOUCH.edgeSpeedPx,
    });
  });
});

describe('PanInertia', () => {
  /** A steady pan of `vx` px/ms sampled every 16 ms, ending at `end` ms. */
  function pan(inertia: PanInertia, vx: number, end: number): void {
    for (let t = end - 96; t <= end; t += 16) inertia.track(vx * 16, 0, t);
  }

  it('glides at the release speed, slows down and stops', () => {
    const inertia = new PanInertia();
    pan(inertia, 1, 1000); // 1000 px/s
    inertia.release(1005);
    expect(inertia.active).toBe(true);
    // Close to the pan speed (16 px per frame), a little less for the 5 ms before lifting.
    const first = inertia.step(16);
    expect(first?.dx).toBeGreaterThan(14.5);
    expect(first?.dx).toBeLessThanOrEqual(16);
    expect(first?.dy).toBe(0);
    const second = inertia.step(16);
    expect(second?.dx).toBeLessThan(16);
    let travelled = 0;
    for (let i = 0; i < 2000 && inertia.active; i++) travelled += inertia.step(16)?.dx ?? 0;
    expect(inertia.active).toBe(false);
    expect(inertia.step(16)).toBeNull();
    // Total distance of an exponential slow-down: about speed × time constant.
    expect(travelled).toBeGreaterThan(200);
    expect(travelled).toBeLessThan(1 * TOUCH.inertiaTauMs);
  });

  it('does not glide after a slow pan, a pause before lifting, or a single move', () => {
    const slow = new PanInertia();
    pan(slow, (TOUCH.inertiaMinSpeed - 10) / 1000, 1000);
    slow.release(1005);
    expect(slow.active).toBe(false);

    const paused = new PanInertia();
    pan(paused, 1, 1000);
    paused.release(1000 + TOUCH.inertiaRestMs + 1);
    expect(paused.active).toBe(false);

    const single = new PanInertia();
    single.track(50, 0, 1000);
    single.release(1001);
    expect(single.active).toBe(false);
  });

  it('measures the speed right when moves are far apart (slow device)', () => {
    const inertia = new PanInertia();
    // 20 px every 50 ms = 400 px/s; only one or two moves fall in the 100 ms window.
    for (const t of [530, 600, 645, 696, 745, 795, 848.4, 895]) inertia.track(-20, 0, t);
    inertia.release(945);
    expect(inertia.active).toBe(true);
    const step = inertia.step(10);
    expect(step?.dx).toBeLessThan(-2.5);
    expect(step?.dx).toBeGreaterThan(-4.5);
  });

  it('a new touch stops the glide', () => {
    const inertia = new PanInertia();
    pan(inertia, 1, 1000);
    inertia.release(1000);
    inertia.stop();
    expect(inertia.step(16)).toBeNull();
  });
});
