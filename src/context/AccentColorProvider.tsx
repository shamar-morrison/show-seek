/**
 * AccentColorProvider - Global accent color state management
 *
 * This provider handles:
 * 1. Loading the user's preferred accent color on app launch from AsyncStorage (instant)
 * 2. Syncing accent color changes to AsyncStorage + Firebase (fire-and-forget)
 * 3. Restoring accent color from Firebase on login for cross-device sync
 */
import { ACCENT_COLORS, DEFAULT_ACCENT_COLOR, isAccentColor } from '@/src/constants/accentColors';
import { useAuth } from '@/src/context/auth';
import {
  fetchAccentColorFromFirebase,
  getStoredAccentColor,
  setStoredAccentColor,
  syncAccentColorToFirebase,
} from '@/src/utils/accentColorStorage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

interface AccentColorContextValue {
  accentColor: string;
  isAccentReady: boolean;
  setAccentColor: (color: string) => Promise<void>;
}

export const AccentColorContext = createContext<AccentColorContextValue | null>(null);

interface AccentColorProviderProps {
  children: React.ReactNode;
}

export function AccentColorProvider({ children }: AccentColorProviderProps) {
  const { user } = useAuth();
  const [accentColor, setAccentColorState] = useState<string>(DEFAULT_ACCENT_COLOR);
  const [isAccentReady, setIsAccentReady] = useState(false);
  const hasSyncedFromFirebase = useRef(false);

  // 1. Load from AsyncStorage on mount (instant)
  useEffect(() => {
    const initAccentColor = async () => {
      const storedAccent = await getStoredAccentColor();
      setAccentColorState(storedAccent);
      setIsAccentReady(true);
    };

    initAccentColor();
  }, []);

  // 2. Sync from Firebase on login (cross-device restore)
  useEffect(() => {
    if (!user) {
      hasSyncedFromFirebase.current = false;
      return;
    }

    // Only sync once per login session to avoid unnecessary reads
    if (hasSyncedFromFirebase.current) return;
    hasSyncedFromFirebase.current = true;

    const syncFromFirebase = async () => {
      const firebaseColor = await fetchAccentColorFromFirebase();
      if (firebaseColor && firebaseColor !== accentColor) {
        setAccentColorState(firebaseColor);
        await setStoredAccentColor(firebaseColor);
      }
    };

    syncFromFirebase();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // 3. Set accent color: state (instant) → AsyncStorage → Firebase (fire-and-forget)
  const setAccentColor = useCallback(
    async (newColor: string) => {
      if (newColor === accentColor) return;
      if (!isAccentColor(newColor)) return;

      // Update state immediately for responsive UI
      setAccentColorState(newColor);

      // Persist to AsyncStorage
      await setStoredAccentColor(newColor);

      // Sync to Firebase in the background (non-blocking)
      syncAccentColorToFirebase(newColor);
    },
    [accentColor]
  );

  return (
    <AccentColorContext.Provider value={{ accentColor, isAccentReady, setAccentColor }}>
      {children}
    </AccentColorContext.Provider>
  );
}

/**
 * Hook to access accent color context
 */
export function useAccentColor() {
  const context = useContext(AccentColorContext);
  if (!context) {
    throw new Error('useAccentColor must be used within an AccentColorProvider');
  }
  return context;
}

export const SUPPORTED_ACCENT_COLORS = ACCENT_COLORS;
