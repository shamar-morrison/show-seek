/**
 * "Longest text" test language (development builds only).
 *
 * For each translation key it uses the longest translation across every locale, so one pass
 * through the app shows the worst case of all of them: long words (pt-BR "Configurações"),
 * long sentences (fr-FR) and long labels together. It changes only the UI text: the selected
 * language, TMDB content and what is saved stay as they are.
 *
 * Its code is Android's pseudo-locale `en-XA`: a valid locale tag, so date and number formatting
 * keep working (with English rules) and plurals resolve to the `_one`/`_other` keys every
 * locale has.
 */
import i18n from 'i18next';

export const LONGEST_TEXT_LANGUAGE = 'en-XA';

type TranslationTree = { [key: string]: string | TranslationTree };

/**
 * A tree shaped like `reference` whose every string is the longest of that key's translations
 * in `locales` (the reference included). Keys missing from a locale are skipped for it.
 */
export function buildLongestTranslations(
  reference: TranslationTree,
  locales: TranslationTree[]
): TranslationTree {
  const result: TranslationTree = {};
  for (const [key, value] of Object.entries(reference)) {
    if (typeof value === 'string') {
      let longest = value;
      for (const locale of locales) {
        const candidate = locale?.[key];
        if (typeof candidate === 'string' && candidate.length > longest.length) {
          longest = candidate;
        }
      }
      result[key] = longest;
    } else {
      const nested = locales.map((locale) => {
        const candidate = locale?.[key];
        return candidate && typeof candidate === 'object' ? candidate : {};
      });
      result[key] = buildLongestTranslations(value, nested);
    }
  }
  return result;
}

let languageBeforeLongestText: string | null = null;

export function isLongestTextEnabled(): boolean {
  return i18n.language === LONGEST_TEXT_LANGUAGE;
}

/**
 * Switches the UI text to the longest translations, or back to the language it showed before.
 * Development builds only; it never touches the saved language. Anything that applies a
 * language (choosing a different one, signing in or out) also switches it off.
 */
export async function setLongestTextEnabled(enabled: boolean): Promise<void> {
  if (!__DEV__ || enabled === isLongestTextEnabled()) {
    return;
  }
  if (enabled) {
    languageBeforeLongestText = i18n.language;
    await i18n.changeLanguage(LONGEST_TEXT_LANGUAGE);
  } else {
    await i18n.changeLanguage(languageBeforeLongestText ?? 'en-US');
    languageBeforeLongestText = null;
  }
}
