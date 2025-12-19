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
  homeScreenLists?: HomeScreenListItem[]; // Optional, falls back to defaults
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  autoAddToWatching: true,
};
