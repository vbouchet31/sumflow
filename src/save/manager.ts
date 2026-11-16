import { EventBus } from '../core/events';
import type { World } from '../sim/world';
import { encodeSave, encodeSaveSync, SAVE_KEY, type WriteResult, writeStorage } from './persist';
import { type CameraState, serialize } from './serialize';

export type SaveEvents = {
  saved: { result: WriteResult; manual: boolean };
};

/**
 * Writes the game to localStorage (PLAN §11.3): on demand, on a timer, when the tab is
 * hidden and when the page closes. Compressed when possible; the closing save is plain
 * JSON because it must be synchronous.
 */
export class SaveManager {
  readonly events = new EventBus<SaveEvents>();
  /** `performance.now()` of the last successful save, or null. */
  lastSavedAt: number | null = null;
  /** Autosave interval in seconds (0 = never). */
  intervalSec = 60;
  private suspended = false;
  private writing = false;
  private nextAuto = 0;

  constructor(
    private readonly world: World,
    private readonly camera: CameraState,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.nextAuto = this.now() + this.intervalSec * 1000;
  }

  /** Stop all writes (before a reload that replaces the save). */
  suspend(): void {
    this.suspended = true;
  }

  setInterval(sec: number): void {
    this.intervalSec = sec;
    this.nextAuto = this.now() + sec * 1000;
  }

  async save(manual = false): Promise<WriteResult> {
    if (this.suspended || this.writing) return 'ok';
    this.writing = true;
    try {
      const data = serialize(this.world, this.camera, new Date().toISOString());
      const result = writeStorage(SAVE_KEY, await encodeSave(data));
      this.done(result, manual);
      return result;
    } finally {
      this.writing = false;
    }
  }

  /** Synchronous save (page closing). */
  saveSync(): void {
    if (this.suspended) return;
    const data = serialize(this.world, this.camera, new Date().toISOString());
    this.done(writeStorage(SAVE_KEY, encodeSaveSync(data)), false);
  }

  private done(result: WriteResult, manual: boolean): void {
    if (result === 'ok') this.lastSavedAt = this.now();
    this.nextAuto = this.now() + this.intervalSec * 1000;
    this.events.emit('saved', { result, manual });
  }

  /** Call every frame: saves when the autosave interval has elapsed. */
  update(): void {
    if (this.intervalSec <= 0 || this.suspended) return;
    if (this.now() >= this.nextAuto) void this.save();
  }
}
