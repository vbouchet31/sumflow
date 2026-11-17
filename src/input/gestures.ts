import { TOUCH } from '../config/keymap';

/**
 * What the gestures act on. Positions are in CSS pixels, relative to the map.
 * `down` / `move` / `up` mirror a mouse press, drag and release on the map.
 */
export interface GestureSink {
  /** True when a one-finger drag builds with the current tool; false when it pans. */
  buildsOnDrag: () => boolean;
  down: (x: number, y: number) => void;
  move: (x: number, y: number) => void;
  up: (x: number, y: number) => void;
  /** The press is abandoned (second finger, long press, system): nothing must be built. */
  cancel: () => void;
  /** No finger is on the map any more. */
  leave: () => void;
  /** A brief press ended without moving (after its `down` / `up`). */
  tap: (x: number, y: number) => void;
  /** The finger stayed still for `TOUCH.longPressMs`. */
  longPress: (x: number, y: number) => void;
  pan: (dx: number, dy: number) => void;
  /**
   * Two fingers: their midpoint went from `(px, py)` to `(cx, cy)` and their distance was
   * multiplied by `factor`.
   */
  pinch: (px: number, py: number, cx: number, cy: number, factor: number) => void;
}

/**
 * - `pending`: one finger down, not moved beyond the slop yet (tap, long press or drag).
 * - `build`: one finger dragging with a tool.
 * - `pan`: one finger moving the map.
 * - `pinch`: two fingers moving and zooming the map.
 * - `spent`: the gesture is over but fingers are still down; they do nothing.
 */
export type GesturePhase = 'idle' | 'pending' | 'build' | 'pan' | 'pinch' | 'spent';

interface Finger {
  x: number;
  y: number;
}

/**
 * Touch gestures on the map (PLAN-tactile §3): without a tool one finger pans, with a tool
 * it builds; two fingers always pan and zoom, and abandon the build in progress. Pure
 * logic, no DOM and no timer: feed it pointer events and call `update` every frame.
 */
export class Gestures {
  private readonly fingers = new Map<number, Finger>();
  private state: GesturePhase = 'idle';
  /** The press was forwarded to the tools (`down` sent, `up` or `cancel` still due). */
  private armed = false;
  /** Finger that builds or pans. */
  private primary = -1;
  private startX = 0;
  private startY = 0;
  private startT = 0;
  private lastX = 0;
  private lastY = 0;
  private midX = 0;
  private midY = 0;
  private dist = 1;

  constructor(
    private readonly sink: GestureSink,
    private readonly config: { slopPx: number; longPressMs: number } = TOUCH,
  ) {}

  get phase(): GesturePhase {
    return this.state;
  }

  /** Position of the finger that builds, while it does. */
  get buildPoint(): { x: number; y: number } | null {
    if (this.state !== 'build') return null;
    return this.fingers.get(this.primary) ?? null;
  }

  pointerDown(id: number, x: number, y: number, t: number): void {
    this.fingers.set(id, { x, y });
    if (this.fingers.size === 1) {
      this.primary = id;
      this.startX = this.lastX = x;
      this.startY = this.lastY = y;
      this.startT = t;
      this.state = 'pending';
      this.armed = this.sink.buildsOnDrag();
      // The ghost shows under the finger at once; nothing is built before the release.
      if (this.armed) this.sink.down(x, y);
      return;
    }
    if (this.fingers.size === 2) {
      this.disarm();
      this.state = 'pinch';
      this.rebasePinch();
    }
  }

  pointerMove(id: number, x: number, y: number): void {
    const f = this.fingers.get(id);
    if (!f) return;
    f.x = x;
    f.y = y;
    switch (this.state) {
      case 'pending':
        if (Math.hypot(x - this.startX, y - this.startY) <= this.config.slopPx) return;
        if (this.armed) {
          this.state = 'build';
          this.sink.move(x, y);
        } else {
          this.state = 'pan';
          // From the start point, so the tile grabbed stays under the finger.
          this.sink.pan(x - this.startX, y - this.startY);
          this.lastX = x;
          this.lastY = y;
        }
        return;
      case 'build':
        if (id === this.primary) this.sink.move(x, y);
        return;
      case 'pan':
        if (id !== this.primary) return;
        this.sink.pan(x - this.lastX, y - this.lastY);
        this.lastX = x;
        this.lastY = y;
        return;
      case 'pinch': {
        const [a, b] = this.pinchFingers();
        if (!a || !b) return;
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const dist = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
        this.sink.pinch(this.midX, this.midY, midX, midY, dist / this.dist);
        this.midX = midX;
        this.midY = midY;
        this.dist = dist;
        return;
      }
      default:
        return;
    }
  }

  pointerUp(id: number, x: number, y: number): void {
    if (!this.fingers.delete(id)) return;
    switch (this.state) {
      case 'pending':
        // A brief press: a click at the point first touched.
        if (!this.armed) this.sink.down(this.startX, this.startY);
        this.armed = false;
        this.sink.up(this.startX, this.startY);
        this.sink.tap(this.startX, this.startY);
        break;
      case 'build':
        this.armed = false;
        this.sink.up(x, y);
        break;
      case 'pinch':
        if (this.fingers.size >= 2) {
          this.rebasePinch();
          return;
        }
        // The finger left keeps moving the map, but never builds: lifting a finger after
        // a pinch must not place anything.
        for (const [rest, f] of this.fingers) {
          this.state = 'pan';
          this.primary = rest;
          this.lastX = f.x;
          this.lastY = f.y;
          return;
        }
        break;
      default:
        break;
    }
    if (this.fingers.size === 0) this.finish();
  }

  /** The system took the pointer away: nothing is built. */
  pointerCancel(id: number): void {
    if (!this.fingers.delete(id)) return;
    this.disarm();
    if (this.fingers.size === 0) this.finish();
    else this.state = 'spent';
  }

  /** Call every frame with the same clock as `pointerDown`: detects the long press. */
  update(now: number): void {
    if (this.state !== 'pending' || now - this.startT < this.config.longPressMs) return;
    this.disarm();
    this.state = 'spent';
    this.sink.longPress(this.startX, this.startY);
  }

  private disarm(): void {
    if (this.armed) this.sink.cancel();
    this.armed = false;
  }

  private finish(): void {
    this.state = 'idle';
    this.armed = false;
    this.sink.leave();
  }

  private pinchFingers(): [Finger | undefined, Finger | undefined] {
    const it = this.fingers.values();
    return [it.next().value, it.next().value];
  }

  private rebasePinch(): void {
    const [a, b] = this.pinchFingers();
    if (!a || !b) return;
    this.midX = (a.x + b.x) / 2;
    this.midY = (a.y + b.y) / 2;
    this.dist = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
  }
}
