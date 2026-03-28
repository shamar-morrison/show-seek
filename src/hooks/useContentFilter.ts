import { useMemo } from 'react';
import { useAuth } from '../context/auth';
import { isReleased } from '../utils/dateUtils';
import { hasListItemInMap, type ListItemMediaType } from '../utils/listItemKeys';
import { useLists } from './useLists';
import { usePreferences } from './usePreferences';

interface MediaItem {
  id: number;
  media_type?: ListItemMediaType;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  [key: string]: any;
}

export interface ContentFilterDiagnostics {
  allItemsRemovedByPreferences: boolean;
  removedByPreferences: boolean;
  removedByUnreleasedContent: boolean;
  removedByWatchedContent: boolean;
}

export interface ContentFilterResult<T> {
  diagnostics: ContentFilterDiagnostics;
  filteredItems: T[];
}

const EMPTY_FILTER_DIAGNOSTICS: ContentFilterDiagnostics = {
  allItemsRemovedByPreferences: false,
  removedByPreferences: false,
  removedByUnreleasedContent: false,
  removedByWatchedContent: false,
};

const resolveMediaType = (item: MediaItem): ListItemMediaType | null => {
  if (item.media_type === 'movie' || item.media_type === 'tv') {
    return item.media_type;
  }

  if (typeof item.title === 'string' || typeof item.release_date === 'string') {
    return 'movie';
  }

  if (typeof item.name === 'string' || typeof item.first_air_date === 'string') {
    return 'tv';
  }

  return null;
};

const applyContentFilters = <T extends MediaItem>(
  items: T[] | undefined,
  isAuthenticated: boolean,
  hideWatchedContent: boolean,
  hideUnreleasedContent: boolean,
  lists: Array<{ id: string; items?: Record<string, unknown> }> | undefined
): ContentFilterResult<T> => {
  if (!items?.length) {
    return {
      diagnostics: EMPTY_FILTER_DIAGNOSTICS,
      filteredItems: [],
    };
  }

  if (!isAuthenticated) {
    return {
      diagnostics: EMPTY_FILTER_DIAGNOSTICS,
      filteredItems: items,
    };
  }

  let filteredItems = items;
  let removedByWatchedContent = false;
  let removedByUnreleasedContent = false;

  if (hideWatchedContent) {
    const alreadyWatchedList = lists?.find((list) => list.id === 'already-watched');
    if (alreadyWatchedList?.items) {
      const nextItems = filteredItems.filter((item) => {
        const mediaType = resolveMediaType(item);
        if (!mediaType) {
          return true;
        }

        return !hasListItemInMap(alreadyWatchedList.items, mediaType, item.id);
      });
      removedByWatchedContent = nextItems.length < filteredItems.length;
      filteredItems = nextItems;
    }
  }

  if (hideUnreleasedContent) {
    const nextItems = filteredItems.filter((item) => {
      const releaseDate = item.release_date || item.first_air_date;
      return isReleased(releaseDate);
    });
    removedByUnreleasedContent = nextItems.length < filteredItems.length;
    filteredItems = nextItems;
  }

  const removedByPreferences = removedByWatchedContent || removedByUnreleasedContent;

  return {
    diagnostics: {
      allItemsRemovedByPreferences: removedByPreferences && filteredItems.length === 0,
      removedByPreferences,
      removedByUnreleasedContent,
      removedByWatchedContent,
    },
    filteredItems,
  };
};

export const useContentFilterWithDiagnostics = <T extends MediaItem>(
  items: T[] | undefined
): ContentFilterResult<T> => {
  const { user } = useAuth();
  const { preferences } = usePreferences();
  const isAuthenticated = !!user;
  const hideWatchedContent = !!preferences?.hideWatchedContent;
  const hideUnreleasedContent = !!preferences?.hideUnreleasedContent;
  const shouldSubscribeToLists = isAuthenticated && hideWatchedContent;
  const { data: lists } = useLists({ enabled: shouldSubscribeToLists });

  return useMemo(
    () =>
      applyContentFilters(
        items,
        isAuthenticated,
        hideWatchedContent,
        hideUnreleasedContent,
        lists
      ),
    [hideUnreleasedContent, hideWatchedContent, isAuthenticated, items, lists]
  );
};

/**
 * Hook to filter media items based on user preferences.
 * Supports filtering watched content (hideWatchedContent) and
 * unreleased content (hideUnreleasedContent).
 *
 * @param items - Array of media items to filter
 * @returns Filtered array with watched/unreleased items removed based on preferences
 */
export const useContentFilter = <T extends MediaItem>(items: T[] | undefined): T[] => {
  return useContentFilterWithDiagnostics(items).filteredItems;
};
