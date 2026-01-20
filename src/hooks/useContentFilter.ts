import { useMemo } from 'react';
import { useAuth } from '../context/auth';
import { useLists } from './useLists';
import { usePreferences } from './usePreferences';

interface MediaItem {
  id: number;
  [key: string]: any;
}

/**
 * Hook to filter media items based on the hideWatchedContent preference.
 * Uses the "Already Watched" list as the sole source of truth.
 *
 * @param items - Array of media items to filter
 * @returns Filtered array with watched items removed (if preference enabled)
 */
export const useContentFilter = <T extends MediaItem>(items: T[] | undefined): T[] => {
  const { preferences } = usePreferences();
  const { data: lists } = useLists();
  const { user } = useAuth();
  const isAuthenticated = !!user;

  return useMemo(() => {
    if (!items) return [];
    // Don't filter if user is not authenticated (prevents crash on sign-out)
    if (!isAuthenticated) return items;
    if (!preferences?.hideWatchedContent) return items;

    // Get the "Already Watched" list
    const alreadyWatchedList = lists?.find((list) => list.id === 'already-watched');
    if (!alreadyWatchedList?.items) return items;

    // Create a Set of watched IDs for O(1) lookup
    const watchedIds = new Set(Object.keys(alreadyWatchedList.items).map(Number));

    return items.filter((item) => !watchedIds.has(item.id));
  }, [items, preferences?.hideWatchedContent, lists, isAuthenticated]);
};
