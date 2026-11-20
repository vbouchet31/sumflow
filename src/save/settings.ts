import { LOCALES, type Locale } from '../i18n';
import { readStorage, SETTINGS_KEY, writeStorage } from './persist';

/** Autosave intervals offered in the options, in seconds (0 = never). PLAN §9.4. */
export const AUTOSAVE_CHOICES = [30, 60, 300, 0] as const;
export type AutosaveSeconds = (typeof AUTOSAVE_CHOICES)[number];

/** Player options stored apart from the game (`sumflow.settings`, PLAN §11.3). */
export interface Settings {
  locale: Locale;
  /** Sound effects volume, 0 to 100. */
  volume: number;
  showGrid: boolean;
  /** Numbers on items: always (as soon as discs are drawn) or by zoom level (§10.3). */
  itemValues: 'always' | 'zoom';
  autosave: AutosaveSeconds;
  reduceMotion: boolean;
  /** Belt drag: automatic L (`l`) or along the pointer's path (`free`). */
  beltDraw: 'l' | 'free';
}

export function defaultSettings(locale: Locale, reduceMotion: boolean): Settings {
  return {
    locale,
    volume: 60,
    showGrid: true,
    itemValues: 'zoom',
    autosave: 60,
    reduceMotion,
    beltDraw: 'l',
  };
}

/** Merge stored settings over the defaults, ignoring anything invalid. */
export function parseSettings(text: string | null, defaults: Settings): Settings {
  const out = { ...defaults };
  if (!text) return out;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return out;
  }
  if (typeof raw !== 'object' || raw === null) return out;
  const o = raw as Record<string, unknown>;
  if ((LOCALES as readonly unknown[]).includes(o['locale'])) out.locale = o['locale'] as Locale;
  const v = o['volume'];
  if (typeof v === 'number' && Number.isFinite(v))
    out.volume = Math.min(100, Math.max(0, Math.round(v)));
  if (typeof o['showGrid'] === 'boolean') out.showGrid = o['showGrid'];
  if (o['itemValues'] === 'always' || o['itemValues'] === 'zoom') out.itemValues = o['itemValues'];
  if ((AUTOSAVE_CHOICES as readonly unknown[]).includes(o['autosave'])) {
    out.autosave = o['autosave'] as AutosaveSeconds;
  }
  if (typeof o['reduceMotion'] === 'boolean') out.reduceMotion = o['reduceMotion'];
  if (o['beltDraw'] === 'l' || o['beltDraw'] === 'free') out.beltDraw = o['beltDraw'];
  return out;
}

export function loadSettings(defaults: Settings): Settings {
  return parseSettings(readStorage(SETTINGS_KEY), defaults);
}

export function storeSettings(settings: Settings): void {
  writeStorage(SETTINGS_KEY, JSON.stringify(settings));
}
