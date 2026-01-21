/**
 * LanguageProvider - Global language state management
 *
 * This provider handles:
 * 1. Loading the user's preferred language on app launch from AsyncStorage
 * 2. Syncing language changes to the TMDB API client
 * 3. Syncing language changes to i18next for UI translations
 * 4. Resetting React Query cache when language changes
 * 5. Providing a loading state for splash screen
 */
import { setApiLanguage } from '@/src/api/tmdb';
import i18n from '@/src/i18n';
import { getStoredLanguage, setStoredLanguage } from '@/src/utils/languageStorage';
import { useQueryClient } from '@tanstack/react-query';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

interface LanguageContextValue {
  language: string;
  isLanguageReady: boolean;
  setLanguage: (language: string) => Promise<void>;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

/**
 * Supported languages configuration
 * All LTR (left-to-right) languages supported by TMDB
 * Sorted alphabetically by English name for easy navigation
 */
export const SUPPORTED_LANGUAGES = [
  { code: 'zh-CN', nativeName: '中文 (简体)', englishName: 'Chinese (Simplified)' },
  { code: 'zh-TW', nativeName: '中文 (繁體)', englishName: 'Chinese (Traditional)' },
  { code: 'da-DK', nativeName: 'Dansk', englishName: 'Danish' },
  { code: 'nl-NL', nativeName: 'Nederlands', englishName: 'Dutch' },
  { code: 'en-US', nativeName: 'English', englishName: 'English' },
  { code: 'fi-FI', nativeName: 'Suomi', englishName: 'Finnish' },
  { code: 'fr-FR', nativeName: 'Français', englishName: 'French' },
  { code: 'de-DE', nativeName: 'Deutsch', englishName: 'German' },
  { code: 'el-GR', nativeName: 'Ελληνικά', englishName: 'Greek' },
  { code: 'hi-IN', nativeName: 'हिन्दी', englishName: 'Hindi' },
  { code: 'hu-HU', nativeName: 'Magyar', englishName: 'Hungarian' },
  { code: 'id-ID', nativeName: 'Bahasa Indonesia', englishName: 'Indonesian' },
  { code: 'it-IT', nativeName: 'Italiano', englishName: 'Italian' },
  { code: 'ja-JP', nativeName: '日本語', englishName: 'Japanese' },
  { code: 'ko-KR', nativeName: '한국어', englishName: 'Korean' },
  { code: 'no-NO', nativeName: 'Norsk', englishName: 'Norwegian' },
  { code: 'pl-PL', nativeName: 'Polski', englishName: 'Polish' },
  { code: 'pt-BR', nativeName: 'Português (Brasil)', englishName: 'Portuguese (Brazil)' },
  { code: 'pt-PT', nativeName: 'Português (Portugal)', englishName: 'Portuguese (Portugal)' },
  { code: 'ro-RO', nativeName: 'Română', englishName: 'Romanian' },
  { code: 'ru-RU', nativeName: 'Русский', englishName: 'Russian' },
  { code: 'es-ES', nativeName: 'Español (España)', englishName: 'Spanish (Spain)' },
  { code: 'es-MX', nativeName: 'Español (México)', englishName: 'Spanish (Mexico)' },
  { code: 'sv-SE', nativeName: 'Svenska', englishName: 'Swedish' },
  { code: 'th-TH', nativeName: 'ไทย', englishName: 'Thai' },
  { code: 'tr-TR', nativeName: 'Türkçe', englishName: 'Turkish' },
  { code: 'uk-UA', nativeName: 'Українська', englishName: 'Ukrainian' },
  { code: 'vi-VN', nativeName: 'Tiếng Việt', englishName: 'Vietnamese' },
] as const;

export type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

interface LanguageProviderProps {
  children: React.ReactNode;
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const queryClient = useQueryClient();

  const [language, setLanguageState] = useState<string>('en-US');
  const [isLanguageReady, setIsLanguageReady] = useState(false);

  // Initialize language on mount from AsyncStorage
  useEffect(() => {
    const initLanguage = async () => {
      const storedLanguage = await getStoredLanguage();
      setLanguageState(storedLanguage);
      setApiLanguage(storedLanguage);
      // Sync i18next with stored language
      await i18n.changeLanguage(storedLanguage);
      setIsLanguageReady(true);
    };

    initLanguage();
  }, []);

  // Reset all TMDB-related queries to refetch in new language
  const resetQueries = useCallback(() => {
    queryClient.resetQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        // Skip user-specific queries that don't depend on language
        const userQueries = [
          'preferences',
          'lists',
          'ratings',
          'favorites',
          'reminders',
          'notes',
          'episodeTracking',
          'watched',
        ];
        return typeof key === 'string' && !userQueries.includes(key);
      },
    });
  }, [queryClient]);

  const setLanguage = useCallback(
    async (newLanguage: string) => {
      if (newLanguage === language) return;

      // Update state immediately for responsive UI
      setLanguageState(newLanguage);
      setApiLanguage(newLanguage);

      // Sync i18next for UI translations
      await i18n.changeLanguage(newLanguage);

      // Persist to AsyncStorage
      await setStoredLanguage(newLanguage);

      // Reset cache to refetch content in new language
      resetQueries();
    },
    [language, resetQueries]
  );

  return (
    <LanguageContext.Provider value={{ language, isLanguageReady, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

/**
 * Hook to access language context
 */
export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
