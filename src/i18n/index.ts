/**
 * i18n Configuration
 *
 * Initializes i18next with:
 * - React Native integration via react-i18next
 * - Device locale detection (when available)
 * - Pluralization support via intl-pluralrules polyfill
 * - Fallback to English for missing translations
 *
 * Import this file in app/_layout.tsx to initialize at startup.
 */

// Polyfill must be imported first
import 'intl-pluralrules';

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import locale files directly to avoid barrel exports (per React Native best practices)
import enUS from './locales/en-US.json';
import esES from './locales/es-ES.json';
import esMX from './locales/es-MX.json';
import frFR from './locales/fr-FR.json';
import ptBR from './locales/pt-BR.json';
import ptPT from './locales/pt-PT.json';

// Map locale codes to their translation resources
const resources = {
  'en-US': { translation: enUS },
  'fr-FR': { translation: frFR },
  'es-ES': { translation: esES },
  'es-MX': { translation: esMX },
  'pt-BR': { translation: ptBR },
  'pt-PT': { translation: ptPT },
} as const;

// Supported language codes (used for validation)
export const SUPPORTED_I18N_LANGUAGES = Object.keys(resources);

/**
 * Detect initial language from device locale.
 * Falls back to 'en-US' if device locale is not supported or expo-localization is unavailable.
 */
function getInitialLanguage(): string {
  try {
    // Dynamically require to avoid crash if native module isn't available
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Localization = require('expo-localization');
    const deviceLocale = Localization.getLocales?.()[0]?.languageTag;

    if (deviceLocale && deviceLocale in resources) {
      return deviceLocale;
    }

    // Try to match by language code only (e.g., 'fr' -> 'fr-FR')
    if (deviceLocale) {
      const languageCode = deviceLocale.split('-')[0];
      const match = SUPPORTED_I18N_LANGUAGES.find((code) => code.startsWith(languageCode + '-'));
      if (match) {
        return match;
      }
    }
  } catch (error) {
    // expo-localization native module not available (e.g., development build needs rebuild)
    console.warn('[i18n] expo-localization not available, defaulting to en-US');
  }

  return 'en-US';
}

// Initialize i18next
i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: 'en-US',
  interpolation: {
    // React already escapes values, no need for i18next to do it again
    escapeValue: false,
  },
  // Improve performance by not watching for changes in resources
  react: {
    useSuspense: false,
  },
  // Return empty string for missing keys in production (fallback will be used)
  returnEmptyString: false,
  // Use key as fallback if translation is missing (helpful for debugging)
  returnNull: false,
});

export default i18n;
