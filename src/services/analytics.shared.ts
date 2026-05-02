const GROUP_SEGMENT_PATTERN = /^\(.+\)$/;

const DEFAULT_LIST_KINDS = [
  'watchlist',
  'currently-watching',
  'already-watched',
  'favorites',
  'dropped',
] as const;

export type AnalyticsLoginMethod = 'google' | 'email' | 'guest';
export type AnalyticsListKind = (typeof DEFAULT_LIST_KINDS)[number] | 'custom';
export type AnalyticsMediaType = 'movie' | 'tv' | 'episode';
export type AnalyticsReminderTiming = 'on_release_day' | '1_day_before' | '1_week_before';
export type AnalyticsTVFrequency = 'every_episode' | 'season_premiere';

export interface TrackAddToListParams {
  listKind: AnalyticsListKind;
  mediaType: Extract<AnalyticsMediaType, 'movie' | 'tv'>;
}

export interface TrackSaveRatingParams {
  id: string;
  mediaType: AnalyticsMediaType;
  rating: number;
  posterPath?: string | null;
  releaseDate?: string | null;
  title?: string;
  tvShowId?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeName?: string;
  tvShowName?: string;
}

export interface TrackCreateReminderParams {
  mediaType: Extract<AnalyticsMediaType, 'movie' | 'tv'>;
  reminderTiming: AnalyticsReminderTiming;
  tvFrequency?: AnalyticsTVFrequency;
}

export interface TrackCreateListParams {
  hasDescription: boolean;
}

export interface PurchaseSuccessParams {
  plan: 'monthly' | 'yearly';
  productId: string;
  price: number;
  currency: string;
}

export interface PurchaseFailureParams {
  plan: 'monthly' | 'yearly';
  productId?: string | null;
  reason: string;
  code?: string | null;
}

export interface RestoreSuccessParams {
  productId?: string | null;
  restoredPremium: boolean;
}

export interface RestoreFailureParams {
  reason: string;
  code?: string | null;
}

export interface OnboardingCompleteParams {
  language: string;
  region: string;
  favoriteMovieGenreCount: number;
  favoriteTVGenreCount: number;
  favoriteShowCount: number;
}

export interface TraktSyncCompleteParams {
  itemsSynced: number;
}

export interface TraktSyncFailureParams {
  category: string;
}

export interface ImdbImportCompleteParams {
  processedActions: number;
  processedEntities: number;
}

export interface ImdbImportFailureParams {
  errorCode: string;
}

export const normalizeListKind = (listId: string): AnalyticsListKind => {
  return DEFAULT_LIST_KINDS.includes(listId as (typeof DEFAULT_LIST_KINDS)[number])
    ? (listId as (typeof DEFAULT_LIST_KINDS)[number])
    : 'custom';
};

export const getAnalyticsScreenName = (segments: readonly string[]): string | null => {
  const normalizedSegments = segments
    .map((segment) => segment.trim())
    .filter(Boolean)
    .filter((segment) => !GROUP_SEGMENT_PATTERN.test(segment));

  if (normalizedSegments.length === 1 && normalizedSegments[0] === 'index') {
    return 'index';
  }

  const visibleSegments = normalizedSegments.filter((segment) => segment !== 'index');
  return visibleSegments.length > 0 ? visibleSegments.join('/') : null;
};
