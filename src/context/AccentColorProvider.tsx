/**
 * AccentColorProvider - Global accent color state management
 *
 * This provider handles:
 * 1. Loading the user's preferred accent color on app launch from AsyncStorage
 * 2. Syncing accent color changes to AsyncStorage
 */
import {
  ACCENT_COLORS,
  DEFAULT_ACCENT_COLOR,
  isAccentColor,
} from '@/src/constants/accentColors';
import { getStoredAccentColor, setStoredAccentColor } from '@/src/utils/accentColorStorage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

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
  const [accentColor, setAccentColorState] = useState<string>(DEFAULT_ACCENT_COLOR);
  const [isAccentReady, setIsAccentReady] = useState(false);

  useEffect(() => {
    const initAccentColor = async () => {
      const storedAccent = await getStoredAccentColor();
      setAccentColorState(storedAccent);
      setIsAccentReady(true);
    };

    initAccentColor();
  }, []);

  const setAccentColor = useCallback(
    async (newColor: string) => {
      if (newColor === accentColor) return;
      if (!isAccentColor(newColor)) return;

      // Update state immediately for responsive UI
      setAccentColorState(newColor);

      // Persist to AsyncStorage
      await setStoredAccentColor(newColor);
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
