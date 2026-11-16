/** Level-of-detail thresholds (PLAN §10.3), by camera zoom. */
export const LOD = {
  /** Item disc + value, full belt chevrons, all text. */
  full: 0.6,
  /** Discs without text; building and deposit text still drawn. */
  buildingText: 0.3,
  /** Only deposit text remains. Below this, only markers. */
  depositText: 0.12,
} as const;
