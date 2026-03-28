/**
 * LanguageProvider - Global language state management
 *
 * This provider handles:
 * 1. Loading the user's preferred language on app launch from AsyncStorage
 * 2. Syncing language changes to AsyncStorage + Firebase when requested
 * 3. Restoring language from Firebase on login for cross-device sync
 * 4. Syncing language changes to the TMDB API client
 * 5. Syncing language changes to i18next for UI translations
 * 6. Resetting React Query cache when language changes
 * 7. Providing a loading state for splash screen
 */
import { setApiLanguage } from '@/src/api/tmdb';
import {
  DEFAULT_LANGUAGE,
  isSupportedLanguageCode,
  SUPPORTED_LANGUAGES,
  type SupportedLanguageCode,
} from '@/src/constants/supportedLanguages';
import { useAuth } from '@/src/context/auth';
import i18n from '@/src/i18n';
import {
  fetchLanguageFromFirebase,
  getStoredLanguage,
  setStoredLanguage,
  syncLanguageToFirebase,
} from '@/src/utils/languageStorage';
import { useQueryClient } from '@tanstack/react-query';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export interface SetLanguageOptions {
  syncToFirebase?: boolean;
}

export { SUPPORTED_LANGUAGES };
export type { SupportedLanguageCode };

interface LanguageContextValue {
  language: string;
  isLanguageReady: boolean;
  setLanguage: (language: string, options?: SetLanguageOptions) => Promise<void>;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

interface LanguageProviderProps {
  children: React.ReactNode;
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [language, setLanguageState] = useState<string>(DEFAULT_LANGUAGE);
  const [isLanguageReady, setIsLanguageReady] = useState(false);
  const hasSyncedFromFirebase = useRef(false);

  // Initialize language on mount from AsyncStorage
  useEffect(() => {
    let isMounted = true;

    const initLanguage = async () => {
      try {
        const storedLanguage = await getStoredLanguage();
        if (!isMounted) return;

        const safeLanguage = isSupportedLanguageCode(storedLanguage)
          ? storedLanguage
          : DEFAULT_LANGUAGE;

        setLanguageState(safeLanguage);
        setApiLanguage(safeLanguage);
        // Sync i18next with stored language
        await i18n.changeLanguage(safeLanguage);
      } catch (error) {
        console.error('[LanguageProvider] Init failed, using default language:', error);
      } finally {
        if (isMounted) {
          setIsLanguageReady(true);
        }
      }
    };

    void initLanguage();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!user || user.isAnonymous) {
      hasSyncedFromFirebase.current = false;
      return;
    }

    if (hasSyncedFromFirebase.current) return;
    hasSyncedFromFirebase.current = true;

    const syncFromFirebase = async () => {
      const firebaseLanguage = await fetchLanguageFromFirebase();
      if (!firebaseLanguage || firebaseLanguage === language) {
        return;
      }

      setLanguageState(firebaseLanguage);
      setApiLanguage(firebaseLanguage);
      await i18n.changeLanguage(firebaseLanguage);
      await setStoredLanguage(firebaseLanguage);
      resetQueries();
    };

    void syncFromFirebase();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

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
    async (newLanguage: string, options: SetLanguageOptions = {}) => {
      if (newLanguage === language) return;
      if (!isSupportedLanguageCode(newLanguage)) return;

      const { syncToFirebase = true } = options;

      // Update state immediately for responsive UI
      setLanguageState(newLanguage);
      setApiLanguage(newLanguage);

      // Sync i18next for UI translations
      await i18n.changeLanguage(newLanguage);

      // Persist to AsyncStorage
      await setStoredLanguage(newLanguage);

      if (syncToFirebase) {
        syncLanguageToFirebase(newLanguage);
      }

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
