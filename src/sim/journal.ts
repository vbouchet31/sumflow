import type { BuildingType } from '../config/buildings';
import type { Dir, Rot } from '../core/grid';

/**
 * Structural snapshots used by undo / redo (PLAN §8.2). They describe the layout only:
 * restoring one never brings back destroyed items (documented in the plan).
 */
export type TileSnap =
  | { kind: 'belt'; outputs: number; priority: Dir | null }
  | { kind: 'bridge'; h: Dir | null; v: Dir | null };

export interface BuildingSnap {
  type: BuildingType;
  x: number;
  y: number;
  rot: Rot;
  mirror: boolean;
  priority: number | null;
  extractValue: number | null;
}

export interface SlotChange<T> {
  before: T | null;
  after: T | null;
}

/** One undoable action: the before / after state of every slot it touched. */
export interface Change {
  /** By tile key: the belt or bridge on that tile. */
  tiles: Map<number, SlotChange<TileSnap>>;
  /** By building id. */
  buildings: Map<number, SlotChange<BuildingSnap>>;
  /** By tile key: marker text. */
  markers: Map<number, SlotChange<string>>;
}

export function sameSnap(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
