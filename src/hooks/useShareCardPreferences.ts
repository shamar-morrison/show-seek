import { SHARE_CARD_FORMAT_KEYS, ShareCardFormat } from '@/src/components/shareCard/shareCardTypes';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'shareCardPreferences';

export interface ShareCardPreferences {
  format: ShareCardFormat;
  showIdentity: boolean;
}

const DEFAULT_PREFERENCES: ShareCardPreferences = {
  format: 'portrait',
  showIdentity: true,
};

function parsePreferences(raw: string | null): ShareCardPreferences {
  if (!raw) return DEFAULT_PREFERENCES;

  try {
    const parsed = JSON.parse(raw);
    return {
      format: SHARE_CARD_FORMAT_KEYS.includes(parsed?.format)
        ? parsed.format
        : DEFAULT_PREFERENCES.format,
      showIdentity:
        typeof parsed?.showIdentity === 'boolean'
          ? parsed.showIdentity
          : DEFAULT_PREFERENCES.showIdentity,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/** Remembers the editor's size and name/photo choices on this device. */
export function useShareCardPreferences() {
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!cancelled) setPreferences(parsePreferences(raw));
      })
      .catch((error) => {
        console.warn('[useShareCardPreferences] Failed to load preferences:', error);
      })
      .finally(() => {
        if (!cancelled) setIsLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const updatePreferences = useCallback(
    (changes: Partial<ShareCardPreferences>) => {
      const next = { ...preferences, ...changes };
      setPreferences(next);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch((error) => {
        console.warn('[useShareCardPreferences] Failed to save preferences:', error);
      });
    },
    [preferences]
  );

  return { ...preferences, isLoaded, updatePreferences };
}
