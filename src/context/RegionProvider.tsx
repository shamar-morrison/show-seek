/**
 * RegionProvider - Global region state management
 *
 * This provider handles:
 * 1. Loading the user's preferred region on app launch from AsyncStorage (instant)
 * 2. Syncing region changes to AsyncStorage + Firebase (fire-and-forget)
 * 3. Restoring region from Firebase on login for cross-device sync
 *
 * Region affects: watch providers, release dates, and certifications
 */
import { setApiRegion } from '@/src/api/tmdb';
import { useAuth } from '@/src/context/auth';
import {
  fetchRegionFromFirebase,
  getStoredRegion,
  setStoredRegion,
  syncRegionToFirebase,
} from '@/src/utils/regionStorage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

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
const DEFAULT_REGION: SupportedRegionCode = 'US';
const SUPPORTED_REGION_CODES = new Set<string>(SUPPORTED_REGIONS.map((region) => region.code));

function isSupportedRegionCode(region: string): region is SupportedRegionCode {
  return SUPPORTED_REGION_CODES.has(region);
}

interface RegionProviderProps {
  children: React.ReactNode;
}

export function RegionProvider({ children }: RegionProviderProps) {
  const { user } = useAuth();
  const [region, setRegionState] = useState<string>(DEFAULT_REGION);
  const [isRegionReady, setIsRegionReady] = useState(false);
  const hasSyncedFromFirebase = useRef(false);

  // 1. Load from AsyncStorage on mount (instant)
  useEffect(() => {
    let isMounted = true;

    const initRegion = async () => {
      try {
        const storedRegion = await getStoredRegion();
        const safeRegion = isSupportedRegionCode(storedRegion) ? storedRegion : DEFAULT_REGION;

        if (isMounted) {
          setRegionState(safeRegion);
        }
        setApiRegion(safeRegion);
      } catch (error) {
        console.error('[RegionProvider] Init failed, using default region:', error);
        setApiRegion(DEFAULT_REGION);
      } finally {
        if (isMounted) {
          setIsRegionReady(true);
        }
      }
    };

    void initRegion();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Sync from Firebase on login (cross-device restore)
  useEffect(() => {
    if (!user) {
      hasSyncedFromFirebase.current = false;
      return;
    }

    // Only sync once per login session to avoid unnecessary reads.
    if (hasSyncedFromFirebase.current) return;
    hasSyncedFromFirebase.current = true;

    const syncFromFirebase = async () => {
      const firebaseRegion = await fetchRegionFromFirebase();
      if (firebaseRegion && isSupportedRegionCode(firebaseRegion) && firebaseRegion !== region) {
        setRegionState(firebaseRegion);
        setApiRegion(firebaseRegion);
        await setStoredRegion(firebaseRegion);
      }
    };

    syncFromFirebase();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // 3. Set region: state (instant) -> AsyncStorage -> Firebase (fire-and-forget)
  const setRegion = useCallback(
    async (newRegion: string) => {
      if (newRegion === region) return;
      if (!isSupportedRegionCode(newRegion)) return;

      // Update state immediately for responsive UI
      setRegionState(newRegion);
      setApiRegion(newRegion);

      // Persist to AsyncStorage
      await setStoredRegion(newRegion);

      // Sync to Firebase in the background (non-blocking)
      syncRegionToFirebase(newRegion);
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
