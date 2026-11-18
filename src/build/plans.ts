import { EDIT } from '../config/balance';
import { clip as validateClip } from '../save/schema';
import type { Clip } from '../sim/clip';

/** Prefix of a shared plan code (proposal 20); the digit is the format version. */
const PREFIX = 'SUMFLOW-PLAN:1:';

/** Text code of a clipboard entry, safe to paste in a chat or a forum post. */
export function encodePlan(clip: Clip): string {
  const json = JSON.stringify(clip);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return PREFIX + btoa(bin);
}

/**
 * Read a plan code back. Throws on anything that is not a valid plan (wrong prefix, bad
 * base64, bad JSON, or a layout the save schema refuses), so a pasted code is never trusted.
 */
export function decodePlan(code: string): Clip {
  const text = code.trim().replace(/\s+/g, '');
  if (!text.startsWith(PREFIX)) throw new Error('not a plan');
  const bin = atob(text.slice(PREFIX.length));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const clip = validateClip(JSON.parse(new TextDecoder().decode(bytes)), '$plan');
  if (clip.w > EDIT.maxSelection || clip.h > EDIT.maxSelection) throw new Error('too big');
  return clip;
}
