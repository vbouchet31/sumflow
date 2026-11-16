import { migrate } from './migrations';
import { type SaveData, SaveError, validateSave } from './schema';
import { deserialize } from './serialize';

/** localStorage keys (PLAN §11.3). */
export const SAVE_KEY = 'sumflow.save.v1';
export const SETTINGS_KEY = 'sumflow.settings';

/** Prefix of the compressed format: deflate-raw, then base64. Plain JSON starts with `{`. */
const COMPRESSED_PREFIX = 'Z1:';

export function hasCompression(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(
  bytes: Uint8Array<ArrayBuffer>,
  stream: GenericTransformStream,
): Promise<Uint8Array> {
  const out = new Blob([bytes])
    .stream()
    .pipeThrough(stream as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** Compressed text of a save (PLAN §11.3), or plain JSON when compression is missing. */
export async function encodeSave(data: SaveData): Promise<string> {
  const json = JSON.stringify(data);
  if (!hasCompression()) return json;
  const packed = await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw'));
  return COMPRESSED_PREFIX + toBase64(packed);
}

/** Plain JSON text, synchronous (used when the page is closing). */
export function encodeSaveSync(data: SaveData): string {
  return JSON.stringify(data);
}

/**
 * Parse a save in either format, migrate it to the current version and validate it.
 * Throws `SaveError` on any problem; never touches storage.
 */
export async function decodeSave(text: string): Promise<SaveData> {
  const trimmed = text.trim();
  let json: string;
  if (trimmed.startsWith(COMPRESSED_PREFIX)) {
    if (!hasCompression()) throw new SaveError('$ (compression unavailable)');
    try {
      const bytes = await pipe(
        fromBase64(trimmed.slice(COMPRESSED_PREFIX.length)),
        new DecompressionStream('deflate-raw'),
      );
      json = new TextDecoder().decode(bytes);
    } catch {
      throw new SaveError('$ (corrupted data)');
    }
  } else {
    json = trimmed;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new SaveError('$ (not JSON)');
  }
  const migrated = migrate(raw);
  if (!migrated) throw new SaveError('$.version');
  const data = validateSave(migrated);
  deserialize(data); // throws on overlapping objects
  return data;
}

export type WriteResult = 'ok' | 'quota' | 'unavailable';

/** Write text under a key; reports a full quota instead of throwing. */
export function writeStorage(storageKey: string, text: string): WriteResult {
  try {
    localStorage.setItem(storageKey, text);
    return 'ok';
  } catch (e) {
    const quota =
      e instanceof DOMException &&
      (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    return quota ? 'quota' : 'unavailable';
  }
}

export function readStorage(storageKey: string): string | null {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

/** Export file name: `sumflow-AAAAMMJJ-HHMM.json` (local time). */
export function exportFileName(date: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `sumflow-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}.json`;
}

/** Readable export (uncompressed, indented). */
export function exportText(data: SaveData): string {
  return JSON.stringify(data, null, 1);
}

/**
 * Import a save file's text (PLAN §11.3): decode, migrate and validate it first, and only
 * then write it as the current save. On any error nothing is overwritten.
 */
export async function importSave(text: string): Promise<SaveData> {
  const data = await decodeSave(text);
  const result = writeStorage(SAVE_KEY, await encodeSave(data));
  if (result !== 'ok') throw new SaveError(`storage (${result})`);
  return data;
}
