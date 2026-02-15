import { READ_QUERY_CACHE_WINDOWS } from '@/src/config/readOptimization';
import { useAuth } from '@/src/context/auth';
import { ListMembershipIndex, listService } from '@/src/services/ListService';
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
  const userId = user?.uid;
  const showIndicators = preferences?.showListIndicators ?? false;
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
