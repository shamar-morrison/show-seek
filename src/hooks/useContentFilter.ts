import { useMemo } from 'react';
import { useAuth } from '../context/auth';
import { isReleased } from '../utils/dateUtils';
import { useLists } from './useLists';
import { usePreferences } from './usePreferences';

interface MediaItem {
  id: number;
  release_date?: string;
  first_air_date?: string;
  [key: string]: any;
}

/**
 * Hook to filter media items based on user preferences.
 * Supports filtering watched content (hideWatchedContent) and
 * unreleased content (hideUnreleasedContent).
 *
 * @param items - Array of media items to filter
 * @returns Filtered array with watched/unreleased items removed based on preferences
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

    let result = items;

    // Filter watched content
    if (preferences?.hideWatchedContent) {
      const alreadyWatchedList = lists?.find((list) => list.id === 'already-watched');
      if (alreadyWatchedList?.items) {
        const watchedIds = new Set(Object.keys(alreadyWatchedList.items).map(Number));
        result = result.filter((item) => !watchedIds.has(item.id));
      }
    }

    // Filter unreleased content
    if (preferences?.hideUnreleasedContent) {
      result = result.filter((item) => {
        const releaseDate = item.release_date || item.first_air_date;
        return isReleased(releaseDate);
      });
    }

    return result;
  }, [
    items,
    preferences?.hideWatchedContent,
    preferences?.hideUnreleasedContent,
    lists,
    isAuthenticated,
  ]);
};
