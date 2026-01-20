/**
 * RegionProvider - Global region state management
 *
 * This provider handles:
 * 1. Loading the user's preferred region on app launch from AsyncStorage
 * 2. Syncing region changes to the TMDB API client
 * 3. Providing a loading state for splash screen
 *
 * Region affects: watch providers, release dates, and certifications
 */
import { setApiRegion } from '@/src/api/tmdb';
import { getStoredRegion, setStoredRegion } from '@/src/utils/regionStorage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

interface RegionContextValue {
  region: string;
  isRegionReady: boolean;
  setRegion: (region: string) => Promise<void>;
}

const RegionContext = createContext<RegionContextValue | null>(null);

/**
 * Supported regions configuration
 * Common regions with emoji flags for display
 */
export const SUPPORTED_REGIONS = [
  { code: 'AR', name: 'Argentina', emoji: '🇦🇷' },
  { code: 'AU', name: 'Australia', emoji: '🇦🇺' },
  { code: 'AT', name: 'Austria', emoji: '🇦🇹' },
  { code: 'BE', name: 'Belgium', emoji: '🇧🇪' },
  { code: 'BR', name: 'Brazil', emoji: '🇧🇷' },
  { code: 'CA', name: 'Canada', emoji: '🇨🇦' },
  { code: 'CL', name: 'Chile', emoji: '🇨🇱' },
  { code: 'CO', name: 'Colombia', emoji: '🇨🇴' },
  { code: 'CZ', name: 'Czech Republic', emoji: '🇨🇿' },
  { code: 'DK', name: 'Denmark', emoji: '🇩🇰' },
  { code: 'FI', name: 'Finland', emoji: '🇫🇮' },
  { code: 'FR', name: 'France', emoji: '🇫🇷' },
  { code: 'DE', name: 'Germany', emoji: '🇩🇪' },
  { code: 'GR', name: 'Greece', emoji: '🇬🇷' },
  { code: 'HK', name: 'Hong Kong', emoji: '🇭🇰' },
  { code: 'HU', name: 'Hungary', emoji: '🇭🇺' },
  { code: 'IN', name: 'India', emoji: '🇮🇳' },
  { code: 'ID', name: 'Indonesia', emoji: '🇮🇩' },
  { code: 'IE', name: 'Ireland', emoji: '🇮🇪' },
  { code: 'IL', name: 'Israel', emoji: '🇮🇱' },
  { code: 'IT', name: 'Italy', emoji: '🇮🇹' },
  { code: 'JP', name: 'Japan', emoji: '🇯🇵' },
  { code: 'MY', name: 'Malaysia', emoji: '🇲🇾' },
  { code: 'MX', name: 'Mexico', emoji: '🇲🇽' },
  { code: 'NL', name: 'Netherlands', emoji: '🇳🇱' },
  { code: 'NZ', name: 'New Zealand', emoji: '🇳🇿' },
  { code: 'NO', name: 'Norway', emoji: '🇳🇴' },
  { code: 'PE', name: 'Peru', emoji: '🇵🇪' },
  { code: 'PH', name: 'Philippines', emoji: '🇵🇭' },
  { code: 'PL', name: 'Poland', emoji: '🇵🇱' },
  { code: 'PT', name: 'Portugal', emoji: '🇵🇹' },
  { code: 'RO', name: 'Romania', emoji: '🇷🇴' },
  { code: 'RU', name: 'Russia', emoji: '🇷🇺' },
  { code: 'SG', name: 'Singapore', emoji: '🇸🇬' },
  { code: 'ZA', name: 'South Africa', emoji: '🇿🇦' },
  { code: 'KR', name: 'South Korea', emoji: '🇰🇷' },
  { code: 'ES', name: 'Spain', emoji: '🇪🇸' },
  { code: 'SE', name: 'Sweden', emoji: '🇸🇪' },
  { code: 'CH', name: 'Switzerland', emoji: '🇨🇭' },
  { code: 'TW', name: 'Taiwan', emoji: '🇹🇼' },
  { code: 'TH', name: 'Thailand', emoji: '🇹🇭' },
  { code: 'TR', name: 'Turkey', emoji: '🇹🇷' },
  { code: 'UA', name: 'Ukraine', emoji: '🇺🇦' },
  { code: 'GB', name: 'United Kingdom', emoji: '🇬🇧' },
  { code: 'US', name: 'United States', emoji: '🇺🇸' },
  { code: 'VN', name: 'Vietnam', emoji: '🇻🇳' },
] as const;

export type SupportedRegionCode = (typeof SUPPORTED_REGIONS)[number]['code'];

interface RegionProviderProps {
  children: React.ReactNode;
}

export function RegionProvider({ children }: RegionProviderProps) {
  const [region, setRegionState] = useState<string>('US');
  const [isRegionReady, setIsRegionReady] = useState(false);

  // Initialize region on mount from AsyncStorage
  useEffect(() => {
    const initRegion = async () => {
      const storedRegion = await getStoredRegion();
      setRegionState(storedRegion);
      setApiRegion(storedRegion);
      setIsRegionReady(true);
    };

    initRegion();
  }, []);

  const setRegion = useCallback(
    async (newRegion: string) => {
      if (newRegion === region) return;

      // Update state immediately for responsive UI
      setRegionState(newRegion);
      setApiRegion(newRegion);

      // Persist to AsyncStorage
      await setStoredRegion(newRegion);
    },
    [region]
  );

  return (
    <RegionContext.Provider value={{ region, isRegionReady, setRegion }}>
      {children}
    </RegionContext.Provider>
  );
}

/**
 * Hook to access region context
 */
export function useRegion() {
  const context = useContext(RegionContext);
  if (!context) {
    throw new Error('useRegion must be used within a RegionProvider');
  }
  return context;
}
