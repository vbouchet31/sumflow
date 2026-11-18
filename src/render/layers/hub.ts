import { HUB, type Reward } from '../../config/balance';
import { BUILDING_COLORS, COLORS, FONT_NUM, FONT_UI, HUB_COLORS } from '../../config/colors';
import { formatCompact } from '../../core/format';
import { t } from '../../i18n';
import { rewardFor } from '../../sim/levels';
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
  totalizer: '∑',
};

/** Glyph and colour of the reward icon drawn on the hub. */
export function rewardIcon(reward: Reward): { glyph: string; color: string } {
  switch (reward.kind) {
    case 'building':
      return {
        glyph: OPERATOR_SYMBOLS[reward.building] ?? reward.building.charAt(0).toUpperCase(),
        color: BUILDING_COLORS[reward.building],
      };
    case 'extraction':
      return { glyph: String(reward.max), color: COLORS.deposit };
    case 'feature':
      return { glyph: reward.feature === 'upgrades' ? '↑' : '◆', color: '#3a8f8a' };
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

  // Next reward icon.
  const reward = rewardFor(state.level);
  if (reward) {
    const icon = rewardIcon(reward);
    const r = 0.38 * s;
    const iy = y + w - 0.7 * s;
    ctx.fillStyle = HUB_COLORS.textMuted;
    ctx.font = `500 ${0.36 * s}px ${FONT_UI}`;
    ctx.textAlign = 'right';
    ctx.fillText(t('hub.nextReward'), cx + 0.15 * s, iy);
    const ix = cx + 0.25 * s + r;
    ctx.fillStyle = icon.color;
    roundRect(ctx, ix - r, iy - r, 2 * r, 2 * r, 0.25 * r);
    ctx.fill();
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'center';
    ctx.font = `700 ${0.55 * s}px ${FONT_NUM}`;
    ctx.fillText(icon.glyph, ix, iy + 0.03 * s);
  }
}
