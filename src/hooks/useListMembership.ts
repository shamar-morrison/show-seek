import { useCallback, useMemo } from 'react';
import { useLists } from './useLists';
import { usePreferences } from './usePreferences';

/**
 * Hook that provides efficient O(1) lookup for checking if media items
 * are in any of the user's lists.
 *
 * Uses memoized Maps for performance with infinite scroll scenarios.
 * Respects the showListIndicators user preference.
 */
export function useListMembership() {
  const { preferences } = usePreferences();
  const showIndicators = preferences?.showListIndicators ?? false;
  const { data: lists } = useLists({ enabled: showIndicators });

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

  // Build a Map of "mediaId-mediaType" -> list IDs for per-list icons
  const membershipMap = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!lists) return map;

    lists.forEach((list) => {
      Object.values(list.items || {}).forEach((item) => {
        const key = `${item.id}-${item.media_type}`;
        const existing = map.get(key) || [];
        existing.push(list.id);
        map.set(key, existing);
      });
    });
    return map;
  }, [lists]);

  // Check if a specific media item is in any list (only if preference is enabled)
  const isInAnyList = useCallback(
    (mediaId: number, mediaType: 'movie' | 'tv') =>
      showIndicators && membershipSet.has(`${mediaId}-${mediaType}`),
    [membershipSet, showIndicators]
  );

  // Get list IDs that contain this media item (only if preference is enabled)
  const getListsForMedia = useCallback(
    (mediaId: number, mediaType: 'movie' | 'tv'): string[] => {
      if (!showIndicators) return [];
      return membershipMap.get(`${mediaId}-${mediaType}`) || [];
    },
    [membershipMap, showIndicators]
  );

  return { isInAnyList, getListsForMedia, membershipSet, membershipMap, showIndicators };
}
