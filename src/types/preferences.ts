/**
 * User preferences types
 */

/**
 * Types of lists that can appear on home screen
 */
export type HomeListType = 'tmdb' | 'default' | 'custom';

/**
 * Configuration for a single list item on the home screen
 */
export interface HomeScreenListItem {
  id: string; // e.g., 'trending-movies', 'watchlist', or custom list ID
  type: HomeListType;
  label: string; // Display name
}

export interface UserPreferences {
  autoAddToWatching: boolean;
  autoAddToAlreadyWatched: boolean;
  blurPlotSpoilers: boolean; // Android only - blur movie/TV plot summaries
  showListIndicators: boolean; // Show bookmark badge on cards when item is in a list
  homeScreenLists?: HomeScreenListItem[]; // Optional, falls back to defaults
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  autoAddToWatching: true,
  autoAddToAlreadyWatched: true,
  blurPlotSpoilers: false,
  showListIndicators: false, // Off by default for new users
};
