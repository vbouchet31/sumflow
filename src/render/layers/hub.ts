import { HUB } from '../../config/balance';
import { BUILDING_COLORS, COLORS, FONT_NUM, FONT_UI, HUB_COLORS } from '../../config/colors';
import { formatCompact } from '../../core/format';
import { t } from '../../i18n';
import { fixedReward, type NaturalStep, offerSlots } from '../../sim/offers';
import { cardDef, offerContext } from '../../sim/rewards';
import type { GameState } from '../../sim/state';
import type { Camera } from '../camera';
import { LOD } from '../lod';
import { roundRect } from '../shapes';

const OPERATOR_SYMBOLS: Partial<Record<string, string>> = {
  adder: '+',
  multiplier: '×',
  subtractor: '−',
  divider: '÷',
  exponent: '^',
};

/** Glyph and colour of the icon of a fixed reward (levels 1 and 2) drawn on the hub. */
export function rewardIcon(step: NaturalStep): { glyph: string; color: string } {
  const e = cardDef(step.card)?.effect;
  switch (e?.kind) {
    case 'unlock':
      return {
        glyph: OPERATOR_SYMBOLS[e.building] ?? e.building.charAt(0).toUpperCase(),
        color: BUILDING_COLORS[e.building],
      };
    case 'value':
      return { glyph: String(step.value ?? ''), color: HUB_COLORS.rewardExtraction };
    case 'feature':
      return { glyph: e.feature === 'upgrades' ? '↑' : '◆', color: HUB_COLORS.rewardFeature };
    default:
      return { glyph: '?', color: HUB_COLORS.rewardFeature };
  }
}

/** Provisional "cards" glyph of an offer: `n` card outlines fanned out around (x, y). */
function drawCardsGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, n: number) {
  const w = 0.62 * r;
  const h = 0.9 * r;
  ctx.strokeStyle = COLORS.text;
  ctx.fillStyle = HUB_COLORS.rewardChoice;
  ctx.lineWidth = Math.max(1, 0.12 * r);
  for (let i = 0; i < n; i++) {
    const k = i - (n - 1) / 2;
    ctx.save();
    ctx.translate(x + k * 0.38 * r, y + Math.abs(k) * 0.1 * r);
    ctx.rotate(k * 0.3);
    roundRect(ctx, -w / 2, -h / 2, w, h, 0.12 * r);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

export function drawHub(ctx: CanvasRenderingContext2D, cam: Camera, state: GameState): void {
  const s = cam.scale;
  const tl = cam.worldToScreen(HUB.x, HUB.y);
  const size = HUB.size * s;
  const inset = Math.max(1, 0.08 * s);
  const x = tl.x + inset;
  const y = tl.y + inset;
  const w = size - 2 * inset;

  ctx.fillStyle = HUB_COLORS.fill;
  roundRect(ctx, x, y, w, w, Math.max(2, 0.4 * s));
  ctx.fill();
  ctx.strokeStyle = HUB_COLORS.frame;
  ctx.lineWidth = Math.max(2, 0.12 * s);
  ctx.stroke();
  roundRect(ctx, x + 0.22 * s, y + 0.22 * s, w - 0.44 * s, w - 0.44 * s, Math.max(2, 0.3 * s));
  ctx.strokeStyle = HUB_COLORS.innerFrame;
  ctx.lineWidth = Math.max(1, 0.05 * s);
  ctx.stroke();

  if (cam.zoom < LOD.buildingText) return;

  const cx = x + w / 2;
  const req = state.levelRequirement;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (!req) {
    // Game finished: free play.
    ctx.fillStyle = COLORS.text;
    ctx.font = `700 ${0.7 * s}px ${FONT_UI}`;
    ctx.fillText(t('hub.finished'), cx, y + 2.3 * s);
    ctx.fillStyle = HUB_COLORS.textMuted;
    ctx.font = `500 ${0.45 * s}px ${FONT_UI}`;
    ctx.fillText(t('hub.freePlay'), cx, y + 3.2 * s);
    return;
  }

  // Level number.
  ctx.fillStyle = HUB_COLORS.textMuted;
  ctx.font = `600 ${0.55 * s}px ${FONT_UI}`;
  ctx.fillText(t('hub.level', { n: state.level }), cx, y + 0.75 * s);

  // Target, large.
  ctx.fillStyle = COLORS.text;
  ctx.font = `700 ${1.9 * s}px ${FONT_NUM}`;
  ctx.fillText(formatCompact(req.value), cx, y + 2.35 * s);

  // Quantity.
  ctx.fillStyle = HUB_COLORS.textMuted;
  ctx.font = `600 ${0.5 * s}px ${FONT_NUM}`;
  ctx.fillText(`${formatCompact(req.delivered)} / ${formatCompact(req.required)}`, cx, y + 3.7 * s);

  // Progress bar.
  const barX = x + 0.6 * s;
  const barW = w - 1.2 * s;
  const barY = y + 4.15 * s;
  const barH = 0.28 * s;
  const ratio = req.required > 0 ? Math.min(1, req.delivered / req.required) : 1;
  ctx.fillStyle = HUB_COLORS.barTrack;
  roundRect(ctx, barX, barY, barW, barH, barH / 2);
  ctx.fill();
  if (ratio > 0) {
    ctx.fillStyle = HUB_COLORS.barFill;
    roundRect(ctx, barX, barY, Math.max(barH, barW * ratio), barH, barH / 2);
    ctx.fill();
  }

  // Next reward icon: the fixed card, or the cards of an offer.
  const r = 0.38 * s;
  const iy = y + w - 0.7 * s;
  ctx.fillStyle = HUB_COLORS.textMuted;
  ctx.font = `500 ${0.36 * s}px ${FONT_UI}`;
  ctx.textAlign = 'right';
  ctx.fillText(t('hub.nextReward'), cx + 0.15 * s, iy);
  const ix = cx + 0.25 * s + r;
  const fixed = fixedReward(state.level);
  if (fixed) {
    const icon = rewardIcon(fixed);
    ctx.fillStyle = icon.color;
    roundRect(ctx, ix - r, iy - r, 2 * r, 2 * r, 0.25 * r);
    ctx.fill();
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'center';
    ctx.font = `700 ${0.55 * s}px ${FONT_NUM}`;
    ctx.fillText(icon.glyph, ix, iy + 0.03 * s);
  } else {
    drawCardsGlyph(ctx, ix, iy, r, offerSlots(offerContext(state, state.level)).length);
  }
}
