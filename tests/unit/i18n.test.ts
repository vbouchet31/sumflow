import { describe, expect, it } from 'vitest';
import { detectLocale, LOCALES, MESSAGES, setLocale, t } from '../../src/i18n';

describe('i18n', () => {
  it('has the same keys in every locale', () => {
    const reference = Object.keys(MESSAGES.fr).sort();
    for (const locale of LOCALES) {
      expect(Object.keys(MESSAGES[locale]).sort()).toEqual(reference);
    }
  });

  it('has no empty message', () => {
    for (const locale of LOCALES) {
      for (const value of Object.values(MESSAGES[locale])) {
        expect(value.trim()).not.toBe('');
      }
    }
  });

  it('defaults to French and detects English', () => {
    expect(detectLocale(undefined)).toBe('fr');
    expect(detectLocale('fr-FR')).toBe('fr');
    expect(detectLocale('de-DE')).toBe('fr');
    expect(detectLocale('en-US')).toBe('en');
  });

  it('translates with the current locale', () => {
    setLocale('en');
    expect(t('app.tagline')).toBe('The number factory');
    setLocale('fr');
    expect(t('app.tagline')).toBe("L'usine à nombres");
  });
});
