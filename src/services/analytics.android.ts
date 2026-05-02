import analytics from '@react-native-firebase/analytics';

import {
  getAnalyticsScreenName,
  type AnalyticsLoginMethod,
  type TrackCreateListParams,
  type TrackAddToListParams,
  type TrackCreateReminderParams,
  type TrackSaveRatingParams,
} from './analytics.shared';

export type {
  TrackCreateListParams,
  AnalyticsListKind,
  AnalyticsLoginMethod,
  AnalyticsMediaType,
  AnalyticsReminderTiming,
  AnalyticsTVFrequency,
  TrackAddToListParams,
  TrackCreateReminderParams,
  TrackSaveRatingParams,
} from './analytics.shared';

export { getAnalyticsScreenName, normalizeListKind } from './analytics.shared';

let analyticsInitialized = false;
let analyticsInitializationPromise: Promise<boolean> | null = null;

const runAnalyticsCall = async (context: string, callback: () => Promise<void>): Promise<void> => {
  try {
    await callback();
  } catch (error) {
    console.warn(`[Analytics] ${context} failed`, error);
  }
};

const ensureAnalyticsReady = async (): Promise<boolean> => {
  if (analyticsInitialized) {
    return true;
  }

  if (!analyticsInitializationPromise) {
    analyticsInitializationPromise = (async () => {
      try {
        await analytics().setAnalyticsCollectionEnabled(true);
        analyticsInitialized = true;
        return true;
      } catch (error) {
        console.warn('[Analytics] initialize failed', error);
        return false;
      } finally {
        analyticsInitializationPromise = null;
      }
    })();
  }

  return analyticsInitializationPromise;
};

export const initializeAnalytics = async (): Promise<void> => {
  await ensureAnalyticsReady();
};

export const trackScreen = async (segments: readonly string[]): Promise<void> => {
  const screenName = getAnalyticsScreenName(segments);

  if (!screenName) {
    return;
  }

  if (!(await ensureAnalyticsReady())) {
    return;
  }
  await runAnalyticsCall('screen_view', async () => {
    await analytics().logScreenView({
      screen_name: screenName,
      screen_class: screenName,
    });
  });
};

export const trackLogin = async (method: AnalyticsLoginMethod): Promise<void> => {
  if (!(await ensureAnalyticsReady())) {
    return;
  }
  await runAnalyticsCall('login', async () => {
    await analytics().logEvent('login', { method });
  });
};

export const trackAddToList = async ({
  listKind,
  mediaType,
}: TrackAddToListParams): Promise<void> => {
  if (!(await ensureAnalyticsReady())) {
    return;
  }
  await runAnalyticsCall('add_to_list', async () => {
    await analytics().logEvent('add_to_list', {
      list_kind: listKind,
      media_type: mediaType,
    });
  });
};

export const trackSaveRating = async ({
  seasonNumber,
  episodeNumber,
  posterPath,
  releaseDate,
  mediaType,
  rating,
}: TrackSaveRatingParams): Promise<void> => {
  if (!(await ensureAnalyticsReady())) {
    return;
  }
  await runAnalyticsCall('save_rating', async () => {
    const params: Record<string, number | string> = {
      media_type: mediaType,
      rating_value: rating,
    };

    if (typeof seasonNumber === 'number') {
      params.season_number = seasonNumber;
    }

    if (typeof episodeNumber === 'number') {
      params.episode_number = episodeNumber;
    }

    if (posterPath !== undefined) {
      params.has_poster = posterPath ? 1 : 0;
    }

    if (releaseDate !== undefined) {
      params.has_release_date = releaseDate ? 1 : 0;
    }

    await analytics().logEvent('save_rating', params);
  });
};

export const trackCreateReminder = async ({
  mediaType,
  reminderTiming,
  tvFrequency,
}: TrackCreateReminderParams): Promise<void> => {
  if (!(await ensureAnalyticsReady())) {
    return;
  }
  await runAnalyticsCall('create_reminder', async () => {
    const params: Record<string, string> = {
      media_type: mediaType,
      reminder_timing: reminderTiming,
    };

    if (tvFrequency) {
      params.tv_frequency = tvFrequency;
    }

    await analytics().logEvent('create_reminder', params);
  });
};

export const trackCreateList = async ({ hasDescription }: TrackCreateListParams): Promise<void> => {
  if (!(await ensureAnalyticsReady())) {
    return;
  }
  await runAnalyticsCall('create_list', async () => {
    await analytics().logEvent('create_list', {
      has_description: hasDescription ? 1 : 0,
    });
  });
};

export const trackPremiumPaywallView = async (): Promise<void> => {
  if (!(await ensureAnalyticsReady())) {
    return;
  }
  await runAnalyticsCall('view_paywall', async () => {
    await analytics().logEvent('view_paywall');
  });
};

type PurchaseSuccessParams = {
  plan: 'monthly' | 'yearly';
  productId: string;
  price: number;
  currency: string;
};

type PurchaseFailureParams = {
  plan: 'monthly' | 'yearly';
  productId?: string | null;
  reason: string;
  code?: string | null;
};

type RestoreResultParams = {
  productId?: string | null;
  restoredPremium: boolean;
};

type RestoreFailureParams = {
  reason: string;
  code?: string | null;
};

type OnboardingCompleteParams = {
  language: string;
  region: string;
  favoriteMovieGenreCount: number;
  favoriteTVGenreCount: number;
  favoriteShowCount: number;
};

type TraktSyncCompleteParams = {
  itemsSynced: number;
};

type TraktSyncFailureParams = {
  category: string;
};

type ImdbImportCompleteParams = {
  processedActions: number;
  processedEntities: number;
};

type ImdbImportFailureParams = {
  errorCode: string;
};

const trackNamedEvent = async (
  context: string,
  eventName: string,
  params?: Record<string, string | number>
): Promise<void> => {
  if (!(await ensureAnalyticsReady())) {
    return;
  }

  await runAnalyticsCall(context, async () => {
    await analytics().logEvent(eventName, params);
  });
};

export const trackSignOut = async (): Promise<void> => {
  await trackNamedEvent('sign_out', 'sign_out');
};

export const trackPurchaseSuccess = async ({
  currency,
  plan,
  price,
  productId,
}: PurchaseSuccessParams): Promise<void> => {
  await trackNamedEvent('purchase_success', 'purchase_success', {
    currency,
    plan,
    price,
    product_id: productId,
  });
};

export const trackPurchaseFailure = async ({
  code,
  plan,
  productId,
  reason,
}: PurchaseFailureParams): Promise<void> => {
  await trackNamedEvent('purchase_failure', 'purchase_failure', {
    code: code ?? 'unknown',
    plan,
    product_id: productId ?? 'unknown',
    reason,
  });
};

export const trackRestoreSuccess = async ({
  productId,
  restoredPremium,
}: RestoreResultParams): Promise<void> => {
  await trackNamedEvent('restore_success', 'restore_success', {
    product_id: productId ?? 'unknown',
    restored_premium: restoredPremium ? 1 : 0,
  });
};

export const trackRestoreFailure = async ({
  code,
  reason,
}: RestoreFailureParams): Promise<void> => {
  await trackNamedEvent('restore_failure', 'restore_failure', {
    code: code ?? 'unknown',
    reason,
  });
};

export const trackOnboardingComplete = async ({
  favoriteMovieGenreCount,
  favoriteShowCount,
  favoriteTVGenreCount,
  language,
  region,
}: OnboardingCompleteParams): Promise<void> => {
  await trackNamedEvent('onboarding_complete', 'onboarding_complete', {
    favorite_movie_genre_count: favoriteMovieGenreCount,
    favorite_show_count: favoriteShowCount,
    favorite_tv_genre_count: favoriteTVGenreCount,
    language,
    region,
  });
};

export const trackTraktConnect = async (): Promise<void> => {
  await trackNamedEvent('trakt_connect', 'trakt_connect');
};

export const trackTraktSyncComplete = async ({
  itemsSynced,
}: TraktSyncCompleteParams): Promise<void> => {
  await trackNamedEvent('trakt_sync_complete', 'trakt_sync_complete', {
    items_synced: itemsSynced,
  });
};

export const trackTraktSyncFailure = async ({
  category,
}: TraktSyncFailureParams): Promise<void> => {
  await trackNamedEvent('trakt_sync_failure', 'trakt_sync_failure', {
    category,
  });
};

export const trackImdbImportComplete = async ({
  processedActions,
  processedEntities,
}: ImdbImportCompleteParams): Promise<void> => {
  await trackNamedEvent('imdb_import_complete', 'imdb_import_complete', {
    processed_actions: processedActions,
    processed_entities: processedEntities,
  });
};

export const trackImdbImportFailure = async ({
  errorCode,
}: ImdbImportFailureParams): Promise<void> => {
  await trackNamedEvent('imdb_import_failure', 'imdb_import_failure', {
    error_code: errorCode,
  });
};
