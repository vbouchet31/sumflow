import { SAVE_VERSION } from './schema';

/** A migration takes a save of version N and returns a save of version N + 1. */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * Oldest save version this build reads. Version 1 (fixed level rewards) is refused without
 * migration (PLAN-recompenses §1): it has no reward cards to rebuild.
 */
export const FIRST_SUPPORTED_VERSION = 2;

/**
 * Ordered migrations (PLAN §11.4): `MIGRATIONS[i]` turns version `FIRST_SUPPORTED_VERSION + i`
 * into the next one. Empty for now. To change the format: bump `SAVE_VERSION`, append
 * `migrate_vN_to_vN1` here, and add a test for it.
 */
export const MIGRATIONS: readonly Migration[] = [];

/** Version number of a raw save, or null if it has no usable one. */
function versionOf(raw: unknown): number | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const version = (raw as Record<string, unknown>)['version'];
  return typeof version === 'number' && Number.isInteger(version) && version >= 1 ? version : null;
}

/** True for a save of a format older than this build reads (refused, never migrated). */
export function isOutdated(raw: unknown, first: number = FIRST_SUPPORTED_VERSION): boolean {
  const version = versionOf(raw);
  return version !== null && version < first;
}

/**
 * Bring a raw save up to `target` (the current version by default). Returns null when the
 * save is newer than this build, older than `first`, or has no usable version number.
 */
export function migrate(
  raw: unknown,
  migrations: readonly Migration[] = MIGRATIONS,
  target: number = SAVE_VERSION,
  first: number = FIRST_SUPPORTED_VERSION,
): Record<string, unknown> | null {
  let version = versionOf(raw);
  if (version === null || version < first || version > target) return null;
  let data = raw as Record<string, unknown>;
  while (version < target) {
    const step = migrations[version - first];
    if (!step) return null;
    data = step(data);
    version += 1;
    data['version'] = version;
  }
  return data;
}
