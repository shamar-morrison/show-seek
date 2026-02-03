/**
 * User preferences types
 */

/**
 * Types of lists that can appear on home screen
 */
export type HomeListType = 'tmdb' | 'default' | 'custom';

/**
 * Valid routes for the default launch screen preference
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
  defaultLaunchScreen?: LaunchScreenRoute; // Which tab to open on app launch
  hideWatchedContent: boolean; // Premium: hide watched content from search/discover
  hideUnreleasedContent: boolean; // Hide unreleased movies/TV shows from search/discover
  markPreviousEpisodesWatched: boolean; // Auto-mark previous episodes when marking an episode as watched
  hideTabLabels: boolean; // Hide labels on bottom tab bar, show only icons
  dataSaver: boolean; // Load lower resolution images to save data
  // Onboarding-related preferences
  onboardingCompleted?: boolean; // Whether user has completed post-auth onboarding wizard
  favoriteGenres?: number[]; // TMDB genre IDs selected during onboarding
  watchProviders?: number[]; // TMDB provider IDs selected during onboarding
  preferredContentTypes?: 'movie' | 'tv' | 'both'; // User's preferred content type
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  autoAddToWatching: true,
  autoAddToAlreadyWatched: true,
  blurPlotSpoilers: false,
  showListIndicators: false, // Off by default for new users
  quickMarkAsWatched: false, // Off by default - show date selection modal
  defaultLaunchScreen: '/(tabs)/home',
  hideWatchedContent: false, // Off by default - show all content
  hideUnreleasedContent: false, // Off by default - show unreleased content
  markPreviousEpisodesWatched: false, // Off by default - only mark selected episode
  hideTabLabels: false, // Off by default - show labels
  dataSaver: false, // Off by default - load full quality images
  // Onboarding defaults
  onboardingCompleted: false, // New users haven't completed onboarding
  favoriteGenres: [],
  watchProviders: [],
  preferredContentTypes: 'both',
};
