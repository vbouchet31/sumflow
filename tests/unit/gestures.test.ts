import { describe, expect, it } from 'vitest';
import { TOUCH } from '../../src/config/keymap';
import { Gestures, type GestureSink } from '../../src/input/gestures';

/** A sink that records what the gestures ask for, as short strings. */
function recorder(tool: boolean): { log: string[]; sink: GestureSink } {
  const log: string[] = [];
  const sink: GestureSink = {
    buildsOnDrag: () => tool,
    down: (x, y) => log.push(`down ${x},${y}`),
    move: (x, y) => log.push(`move ${x},${y}`),
    up: (x, y) => log.push(`up ${x},${y}`),
    cancel: () => log.push('cancel'),
    leave: () => log.push('leave'),
    tap: (x, y) => log.push(`tap ${x},${y}`),
    longPress: (x, y) => log.push(`long ${x},${y}`),
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
    expect(log).toEqual(['down 100,100', 'cancel', 'long 100,100', 'leave']);
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
