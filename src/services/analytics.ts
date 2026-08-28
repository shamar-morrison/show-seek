import type {
  AnalyticsLoginMethod,
  ImdbImportCompleteParams,
  ImdbImportFailureParams,
  OnboardingCompleteParams,
  OnboardingExitIntentDecisionParams,
  OnboardingExitIntentParams,
  OnboardingReengagementParams,
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
  OnboardingExitIntentDecisionParams,
  OnboardingExitIntentParams,
  OnboardingExitIntentScreen,
  OnboardingExitIntentVariant,
  OnboardingReengagementParams,
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

export const trackOnboardingExitIntentShown = async (
  _params: OnboardingExitIntentParams
): Promise<void> => {};

export const trackOnboardingExitIntentDecision = async (
  _params: OnboardingExitIntentDecisionParams
): Promise<void> => {};

export const trackOnboardingReengagementScheduled = async (
  _params: OnboardingReengagementParams
): Promise<void> => {};

export const trackOnboardingReengagementCancelled = async (
  _params: OnboardingReengagementParams
): Promise<void> => {};

export const trackOnboardingReengagementTapped = async (
  _params: OnboardingReengagementParams
): Promise<void> => {};
