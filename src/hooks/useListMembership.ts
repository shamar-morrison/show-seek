import { READ_QUERY_CACHE_WINDOWS } from '@/src/config/readOptimization';
import { useAuth } from '@/src/context/auth';
import { ListMembershipIndex, listService } from '@/src/services/ListService';
import {
  getListMembershipKey,
  type ListEntryMediaType,
  type ListItemMediaType,
  type ListItemRef,
} from '@/src/utils/listItemKeys';
import { DEFAULT_PREFERENCES } from '@/src/types/preferences';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
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
  const { user } = useAuth();
  const userId = user && !user.isAnonymous ? user.uid : undefined;
  const showIndicators = preferences?.showListIndicators ?? DEFAULT_PREFERENCES.showListIndicators;
  const cacheWindows = READ_QUERY_CACHE_WINDOWS as typeof READ_QUERY_CACHE_WINDOWS & {
    listIndicatorsStaleTimeMs?: number;
    listIndicatorsGcTimeMs?: number;
  };
  const listIndicatorsStaleTimeMs =
    cacheWindows.listIndicatorsStaleTimeMs ?? READ_QUERY_CACHE_WINDOWS.statusStaleTimeMs;
  const listIndicatorsGcTimeMs =
    cacheWindows.listIndicatorsGcTimeMs ?? READ_QUERY_CACHE_WINDOWS.statusGcTimeMs;

  const membershipIndexQuery = useQuery<ListMembershipIndex>({
    queryKey: ['list-membership-index', userId],
    queryFn: () => listService.getListMembershipIndex(userId!),
    enabled: !!userId && showIndicators,
    staleTime: listIndicatorsStaleTimeMs,
    gcTime: listIndicatorsGcTimeMs,
  });
  const membershipIndex = membershipIndexQuery.data;

  // Build a Set of "mediaId-mediaType" strings for O(1) lookup
  const membershipSet = useMemo(() => {
    const set = new Set<string>();
    if (!membershipIndex) return set;
    Object.keys(membershipIndex).forEach((key) => set.add(key));
    return set;
  }, [membershipIndex]);

  // Build a Map of "mediaId-mediaType" -> list IDs for per-list icons
  const membershipMap = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!membershipIndex) return map;
    Object.entries(membershipIndex).forEach(([key, listIds]) => {
      map.set(key, listIds);
    });
    return map;
  }, [membershipIndex]);

  // Check if a specific movie or show is in any list (only if preference is enabled)
  const isInAnyList = useCallback(
    (mediaId: number, mediaType: ListItemMediaType) => {
      if (!showIndicators) return false;
      const key = getListMembershipKey({ id: mediaId, media_type: mediaType });
      return !!key && membershipSet.has(key);
    },
    [membershipSet, showIndicators]
  );

  // List IDs holding any kind of entry: a movie, a show, a season or an episode (only if the
  // preference is enabled). A season or episode needs its numbers (see toListItemRef).
  const getListsForListItem = useCallback(
    (item: ListItemRef): string[] => {
      if (!showIndicators) return [];
      const key = getListMembershipKey(item);
      return (key && membershipMap.get(key)) || [];
    },
    [membershipMap, showIndicators]
  );

  // List IDs that contain this movie or show (only if preference is enabled). Seasons and
  // episodes need their numbers, so they go through getListsForListItem; here they match nothing.
  const getListsForMedia = useCallback(
    (mediaId: number, mediaType: ListEntryMediaType): string[] =>
      getListsForListItem({ id: mediaId, media_type: mediaType }),
    [getListsForListItem]
  );

  return {
    isInAnyList,
    getListsForMedia,
    getListsForListItem,
    membershipSet,
    membershipMap,
    showIndicators,
  };
}
