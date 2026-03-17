/**
 * Onboarding Types
 *
 * Type definitions for the personalized onboarding flow.
 * Used to collect and persist user preferences during first-run setup.
 */

import type { Movie, Person, TVShow } from '@/src/api/tmdb';
import type { HomeScreenListItem } from '@/src/types/preferences';

/**
 * Aggregated selections collected across all onboarding steps
 */
export interface OnboardingSelections {
  /** Selected region code (e.g., 'US', 'GB') */
  region: string | null;
  /** User's chosen display name */
  displayName: string;
  /** Selected home screen list items */
  homeScreenLists: HomeScreenListItem[];
  /** TV shows the user is currently watching */
  selectedTVShows: TVShow[];
  /** Movies the user loves */
  selectedMovies: Movie[];
  /** Actors the user loves */
  selectedActors: Person[];
  /** Selected accent color hex */
  accentColor: string | null;
}

/**
 * Default empty onboarding selections
 */
export const EMPTY_ONBOARDING_SELECTIONS: OnboardingSelections = {
  region: null,
  displayName: '',
  homeScreenLists: [],
  selectedTVShows: [],
  selectedMovies: [],
  selectedActors: [],
  accentColor: null,
};

/**
 * Step identifiers for the onboarding flow
 */
export type OnboardingStepId =
  | 'region'
  | 'display-name'
  | 'streaming-providers'
  | 'favorite-lists'
  | 'tv-shows'
  | 'movies'
  | 'actors'
  | 'accent-color';

/**
 * Step configuration
 */
export interface OnboardingStep {
  id: OnboardingStepId;
  titleKey: string;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  { id: 'region', titleKey: 'personalOnboarding.regionTitle' },
  { id: 'display-name', titleKey: 'personalOnboarding.displayNameTitle' },
  { id: 'streaming-providers', titleKey: 'personalOnboarding.streamingProvidersTitle' },
  { id: 'favorite-lists', titleKey: 'personalOnboarding.listsTitle' },
  { id: 'tv-shows', titleKey: 'personalOnboarding.tvShowsTitle' },
  { id: 'movies', titleKey: 'personalOnboarding.moviesTitle' },
  { id: 'actors', titleKey: 'personalOnboarding.actorsTitle' },
  { id: 'accent-color', titleKey: 'personalOnboarding.accentColorTitle' },
];
