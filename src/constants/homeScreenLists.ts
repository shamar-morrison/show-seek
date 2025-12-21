import { HomeScreenListItem } from '@/src/types/preferences';

/**
 * Available TMDB lists that can be displayed on the home screen
 */
export const AVAILABLE_TMDB_LISTS = [
  { id: 'latest-trailers', label: 'Latest Trailers' },
  { id: 'trending-movies', label: 'Trending Movies' },
  { id: 'trending-tv', label: 'Trending TV Shows' },
  { id: 'popular-movies', label: 'Popular Movies' },
  { id: 'top-rated-movies', label: 'Top Rated' },
  { id: 'upcoming-movies', label: 'Upcoming Movies' },
  { id: 'upcoming-tv', label: 'Upcoming TV Shows' },
] as const;

export type TMDBListId = (typeof AVAILABLE_TMDB_LISTS)[number]['id'];

/**
 * Default home screen configuration - matches current hardcoded layout
 */
export const DEFAULT_HOME_LISTS: HomeScreenListItem[] = [
  { id: 'latest-trailers', type: 'tmdb', label: 'Latest Trailers' },
  { id: 'trending-movies', type: 'tmdb', label: 'Trending Movies' },
  { id: 'trending-tv', type: 'tmdb', label: 'Trending TV Shows' },
  { id: 'popular-movies', type: 'tmdb', label: 'Popular Movies' },
  { id: 'upcoming-movies', type: 'tmdb', label: 'Upcoming Movies' },
  { id: 'upcoming-tv', type: 'tmdb', label: 'Upcoming TV Shows' },
];

/**
 * Constraints for home screen list selection
 */
export const MAX_HOME_LISTS = 6;
export const MIN_HOME_LISTS = 1;
