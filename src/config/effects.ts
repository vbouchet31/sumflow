/**
 * Chalk effects of the player's actions (DECISIONS "Effets craie"): a sponge wipe where
 * something is demolished, a puff of chalk dust where something is built. Feel, not
 * balance: rendering only, driven by real time (milliseconds), never by ticks.
 *
 * Distances are in tiles, speeds in tiles per second, durations in milliseconds.
 */
export const EFFECTS = {
  /** Effects alive at once: past this, the oldest goes first. */
  maxEffects: 64,
  /** Dust grains alive at once, over every puff: past this, the oldest puffs go first. */
  maxGrains: 1500,
  /** Smallest zoom at which the sponge traces are drawn (LOD.depositText). */
  spongeMinZoom: 0.12,
  /** Smallest zoom at which dust is drawn (LOD.buildingText): below, grains are sub-pixel. */
  dustMinZoom: 0.3,

  /** Sponge wiped over a demolished object: a short zigzag on its footprint. */
  sponge: {
    /** Time for the sponge to cross the object, then the trace fades until `lifeMs`. */
    passMs: 260,
    lifeMs: 1250,
    /** The trace stays at full strength this long after the pass, before fading. */
    holdMs: 120,
    /** Width of the sponge: a share of the object's short side, clamped. */
    widthShare: 0.6,
    minWidth: 0.75,
    maxWidth: 1.6,
    /** Zigzag legs (one back and forth = 2). */
    minLegs: 2,
    maxLegs: 4,
  },

  /** Sponge swept across a demolished, cut or cleared zone. */
  sweep: {
    passMs: 520,
    lifeMs: 1500,
    holdMs: 150,
    /** Zones with both sides up to this size are wiped like a single object. */
    objectMaxSide: 3,
    /** At most this many strokes across the zone (rows of the back and forth). */
    maxLegs: 4,
    /** Rows overlap: the sponge is this much wider than a row. */
    overlap: 1.25,
  },

  /** Removed objects of one action wiped one by one; past this, one sweep of their box. */
  maxSpongesPerAction: 12,

  /** Look of a sponge trace: chalk white, very light (badly wiped chalk on the slate). */
  trace: {
    /**
     * The band is stroked `bandPasses` times, narrower each time, at this opacity: soft at
     * the edges, a little lighter in the middle.
     */
    bandAlpha: 0.022,
    bandPasses: 8,
    /** Streaks along the stroke: per tile of sponge width, clamped. */
    streaksPerTile: 6,
    minStreaks: 8,
    maxStreaks: 18,
    /** Opacity and width (share of the sponge width) of the thin streaks. */
    streakAlpha: 0.14,
    streakWidth: 0.03,
    /** Thin streaks are never wider than this (tiles). */
    streakMaxWidth: 0.06,
  },

  /** Puff of chalk dust from the edges of a building just placed. */
  dust: {
    /** Grains per tile of footprint edge, clamped. */
    grainsPerEdgeTile: 2.6,
    minGrains: 12,
    maxGrains: 34,
    /** Soft clouds of dust per building (larger, very faint). */
    clouds: 5,
    cloudAlpha: 0.1,
    /** Lifetime of a grain, drawn between these two. */
    minLifeMs: 300,
    maxLifeMs: 500,
    /** Grains leave over this delay, not all on the same frame. */
    staggerMs: 40,
    /** Speed when leaving the edge, drawn between these two. */
    minSpeed: 1.8,
    maxSpeed: 4.4,
    /** Air drag: speed falls by e every `dragMs`. */
    dragMs: 110,
    /** Chalk falls down the board (screen down). */
    gravity: 6,
    /** Grain size, drawn between these two (never under one pixel on screen). */
    minSize: 0.05,
    maxSize: 0.11,
    /** Share of grains tinted with the building's colour (the rest is chalk white). */
    tinted: 0.35,
    /** How far the tint is mixed toward white (0 = building colour, 1 = white). */
    tintLighten: 0.45,
    /** Most building puffs for one action (paste, move): the others get none. */
    maxPuffsPerAction: 24,
  },

  /** Belts: much more discreet, a few grains at the ends and on some tiles of the path. */
  beltDust: {
    grains: 4,
    /** Share of the other tiles of the path that also get a few grains. */
    sampleRate: 0.12,
    /** Most belt puffs for one action. */
    maxPuffsPerAction: 8,
  },
} as const;
