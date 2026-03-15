export type {
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

export const trackPremiumPaywallView = async (): Promise<void> => {};
