import type { BuildingType } from '../config/buildings';
import type { Dir, Rot } from '../core/grid';

/**
 * A copied group of objects (PLAN §8.2), in coordinates relative to its own bounding box
 * (`0..w-1`, `0..h-1`). Only the layout is kept: never items, buffers or stock.
 */
export interface Clip {
  w: number;
  h: number;
  belts: ClipBelt[];
  bridges: ClipBridge[];
  buildings: ClipBuilding[];
}

export interface ClipBelt {
  x: number;
  y: number;
  outputs: number;
  priority: Dir | null;
}

export interface ClipBridge {
  x: number;
  y: number;
  h: Dir | null;
  v: Dir | null;
}

export interface ClipBuilding {
  type: Exclude<BuildingType, 'hub'>;
  /** Origin (top-left after rotation) relative to the clip box. */
  x: number;
  y: number;
  rot: Rot;
  mirror: boolean;
  /** Prioritised output face, as a building tile relative to the clip box and a face. */
  priority: { x: number; y: number; face: Dir } | null;
}

/** A text marker on a tile (PLAN §8.2). */
export interface Marker {
  x: number;
  y: number;
  text: string;
}
