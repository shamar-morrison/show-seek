/**
 * User preferences types
 */

/**
 * Types of lists that can appear on home screen
 */
export type HomeListType = 'tmdb' | 'default' | 'custom';

/**
 * Valid routes for launch screen selection (Premium feature)
 */
export type LaunchScreenRoute =
  | '/(tabs)/home'
  | '/(tabs)/discover'
  | '/(tabs)/search'
  | '/(tabs)/library'
  | '/(tabs)/profile';

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
  quickMarkAsWatched: boolean; // Skip modal and use current time when marking movies as watched
  defaultLaunchScreen?: LaunchScreenRoute; // Premium: which tab the app opens to
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  autoAddToWatching: true,
  autoAddToAlreadyWatched: true,
  blurPlotSpoilers: false,
  showListIndicators: false, // Off by default for new users
  quickMarkAsWatched: false, // Off by default - show date selection modal
  defaultLaunchScreen: '/(tabs)/home',
};
