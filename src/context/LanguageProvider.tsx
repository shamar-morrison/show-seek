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
  language: SupportedLanguageCode;
  isLanguageReady: boolean;
  setLanguage: (language: SupportedLanguageCode, options?: SetLanguageOptions) => Promise<void>;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

interface LanguageProviderProps {
  children: React.ReactNode;
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();

  const [language, setLanguageState] = useState<SupportedLanguageCode>(DEFAULT_LANGUAGE);
  const [isLanguageReady, setIsLanguageReady] = useState(false);
  const languageRef = useRef<SupportedLanguageCode>(DEFAULT_LANGUAGE);
  const authenticatedUserIdRef = useRef<string | null>(null);
  const hasSyncedFromFirebase = useRef(false);
  const isSyncingFromFirebase = useRef(false);
  const initializedAuthUserId = useRef<string | null | undefined>(undefined);

  const getCurrentLanguage = useCallback(() => languageRef.current, []);
  const authenticatedUserId = user && !user.isAnonymous ? user.uid : null;
  authenticatedUserIdRef.current = authenticatedUserId;

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

  const applyLanguageLocally = useCallback(
    async (
      nextLanguage: SupportedLanguageCode,
      options: {
        force?: boolean;
        persistToStorage?: boolean;
        resetLanguageQueries?: boolean;
      } = {}
    ) => {
      const {
        force = false,
        persistToStorage = true,
        resetLanguageQueries = true,
      } = options;

      if (!force && nextLanguage === getCurrentLanguage()) {
        return;
      }

      languageRef.current = nextLanguage;
      setLanguageState(nextLanguage);
      setApiLanguage(nextLanguage);
      await i18n.changeLanguage(nextLanguage);

      if (persistToStorage) {
        await setStoredLanguage(nextLanguage);
      }

      if (resetLanguageQueries) {
        resetQueries();
      }
    },
    [getCurrentLanguage, resetQueries]
  );

  useEffect(() => {
    let isActive = true;

    if (loading) {
      return () => {
        isActive = false;
      };
    }

    const syncLocalLanguageWithAuthState = async () => {
      const previousAuthUserId = initializedAuthUserId.current;
      const isFirstResolvedAuthState = previousAuthUserId === undefined;

      if (!isFirstResolvedAuthState && previousAuthUserId === authenticatedUserId) {
        return;
      }

      initializedAuthUserId.current = authenticatedUserId;
      hasSyncedFromFirebase.current = false;
      isSyncingFromFirebase.current = false;

      try {
        if (authenticatedUserId) {
          if (isFirstResolvedAuthState) {
            const storedLanguage = await getStoredLanguage();
            if (!isActive) {
              return;
            }

            const safeLanguage = isSupportedLanguageCode(storedLanguage)
              ? storedLanguage
              : DEFAULT_LANGUAGE;

            await applyLanguageLocally(safeLanguage, {
              force: true,
              persistToStorage: true,
              resetLanguageQueries: false,
            });
          }
        } else {
          await applyLanguageLocally(DEFAULT_LANGUAGE, {
            force: true,
            persistToStorage: true,
            resetLanguageQueries: !isFirstResolvedAuthState,
          });
        }
      } catch (error) {
        console.error('[LanguageProvider] Init failed, using default language:', error);

        if (!isActive) {
          return;
        }

        try {
          await applyLanguageLocally(DEFAULT_LANGUAGE, {
            force: true,
            persistToStorage: true,
            resetLanguageQueries: !isFirstResolvedAuthState,
          });
        } catch (fallbackError) {
          console.error('[LanguageProvider] Default language fallback failed:', fallbackError);
        }
      } finally {
        if (isActive && !isLanguageReady) {
          setIsLanguageReady(true);
        }
      }
    };

    void syncLocalLanguageWithAuthState();

    return () => {
      isActive = false;
    };
  }, [applyLanguageLocally, authenticatedUserId, isLanguageReady, loading]);

  useEffect(() => {
    let isActive = true;

    if (loading || !isLanguageReady) {
      return () => {
        isActive = false;
      };
    }

    if (!authenticatedUserId) {
      return () => {
        isActive = false;
      };
    }

    if (hasSyncedFromFirebase.current || isSyncingFromFirebase.current) {
      return () => {
        isActive = false;
      };
    }

    isSyncingFromFirebase.current = true;
    const syncBaselineLanguage = getCurrentLanguage();
    const syncUserId = authenticatedUserId;

    const syncFromFirebase = async () => {
      try {
        const firebaseLanguage = await fetchLanguageFromFirebase();
        if (!isActive || authenticatedUserIdRef.current !== syncUserId) {
          return;
        }

        const currentLanguage = getCurrentLanguage();
        const didLanguageChangeLocally = currentLanguage !== syncBaselineLanguage;

        if (didLanguageChangeLocally) {
          await syncLanguageToFirebase(currentLanguage, { throwOnError: true });
          if (!isActive || authenticatedUserIdRef.current !== syncUserId) {
            return;
          }

          hasSyncedFromFirebase.current = true;
          return;
        }

        if (!firebaseLanguage || firebaseLanguage === currentLanguage) {
          hasSyncedFromFirebase.current = true;
          return;
        }

        await applyLanguageLocally(firebaseLanguage, {
          persistToStorage: true,
          resetLanguageQueries: true,
        });
        if (!isActive || authenticatedUserIdRef.current !== syncUserId) {
          return;
        }

        hasSyncedFromFirebase.current = true;
      } catch (error) {
        hasSyncedFromFirebase.current = false;
        console.error('[LanguageProvider] Firebase language sync failed:', error);
      } finally {
        isSyncingFromFirebase.current = false;
      }
    };

    void syncFromFirebase();

    return () => {
      isActive = false;
    };
  }, [applyLanguageLocally, authenticatedUserId, getCurrentLanguage, isLanguageReady, loading]);

  const setLanguage = useCallback(
    async (newLanguage: SupportedLanguageCode, options: SetLanguageOptions = {}) => {
      if (newLanguage === getCurrentLanguage()) return;
      if (!isSupportedLanguageCode(newLanguage)) return;

      const { syncToFirebase = true } = options;
      await applyLanguageLocally(newLanguage, {
        persistToStorage: true,
        resetLanguageQueries: true,
      });

      if (syncToFirebase) {
        syncLanguageToFirebase(newLanguage);
      }
    },
    [applyLanguageLocally, getCurrentLanguage]
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
