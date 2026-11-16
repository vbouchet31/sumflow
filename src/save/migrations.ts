import { SAVE_VERSION } from './schema';

/** A migration takes a save of version N and returns a save of version N + 1. */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * Ordered migrations (PLAN §11.4): `MIGRATIONS[i]` turns version `i + 1` into `i + 2`.
 * Version 1 is the first format, so the list is empty for now. To change the format:
 * bump `SAVE_VERSION`, append `migrate_vN_to_vN1` here, and add a test for it.
 */
export const MIGRATIONS: readonly Migration[] = [];

/**
 * Bring a raw save up to `target` (the current version by default). Returns null when the
 * save is newer than this build or has no usable version number.
 */
export function migrate(
  raw: unknown,
  migrations: readonly Migration[] = MIGRATIONS,
  target: number = SAVE_VERSION,
): Record<string, unknown> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  let data = raw as Record<string, unknown>;
  let version = data['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return null;
  if (version > target) return null;
  while (version < target) {
    const step = migrations[version - 1];
    if (!step) return null;
    data = step(data);
    version += 1;
    data['version'] = version;
  }
  return data;
}
