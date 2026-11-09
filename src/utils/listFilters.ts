import { ListMediaItem } from '../services/ListService';

export type MediaTypeFilter = 'all' | 'movie' | 'tv';

export type GenreOperator = 'and' | 'or';

export type RuntimeFilter =
  | 'any'
  | 'under30'
  | '30to60'
  | '60to90'
  | '90to120'
  | '120to150'
  | 'over150';

/** 'rated' / 'unrated' check for a rating; a number N (1-9) matches ratings of N or higher. */
export type UserRatingFilter = 'any' | 'rated' | 'unrated' | number;

/** A list filter field that has its own picker. */
export type ListFilterField = 'mediaType' | 'genres' | 'rating' | 'userRating' | 'year' | 'runtime';

export interface WatchStatusFilterState {
  genres: number[];
  genreOperator: GenreOperator;
  year: number | null;
  rating: number;
  mediaType: MediaTypeFilter;
  runtime: RuntimeFilter;
  userRating: UserRatingFilter;
}

export const DEFAULT_WATCH_STATUS_FILTERS: WatchStatusFilterState = {
  genres: [],
  genreOperator: 'or',
  year: null,
  rating: 0,
  mediaType: 'all',
  runtime: 'any',
  userRating: 'any',
};

/** Runtime ranges in minutes; `min` is inclusive and `max` exclusive. TV uses episode length. */
export const RUNTIME_RANGES: Record<Exclude<RuntimeFilter, 'any'>, { min: number; max: number }> = {
  under30: { min: 0, max: 30 },
  '30to60': { min: 30, max: 60 },
  '60to90': { min: 60, max: 90 },
  '90to120': { min: 90, max: 120 },
  '120to150': { min: 120, max: 150 },
  over150: { min: 150, max: Infinity },
};

export const RUNTIME_FILTER_VALUES: Exclude<RuntimeFilter, 'any'>[] = [
  'under30',
  '30to60',
  '60to90',
  '90to120',
  '120to150',
  'over150',
];

/** Extra per-item data for filters that aren't stored on list items. */
export interface ListFilterContext {
  /** User ratings keyed by `${media_type}:${id}`. */
  userRatings?: Map<string, number>;
  /** Runtimes (minutes) found after load, keyed by `${media_type}:${id}`. */
  runtimes?: Map<string, number>;
}

export function getMediaKey(mediaType: 'movie' | 'tv', id: number): string {
  return `${mediaType}:${id}`;
}

function matchesRuntime(minutes: number | undefined, filter: RuntimeFilter): boolean {
  if (filter === 'any') return true;
  if (minutes === undefined || !(minutes > 0)) return false;
  const { min, max } = RUNTIME_RANGES[filter];
  return minutes >= min && minutes < max;
}

function matchesUserRating(rating: number | undefined, filter: UserRatingFilter): boolean {
  if (filter === 'any') return true;
  if (filter === 'rated') return rating !== undefined;
  if (filter === 'unrated') return rating === undefined;
  return rating !== undefined && rating >= filter;
}

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
export function filterMediaItems<T extends ListMediaItem>(
  items: T[],
  filters: WatchStatusFilterState,
  context: ListFilterContext = {}
): T[] {
  return items.filter((item) => {
    // Media type filter
    if (filters.mediaType !== 'all') {
      if (item.media_type !== filters.mediaType) {
        return false;
      }
    }

    // Genre filter (multi-select with AND/OR operator, matching Discover)
    if (filters.genres.length > 0) {
      // Skip items without genre_ids
      if (!item.genre_ids) {
        return false;
      }
      if (filters.genreOperator === 'and') {
        if (!filters.genres.every((genreId) => item.genre_ids!.includes(genreId))) {
          return false;
        }
      } else {
        if (!filters.genres.some((genreId) => item.genre_ids!.includes(genreId))) {
          return false;
        }
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

    const key = getMediaKey(item.media_type, item.id);

    // Runtime filter (stored runtime first, then runtimes found after load)
    if (filters.runtime !== 'any') {
      const minutes =
        item.runtimeMinutes != null && item.runtimeMinutes > 0
          ? item.runtimeMinutes
          : context.runtimes?.get(key);
      if (!matchesRuntime(minutes, filters.runtime)) {
        return false;
      }
    }

    // User rating filter
    if (filters.userRating !== 'any') {
      if (!matchesUserRating(context.userRatings?.get(key), filters.userRating)) {
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
    // Supports multi-select with AND/OR operator, matching Discover
    if (filters.genres.length > 0) {
      const matchesGenre = (genreId: number) => {
        const hasGenreId = media.genre_ids?.includes(genreId);
        const hasGenre = media.genres?.some((g) => g.id === genreId);
        return hasGenreId || hasGenre;
      };
      if (filters.genreOperator === 'and') {
        if (!filters.genres.every(matchesGenre)) {
          return false;
        }
      } else {
        if (!filters.genres.some(matchesGenre)) {
          return false;
        }
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
    filters.genres.length > 0 ||
    filters.year !== DEFAULT_WATCH_STATUS_FILTERS.year ||
    filters.rating !== DEFAULT_WATCH_STATUS_FILTERS.rating ||
    filters.mediaType !== DEFAULT_WATCH_STATUS_FILTERS.mediaType ||
    filters.runtime !== DEFAULT_WATCH_STATUS_FILTERS.runtime ||
    filters.userRating !== DEFAULT_WATCH_STATUS_FILTERS.userRating
  );
}

/**
 * Whether two filter states would show the same results, so applying one over the other
 * changes nothing. Genre order is ignored, and the AND/OR operator only matters once a
 * genre is chosen.
 */
export function areWatchStatusFiltersEqual(
  a: WatchStatusFilterState,
  b: WatchStatusFilterState
): boolean {
  const genresA = new Set(a.genres);
  const sameGenres =
    genresA.size === new Set(b.genres).size && b.genres.every((id) => genresA.has(id));
  return (
    sameGenres &&
    (a.genres.length === 0 || a.genreOperator === b.genreOperator) &&
    a.year === b.year &&
    a.rating === b.rating &&
    a.mediaType === b.mediaType &&
    a.runtime === b.runtime &&
    a.userRating === b.userRating
  );
}
