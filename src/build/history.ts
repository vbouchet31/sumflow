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

  constructor(private readonly world: World) {}

  /** Run `fn` as one undoable action. Nested calls join the outer action. */
  run<T>(fn: () => T): T {
    this.world.beginChange();
    try {
      return fn();
    } finally {
      const change = this.world.endChange();
      if (change) this.push(change);
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

  /** The action an undo would revert, or undefined. */
  peekUndo(): Change | undefined {
    return this.undoStack[this.undoStack.length - 1];
  }

  /** The action a redo would replay, or undefined. */
  peekRedo(): Change | undefined {
    return this.redoStack[this.redoStack.length - 1];
  }

  get undoSize(): number {
    return this.undoStack.length;
  }

  undo(): boolean {
    const change = this.undoStack.pop();
    if (!change) return false;
    this.world.applyChange(change, 'before');
    this.redoStack.push(change);
    this.notify();
    return true;
  }

  redo(): boolean {
    const change = this.redoStack.pop();
    if (!change) return false;
    this.world.applyChange(change, 'after');
    this.undoStack.push(change);
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
