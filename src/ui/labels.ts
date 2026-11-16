import type { Reward } from '../config/balance';
import { t } from '../i18n';

/** Human label of a level reward. */
export function rewardLabel(reward: Reward | null): string {
  if (!reward) return t('reward.none');
  switch (reward.kind) {
    case 'extraction':
      return t('reward.extraction', { n: reward.max });
    case 'building':
      return t(`reward.${reward.building}`);
    case 'feature':
      return t(`reward.${reward.feature}`);
  }
}

/** "1 h 05 min" / "12 min" from milliseconds. */
export function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? t('time.hm', { h, m: String(m).padStart(2, '0') }) : t('time.m', { m });
}
