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

export const initializeAnalytics = async (): Promise<void> => {};

export const trackScreen = async (_segments: readonly string[]): Promise<void> => {};

export const trackLogin = async (
  _method: import('./analytics.shared').AnalyticsLoginMethod
): Promise<void> => {};

export const trackAddToList = async (
  _params: import('./analytics.shared').TrackAddToListParams
): Promise<void> => {};

export const trackSaveRating = async (
  _params: import('./analytics.shared').TrackSaveRatingParams
): Promise<void> => {};

export const trackCreateReminder = async (
  _params: import('./analytics.shared').TrackCreateReminderParams
): Promise<void> => {};

export const trackCreateList = async (
  _params: import('./analytics.shared').TrackCreateListParams
): Promise<void> => {};

export const trackPremiumPaywallView = async (): Promise<void> => {};

export const trackSignOut = async (): Promise<void> => {};

export const trackPurchaseSuccess = async (
  _params: {
    plan: 'monthly' | 'yearly';
    productId: string;
    price: number;
    currency: string;
  }
): Promise<void> => {};

export const trackPurchaseFailure = async (
  _params: {
    plan: 'monthly' | 'yearly';
    productId?: string | null;
    reason: string;
    code?: string | null;
  }
): Promise<void> => {};

export const trackRestoreSuccess = async (
  _params: {
    productId?: string | null;
    restoredPremium: boolean;
  }
): Promise<void> => {};

export const trackRestoreFailure = async (
  _params: {
    reason: string;
    code?: string | null;
  }
): Promise<void> => {};

export const trackOnboardingComplete = async (
  _params: {
    language: string;
    region: string;
    favoriteMovieGenreCount: number;
    favoriteTVGenreCount: number;
    favoriteShowCount: number;
  }
): Promise<void> => {};

export const trackTraktConnect = async (): Promise<void> => {};

export const trackTraktSyncComplete = async (
  _params: {
    itemsSynced: number;
  }
): Promise<void> => {};

export const trackTraktSyncFailure = async (
  _params: {
    category: string;
  }
): Promise<void> => {};

export const trackImdbImportComplete = async (
  _params: {
    processedActions: number;
    processedEntities: number;
  }
): Promise<void> => {};

export const trackImdbImportFailure = async (
  _params: {
    errorCode: string;
  }
): Promise<void> => {};
