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

interface FilterableMedia {
  genre_ids?: number[];
  genres?: { id: number; name?: string }[];
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
}

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
      const releaseDate = item.release_date || item.first_air_date;
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
 * Generic filter function for rating items.
 * Works with enriched ratings by using a getter function to extract media properties.
 */
export function filterRatingItems<T>(
  items: T[],
  filters: WatchStatusFilterState,
  getMedia: (item: T) => FilterableMedia | null | undefined
): T[] {
  return items.filter((item) => {
    const media = getMedia(item);
    if (!media) return false;

    // Genre filter - check both genre_ids (list response) and genres (detail response)
    if (filters.genre !== null) {
      const hasGenreId = media.genre_ids?.includes(filters.genre);
      const hasGenre = media.genres?.some((g) => g.id === filters.genre);
      if (!hasGenreId && !hasGenre) {
        return false;
      }
    }

    // Rating filter (TMDB rating, not user rating)
    if (filters.rating > 0) {
      if (!media.vote_average || media.vote_average < filters.rating) {
        return false;
      }
    }

    // Year filter
    if (filters.year !== null) {
      const releaseDate = media.release_date || media.first_air_date;
      if (!releaseDate) {
        return false;
      }

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
