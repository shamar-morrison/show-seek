/**
 * User preferences types
 */

import type { DetailActionButtonId } from '@/src/utils/detailActionOrder';
import type { SeasonActionButtonId } from '@/src/utils/seasonActionOrder';
import type { ProfileBackground } from '@/src/utils/profileBackground';

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
 * Which episode Watch Progress suggests next when episodes were skipped:
 * - `first-unwatched`: the earliest aired episode not watched yet (a skipped one comes first).
 * - `after-furthest`: the first aired, unwatched episode after the furthest one watched (by
 *   episode order); earlier unwatched episodes count as skipped.
 */
export type ContinueWatchingFrom = 'first-unwatched' | 'after-furthest';

export const CONTINUE_WATCHING_FROM_OPTIONS: readonly ContinueWatchingFrom[] = [
  'first-unwatched',
  'after-furthest',
];

/** The stored value when valid, else the default (`first-unwatched`). */
export const resolveContinueWatchingFrom = (value: unknown): ContinueWatchingFrom =>
  CONTINUE_WATCHING_FROM_OPTIONS.includes(value as ContinueWatchingFrom)
    ? (value as ContinueWatchingFrom)
    : 'first-unwatched';

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
  autoRemoveFromShouldWatch: boolean; // Remove movies from Should Watch when rated or marked as watched
  blurPlotSpoilers: boolean; // Android only - blur movie/TV plot summaries
  showListIndicators: boolean; // Show bookmark badge on cards when item is in a list
  copyInsteadOfMove: boolean; // Bulk add behavior on list detail screens (true = copy, false = move)
  homeScreenLists?: HomeScreenListItem[]; // Optional, falls back to defaults
  favoriteMovieGenreIds: number[]; // Personalized onboarding favorite movie genres
  favoriteTVGenreIds: number[]; // Personalized onboarding favorite TV genres
  quickMarkAsWatched: boolean; // Skip modal and use current time when marking movies as watched
  defaultLaunchScreen?: LaunchScreenRoute; // Which tab to open on app launch
  hideWatchedContent: boolean; // Premium: hide watched content from search/discover
  hideUnreleasedContent: boolean; // Hide unreleased movies/TV shows from search/discover
  hideTalkShowsAndAwards: boolean; // Hide talk shows, late-night, news talk and award ceremonies from browse surfaces
  markPreviousEpisodesWatched: boolean; // Auto-mark previous episodes when marking an episode as watched
  continueWatchingFrom?: ContinueWatchingFrom; // Watch Progress's next episode when episodes were skipped; unset = first-unwatched
  allowUnreleasedEpisodeWatches: boolean; // Allow marking future-dated episodes as watched
  hideTabLabels: boolean; // Hide labels on bottom tab bar, show only icons
  dataSaver: boolean; // Load lower resolution images to save data
  showOriginalTitles: boolean; // Show movie/TV titles in original language when available
  posterOverrides?: Record<string, string>; // Per-user poster overrides keyed by "movie_<id>" / "tv_<id>"
  detailActionOrder?: DetailActionButtonId[]; // Order of the action buttons on movie/TV pages; unset = default
  seasonActionOrder?: SeasonActionButtonId[]; // Order of the action buttons on each season of a show; unset = default
  use24HourTime?: boolean; // Show clock times as 24-hour (21:05); unset = follow the phone's setting
  profileBackground?: ProfileBackground | null; // Poster/backdrop behind the profile; null or unset = none
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  autoAddToWatching: true,
  autoAddToAlreadyWatched: true,
  autoRemoveFromShouldWatch: true,
  blurPlotSpoilers: false,
  showListIndicators: true, // On by default for new users
  copyInsteadOfMove: false, // Off by default - bulk add moves items from source list
  favoriteMovieGenreIds: [],
  favoriteTVGenreIds: [],
  quickMarkAsWatched: false, // Off by default - show date selection modal
  defaultLaunchScreen: '/(tabs)/home',
  hideWatchedContent: false, // Off by default - show all content
  hideUnreleasedContent: false, // Off by default - show unreleased content
  hideTalkShowsAndAwards: true, // On by default - most users don't want talk/awards in browse surfaces
  markPreviousEpisodesWatched: false, // Off by default - only mark selected episode
  continueWatchingFrom: 'first-unwatched', // Skipped episodes come up next by default
  allowUnreleasedEpisodeWatches: false, // Off by default - future episodes remain locked
  hideTabLabels: false, // Off by default - show labels
  dataSaver: false, // Off by default - load full quality images
  showOriginalTitles: false, // Off by default - show localized titles
  posterOverrides: {},
};
