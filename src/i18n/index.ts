import { en } from './en';
import { fr } from './fr';

export type MessageKey = keyof typeof fr;
export type Locale = 'fr' | 'en';

const dictionaries: Record<Locale, Record<MessageKey, string>> = { fr, en };

let current: Locale = 'fr';

export function setLocale(locale: Locale): void {
  current = locale;
}

export function getLocale(): Locale {
  return current;
}

/** Pick the initial locale from a browser language tag; French is the default. */
export function detectLocale(language: string | undefined): Locale {
  return language?.toLowerCase().startsWith('en') ? 'en' : 'fr';
}

export function t(key: MessageKey): string {
  return dictionaries[current][key];
}

export const LOCALES: readonly Locale[] = ['fr', 'en'];
export const MESSAGES = dictionaries;
