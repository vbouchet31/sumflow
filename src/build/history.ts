import { EDIT } from '../config/balance';
import type { Change } from '../sim/journal';
import type { World } from '../sim/world';

/**
 * Undo / redo stacks (PLAN §8.2), 100 actions deep. Each action is recorded by the world's
 * journal while it runs. Undo restores the layout (buildings, belts, bridges, priorities,
 * markers), never the items destroyed by the action.
 */
export class History {
  private readonly undoStack: Change[] = [];
  private readonly redoStack: Change[] = [];
  private listeners = new Set<() => void>();
  private appliedListeners = new Set<(change: Change, side: 'before' | 'after') => void>();

  /**
   * Subscribe to every change applied to the world: a new action or a redo (`after`), an
   * undo (`before`). For visual feedback.
   */
  onApplied(fn: (change: Change, side: 'before' | 'after') => void): () => void {
    this.appliedListeners.add(fn);
    return () => this.appliedListeners.delete(fn);
  }

  private applied(change: Change, side: 'before' | 'after'): void {
    for (const fn of this.appliedListeners) fn(change, side);
  }

  constructor(private readonly world: World) {}

  /** Run `fn` as one undoable action. Nested calls join the outer action. */
  run<T>(fn: () => T): T {
    this.world.beginChange();
    try {
      return fn();
    } finally {
      const change = this.world.endChange();
      if (change) {
        this.push(change);
        this.applied(change, 'after');
      }
    }
  }

  private push(change: Change): void {
    this.undoStack.push(change);
    if (this.undoStack.length > EDIT.historySize) this.undoStack.shift();
    this.redoStack.length = 0;
    this.notify();
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoSize(): number {
    return this.undoStack.length;
  }

  undo(): boolean {
    const change = this.undoStack.pop();
    if (!change) return false;
    this.world.applyChange(change, 'before');
    this.redoStack.push(change);
    this.applied(change, 'before');
    this.notify();
    return true;
  }

  redo(): boolean {
    const change = this.redoStack.pop();
    if (!change) return false;
    this.world.applyChange(change, 'after');
    this.undoStack.push(change);
    this.applied(change, 'after');
    this.notify();
    return true;
  }

  /** Subscribe to stack changes (undo / redo buttons). */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }
}
