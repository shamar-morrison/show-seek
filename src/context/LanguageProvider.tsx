/**
 * LanguageProvider - Global language state management
 *
 * This provider handles:
 * 1. Loading the user's preferred language on app launch
 * 2. Syncing language changes to the TMDB API client
 * 3. Invalidating React Query cache when language changes
 * 4. Providing a loading state for splash screen
 */
import { setApiLanguage } from '@/src/api/tmdb';
import { auth } from '@/src/firebase/config';
import { usePreferences, useUpdatePreference } from '@/src/hooks/usePreferences';
import { DEFAULT_PREFERENCES } from '@/src/types/preferences';
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
  const { preferences, isLoading: preferencesLoading } = usePreferences();
  const updatePreference = useUpdatePreference();

  const [language, setLanguageState] = useState<string>(DEFAULT_PREFERENCES.language);
  const [isLanguageReady, setIsLanguageReady] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  const userId = auth.currentUser?.uid;
  const isGuest = auth.currentUser?.isAnonymous === true;

  // Initialize language on mount
  useEffect(() => {
    const initLanguage = async () => {
      let initialLanguage = DEFAULT_PREFERENCES.language;

      if (isGuest || !userId) {
        // Guest user or not logged in - use AsyncStorage
        const storedLang = await getStoredLanguage();
        if (storedLang) {
          initialLanguage = storedLang;
        }
      } else if (!preferencesLoading && preferences?.language) {
        // Logged-in user - use Firestore preferences
        initialLanguage = preferences.language;
      } else if (preferencesLoading) {
        // Still loading preferences, wait
        return;
      }

      setLanguageState(initialLanguage);
      setApiLanguage(initialLanguage);
      setIsLanguageReady(true);
      setHasInitialized(true);
    };

    initLanguage();
  }, [userId, isGuest, preferences?.language, preferencesLoading]);

  // Sync language changes from preferences (for logged-in users)
  useEffect(() => {
    if (!hasInitialized || isGuest || !userId) return;

    if (preferences?.language && preferences.language !== language) {
      setLanguageState(preferences.language);
      setApiLanguage(preferences.language);
      // Invalidate cache when language changes from external source
      invalidateAllQueries();
    }
  }, [preferences?.language, hasInitialized, isGuest, userId]);

  // Invalidate all TMDB-related queries to refetch in new language
  const invalidateAllQueries = useCallback(() => {
    // Invalidate all queries except user-specific ones (preferences, lists, etc.)
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        // Skip user-specific queries that don't depend on language
        const userQueries = ['preferences', 'lists', 'ratings', 'favorites', 'reminders', 'notes'];
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

      // Persist the change
      if (isGuest || !userId) {
        // Guest user - store in AsyncStorage
        await setStoredLanguage(newLanguage);
      } else {
        // Logged-in user - store in Firestore
        await updatePreference.mutateAsync({ key: 'language', value: newLanguage as any });
      }

      // Invalidate cache to refetch content in new language
      invalidateAllQueries();
    },
    [language, isGuest, userId, updatePreference, invalidateAllQueries]
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
