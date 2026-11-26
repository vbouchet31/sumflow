/**
 * Visual palette (PLAN §10.1): a green slate written on in chalk ("Tableau noir", see
 * DECISIONS). Rendering only, no gameplay values here. The interface uses the same colours
 * as CSS custom properties (src/ui/styles.css).
 */
export const COLORS = {
  background: '#26332b',
  gridLine: 'rgba(242, 239, 230, 0.045)',
  /** A faint wash of chalk dust under each deposit. */
  deposit: 'rgba(242, 239, 230, 0.05)',
  text: '#f2efe6',
  depositLocked: '#5f7166',
} as const;

/** Chalk on the board: lines and marks shared by several layers. */
export const CHALK = {
  white: '#f2efe6',
  yellow: '#f3e08a',
  pink: '#f29bb8',
  green: '#9fd39a',
  red: '#f29b8f',
  /** Belt rails and loose ends. */
  rail: 'rgba(242, 239, 230, 0.38)',
  /** Outline of a deposit. */
  outline: 'rgba(242, 239, 230, 0.45)',
  /** Line across a belt where it meets a building. */
  threshold: 'rgba(242, 239, 230, 0.85)',
  /** Bridge: beams along the deck, planks across it. */
  beam: 'rgba(242, 239, 230, 0.6)',
  plank: 'rgba(242, 239, 230, 0.16)',
  /** Smudge around an item, and the slate under its number. */
  smudge: 'rgba(242, 239, 230, 0.07)',
  itemBack: '#2a382f',
  /** Marks on a building: output notches, input notches, the disc under the symbol. */
  mark: 'rgba(242, 239, 230, 0.75)',
  notchIn: 'rgba(0, 0, 0, 0.55)',
  markFaint: 'rgba(242, 239, 230, 0.35)',
  shadow: 'rgba(0, 0, 0, 0.28)',
} as const;

/**
 * Building chalk colours (PLAN §6.3), as #rrggbb (lighter shades are derived from them).
 * Operators are also told apart by symbol and shape (§9.5).
 */
export const BUILDING_COLORS = {
  extractor: '#3f6f7a',
  adder: '#4f7f4a',
  multiplier: '#b0703a',
  subtractor: '#a84a4a',
  divider: '#6f5a95',
  exponent: '#9a832a',
  storage: '#8a8f86',
  bridge: '#4f6f8f',
  /** Concaténateur (docs/objets/concat.md): teal chalk. */
  concat: '#2f8a86',
} as const;

/** Ornament of the special buildings: a second, inner frame and studs in its corners. */
export const SPECIAL_ORNAMENT = 'rgba(242, 226, 190, 0.75)';

/**
 * Item chalks (PLAN §5): one stick per value 1..9, index 0 is value 1. An extractor is
 * coloured with the chalk of its value, so its items leave in the same colour. Hand-picked
 * to sit with the other chalks above (red, green, yellow and pink are the same sticks).
 */
export const ITEM_CHALKS = [
  '#8ec5ec', // 1 sky blue
  '#f29b8f', // 2 red
  '#9fd39a', // 3 green
  '#f3e08a', // 4 yellow
  '#c9a6ea', // 5 lilac
  '#86d8cc', // 6 turquoise
  '#f5b07a', // 7 orange
  '#f29bb8', // 8 pink
  '#d4e48a', // 9 anise
] as const;

/**
 * Chalk tone of the other values, in OKLCH (perceptual lightness 0..1, chroma): odd values
 * lighter, even values darker, so two neighbours differ in lightness as well as in hue. The
 * hue turns one golden angle per value from `hueOffset` (degrees). Every hue of both tones
 * fits in sRGB.
 */
export const ITEM_CHALK_TONE = {
  odd: { lightness: 0.85, chroma: 0.07 },
  even: { lightness: 0.74, chroma: 0.09 },
  hueOffset: 30,
} as const;

/** The hub is the teacher's frame: clean ruled lines, not a sketch. */
export const HUB_COLORS = {
  /** A darker wash inside the frame, as if the board had been wiped there. */
  fill: 'rgba(0, 0, 0, 0.18)',
  frame: '#f2efe6',
  innerFrame: '#f3e08a',
  barTrack: '#1f2a24',
  barFill: '#f3e08a',
  textMuted: '#d8dccf',
  /** Behind the reward icons. */
  rewardExtraction: '#5f7166',
  rewardFeature: '#3a8f8a',
  /** Inside the chalk cards of a level that ends with an offer. */
  rewardChoice: '#3b3550',
  /** Outline of those cards. */
  rewardChoiceLine: '#c9a6ea',
  /** Tag on the frame while an offer waits to be chosen. */
  pending: '#f3e08a',
  pendingText: '#1f2a24',
} as const;

/**
 * Edition chalks (PLAN-recompenses §3.4): pearly with a glint for brillante, golden with a
 * small star for légendaire. Base keeps the usual colours. Shared by the choice screen and,
 * later, the buildings on the map, the ghost and the build bar.
 */
export const EDITION_COLORS = {
  brillante: {
    /** Gradient across the object, from one corner to the other. */
    stops: ['#cfe0f5', '#f3d6ec', '#d6f1e2', '#e3d9f7'],
    /** Darker edge of a chalk stick. */
    deep: '#9aa9c4',
    glint: 'rgba(255, 255, 255, 0.85)',
    /** Outline of a building drawn in this chalk on the map. */
    outline: '#f1f4ff',
  },
  legendaire: {
    stops: ['#d9a23a', '#f8dc84', '#e9b949', '#c98f2c'],
    deep: '#8f6420',
    glint: 'rgba(255, 244, 205, 0.9)',
    outline: '#ffe9a3',
  },
  star: '#fff1b8',
  starLine: '#8f6420',
} as const;

export const FONT_NUM = '"Patrick Hand", cursive';
export const FONT_UI = '"Patrick Hand", "Comic Sans MS", cursive';

export const BELT_COLORS = {
  priority: '#9fd39a',
  chevron: 'rgba(242, 239, 230, 0.6)',
  /** Rails, and the single line a belt becomes when zoomed out. */
  line: 'rgba(242, 239, 230, 0.38)',
} as const;

/**
 * Shape of a belt, in tiles (one tile = 1).
 * - `band`: distance from the centre line to each chalk rail.
 * - `corner`: radius of the outer rail in a quarter turn, from 0 (square corner) to
 *   0.5 + band (a quarter circle centred on the tile corner). Items and chevrons follow a
 *   centre line of radius `corner - band` (0 to 0.5).
 * - `cap`: how round the chalk stroke closing a loose end is, from 0 (straight across) to
 *   1 (a half circle).
 */
export const BELT_SHAPE = {
  band: 0.38,
  corner: 0.45,
  cap: 0.6,
} as const;

/** Ghost fills: new, replace, bridge, impossible (PLAN §6.5), in coloured chalk. */
export const GHOST_COLORS = {
  new: 'rgba(159, 211, 154, 0.3)',
  replace: 'rgba(240, 180, 110, 0.35)',
  bridge: 'rgba(140, 190, 230, 0.35)',
  blocked: 'rgba(242, 155, 143, 0.4)',
  demolish: 'rgba(242, 155, 143, 0.35)',
} as const;

/**
 * Moving a building: one soft chalk tint per belt line that follows it, so each line can be
 * told apart. Muted on purpose, and away from the green / orange / red of the ghosts.
 * RGB only: the layer sets the opacity (rerouted belts stronger than the belts that stay).
 */
export const LINE_TINTS: readonly (readonly [number, number, number])[] = [
  [140, 170, 235], // periwinkle
  [245, 195, 110], // amber
  [205, 150, 215], // mauve
  [110, 205, 215], // cyan
  [235, 230, 215], // chalk white
];

/** Zone selection rectangles (PLAN §8.2): a dashed chalk line around a light wash. */
export const AREA_COLORS = {
  demolish: { fill: 'rgba(242, 155, 143, 0.14)', stroke: 'rgba(242, 155, 143, 0.95)' },
  clear: { fill: 'rgba(243, 224, 138, 0.12)', stroke: 'rgba(243, 224, 138, 0.95)' },
  copy: { fill: 'rgba(140, 190, 230, 0.12)', stroke: 'rgba(160, 205, 240, 0.95)' },
  cut: { fill: 'rgba(240, 180, 110, 0.14)', stroke: 'rgba(240, 180, 110, 0.95)' },
  select: { fill: 'rgba(242, 239, 230, 0.08)', stroke: 'rgba(242, 239, 230, 0.9)' },
} as const;

/** Text markers (PLAN §10.2 layer 8). */
export const MARKER_COLORS = {
  pin: '#f29bb8',
  pinEdge: '#1f2a24',
  labelBg: 'rgba(38, 51, 43, 0.9)',
  labelText: '#f29bb8',
} as const;
