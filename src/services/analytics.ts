import type {
  AnalyticsLoginMethod,
  ImdbImportCompleteParams,
  ImdbImportFailureParams,
  OnboardingCompleteParams,
  PurchaseFailureParams,
  PurchaseSuccessParams,
  RestoreFailureParams,
  RestoreSuccessParams,
  TrackAddToListParams,
  TrackCreateListParams,
  TrackCreateReminderParams,
  TrackSaveRatingParams,
  TraktSyncCompleteParams,
  TraktSyncFailureParams,
} from './analytics.shared';

export type {
  AnalyticsListKind,
  AnalyticsLoginMethod,
  AnalyticsMediaType,
  AnalyticsReminderTiming,
  AnalyticsTVFrequency,
  ImdbImportCompleteParams,
  ImdbImportFailureParams,
  OnboardingCompleteParams,
  PurchaseFailureParams,
  PurchaseSuccessParams,
  RestoreFailureParams,
  RestoreSuccessParams,
  TrackAddToListParams,
  TrackCreateListParams,
  TrackCreateReminderParams,
  TrackSaveRatingParams,
  TraktSyncCompleteParams,
  TraktSyncFailureParams,
} from './analytics.shared';

export { getAnalyticsScreenName, normalizeListKind } from './analytics.shared';

export const initializeAnalytics = async (): Promise<void> => {};

export const trackScreen = async (_segments: readonly string[]): Promise<void> => {};

export const trackLogin = async (_method: AnalyticsLoginMethod): Promise<void> => {};

export const trackAddToList = async (_params: TrackAddToListParams): Promise<void> => {};

export const trackSaveRating = async (_params: TrackSaveRatingParams): Promise<void> => {};

export const trackCreateReminder = async (_params: TrackCreateReminderParams): Promise<void> => {};

export const trackCreateList = async (_params: TrackCreateListParams): Promise<void> => {};

export const trackPremiumPaywallView = async (): Promise<void> => {};

export const logModalEvent = async (
  _name: string,
  _event: 'present' | 'dismiss'
): Promise<void> => {};

export const trackSignOut = async (): Promise<void> => {};

export const trackPurchaseSuccess = async (_params: PurchaseSuccessParams): Promise<void> => {};

export const trackPurchaseFailure = async (_params: PurchaseFailureParams): Promise<void> => {};

export const trackRestoreSuccess = async (_params: RestoreSuccessParams): Promise<void> => {};

export const trackRestoreFailure = async (_params: RestoreFailureParams): Promise<void> => {};

export const trackOnboardingComplete = async (
  _params: OnboardingCompleteParams
): Promise<void> => {};

export const trackTraktConnect = async (): Promise<void> => {};

export const trackTraktSyncComplete = async (_params: TraktSyncCompleteParams): Promise<void> => {};

export const trackTraktSyncFailure = async (_params: TraktSyncFailureParams): Promise<void> => {};

export const trackImdbImportComplete = async (
  _params: ImdbImportCompleteParams
): Promise<void> => {};

export const trackImdbImportFailure = async (_params: ImdbImportFailureParams): Promise<void> => {};
