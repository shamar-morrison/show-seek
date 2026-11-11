import { useCurrentTab } from '@/src/context/TabContext';
import { requestDiscoverGenre } from '@/src/utils/discoverGenreIntent';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';

/**
 * Opens Discover showing one genre (and Movies or TV to match the page), replacing its filters.
 * From another tab it switches to Discover; from a page inside the Discover tab it goes back to
 * Discover's main screen.
 */
export function useOpenDiscoverGenre(mediaType: 'movie' | 'tv') {
  const router = useRouter();
  const currentTab = useCurrentTab();

  return useCallback(
    (genreId: number) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      requestDiscoverGenre({ mediaType, genreId });
      if (currentTab === 'discover' && router.canDismiss()) {
        router.dismissAll();
      } else {
        router.push('/(tabs)/discover' as any);
      }
    },
    [currentTab, mediaType, router]
  );
}
