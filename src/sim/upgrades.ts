import { beltSpeed, extractorCapacity } from '../config/balance';
import type { GameState } from './state';

/** Current belt speed in tiles/s. */
export function currentBeltSpeed(state: GameState): number {
  return beltSpeed(state.upgrades.belt);
}

/** Current extractor output in items/s: capacity (full belts) × belt speed (PLAN §6.3). */
export function currentExtractorRate(state: GameState): number {
  return extractorCapacity(state.upgrades.extractor) * currentBeltSpeed(state);
}
