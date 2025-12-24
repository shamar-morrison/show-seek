import { useCallback, useMemo } from 'react';
import { useLists } from './useLists';
import { usePreferences } from './usePreferences';

/**
 * Hook that provides efficient O(1) lookup for checking if media items
 * are in any of the user's lists.
 *
 * Uses a memoized Set for performance with infinite scroll scenarios.
 * Respects the showListIndicators user preference.
 */
export function useListMembership() {
  const { data: lists } = useLists();
  const { preferences } = usePreferences();

  const showIndicators = preferences?.showListIndicators ?? false;

  // Build a Set of "mediaId-mediaType" strings for O(1) lookup
  const membershipSet = useMemo(() => {
    const set = new Set<string>();
    if (!lists) return set;

    lists.forEach((list) => {
      Object.values(list.items || {}).forEach((item) => {
        set.add(`${item.id}-${item.media_type}`);
      });
    });
    return set;
  }, [lists]);

  // Check if a specific media item is in any list (only if preference is enabled)
  const isInAnyList = useCallback(
    (mediaId: number, mediaType: 'movie' | 'tv') =>
      showIndicators && membershipSet.has(`${mediaId}-${mediaType}`),
    [membershipSet, showIndicators]
  );

  return { isInAnyList, membershipSet, showIndicators };
}
