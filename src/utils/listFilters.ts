import { ListMediaItem } from '../services/ListService';

export interface WatchStatusFilterState {
  genre: number | null;
  year: number | null;
  rating: number;
}

export const DEFAULT_WATCH_STATUS_FILTERS: WatchStatusFilterState = {
  genre: null,
  year: null,
  rating: 0,
};

/**
 * Filter list media items based on filter criteria
 */
export function filterMediaItems(
  items: ListMediaItem[],
  filters: WatchStatusFilterState
): ListMediaItem[] {
  return items.filter((item) => {
    // Genre filter
    if (filters.genre !== null) {
      // Skip items without genre_ids
      if (!item.genre_ids || !item.genre_ids.includes(filters.genre)) {
        return false;
      }
    }

    // Rating filter
    if (filters.rating > 0) {
      if (!item.vote_average || item.vote_average < filters.rating) {
        return false;
      }
    }

    // Year filter
    if (filters.year !== null) {
      const releaseDate = item.release_date;
      if (!releaseDate) {
        return false;
      }

      // Extract year from date string (format: YYYY-MM-DD or YYYY)
      const yearMatch = releaseDate.match(/^(\d{4})/);
      if (!yearMatch) {
        return false;
      }

      const itemYear = parseInt(yearMatch[1], 10);
      if (itemYear !== filters.year) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Check if any filters are currently active (different from defaults)
 */
export function hasActiveFilters(filters: WatchStatusFilterState): boolean {
  return (
    filters.genre !== DEFAULT_WATCH_STATUS_FILTERS.genre ||
    filters.year !== DEFAULT_WATCH_STATUS_FILTERS.year ||
    filters.rating !== DEFAULT_WATCH_STATUS_FILTERS.rating
  );
}
