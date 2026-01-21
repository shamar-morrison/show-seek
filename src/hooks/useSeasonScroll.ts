import { useCallback, useEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent, ScrollView } from 'react-native';

const SCROLL_INITIAL_DELAY = 300;
const SCROLL_RETRY_INTERVAL = 100;
const SCROLL_MAX_ATTEMPTS = 20;

export interface SeasonLayout {
  y: number;
  height: number;
}

export interface UseSeasonScrollOptions {
  /** The season number to scroll to, or null if no scroll needed */
  targetSeason: number | null;
  /** Total number of seasons (used to validate target exists) */
  seasonCount: number;
  /** Whether scrolling should be enabled */
  enabled: boolean;
}

export interface UseSeasonScrollReturn {
  /** Ref to attach to the ScrollView */
  scrollViewRef: React.RefObject<ScrollView | null>;
  /** Map of season layouts for measurements */
  seasonRefs: React.RefObject<Map<number, SeasonLayout>>;
  /** Handler to capture layout measurements for a season */
  getSeasonLayoutHandler: (seasonNumber: number) => (event: LayoutChangeEvent) => void;
  /** Whether the initial scroll has completed */
  hasScrolledToSeason: boolean;
}

/**
 * Hook to manage auto-scrolling to a specific season in a ScrollView.
 * Handles the retry mechanism needed when layout measurements aren't immediately available.
 */
export function useSeasonScroll({
  targetSeason,
  seasonCount,
  enabled,
}: UseSeasonScrollOptions): UseSeasonScrollReturn {
  const scrollViewRef = useRef<ScrollView | null>(null);
  const seasonRefs = useRef<Map<number, SeasonLayout>>(new Map());
  const [hasScrolledToSeason, setHasScrolledToSeason] = useState(false);

  // Auto-scroll to selected season when data is loaded and layout is complete
  useEffect(() => {
    if (!targetSeason || hasScrolledToSeason || seasonCount === 0 || !enabled) {
      return;
    }

    // Retry mechanism to wait for layout measurements
    let attempts = 0;
    const maxAttempts = SCROLL_MAX_ATTEMPTS; // Try for up to 2 seconds (20 * 100ms)
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isCancelled = false;

    const tryScroll = () => {
      if (isCancelled) return;

      const seasonLayout = seasonRefs.current.get(targetSeason);

      if (seasonLayout && scrollViewRef.current) {
        // Layout is ready, perform scroll
        const scrollToY = Math.max(0, seasonLayout.y - 20);

        scrollViewRef.current.scrollTo({
          y: scrollToY,
          animated: true,
        });

        setHasScrolledToSeason(true);
      } else if (attempts < maxAttempts) {
        // Layout not ready yet, try again
        attempts++;
        timeoutId = setTimeout(tryScroll, SCROLL_RETRY_INTERVAL);
      } else {
        // Give up after max attempts
        console.warn(`Could not scroll to season ${targetSeason} - layout not measured`);
        setHasScrolledToSeason(true);
      }
    };

    // Start trying after a short initial delay to let React render
    timeoutId = setTimeout(tryScroll, SCROLL_INITIAL_DELAY);

    return () => {
      isCancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [targetSeason, hasScrolledToSeason, seasonCount, enabled]);

  const getSeasonLayoutHandler = useCallback(
    (seasonNumber: number) => (event: LayoutChangeEvent) => {
      const { y, height } = event.nativeEvent.layout;
      seasonRefs.current.set(seasonNumber, { y, height });
    },
    []
  );

  return {
    scrollViewRef,
    seasonRefs,
    getSeasonLayoutHandler,
    hasScrolledToSeason,
  };
}
