import analytics from '@react-native-firebase/analytics';

import {
  getAnalyticsScreenName,
  type AnalyticsLoginMethod,
  type TrackAddToListParams,
  type TrackCreateReminderParams,
  type TrackSaveRatingParams,
} from './analytics.shared';

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

let analyticsInitialized = false;

const runAnalyticsCall = async (context: string, callback: () => Promise<void>): Promise<void> => {
  try {
    await callback();
  } catch (error) {
    console.warn(`[Analytics] ${context} failed`, error);
  }
};

export const initializeAnalytics = async (): Promise<void> => {
  if (analyticsInitialized) {
    return;
  }

  await runAnalyticsCall('initialize', async () => {
    await analytics().setAnalyticsCollectionEnabled(true);
    analyticsInitialized = true;
  });
};

export const trackScreen = async (segments: readonly string[]): Promise<void> => {
  const screenName = getAnalyticsScreenName(segments);

  if (!screenName) {
    return;
  }

  await initializeAnalytics();
  await runAnalyticsCall('screen_view', async () => {
    await analytics().logScreenView({
      screen_name: screenName,
      screen_class: screenName,
    });
  });
};

export const trackLogin = async (method: AnalyticsLoginMethod): Promise<void> => {
  await initializeAnalytics();
  await runAnalyticsCall('login', async () => {
    await analytics().logEvent('login', { method });
  });
};

export const trackAddToList = async ({
  listKind,
  mediaType,
}: TrackAddToListParams): Promise<void> => {
  await initializeAnalytics();
  await runAnalyticsCall('add_to_list', async () => {
    await analytics().logEvent('add_to_list', {
      list_kind: listKind,
      media_type: mediaType,
    });
  });
};

export const trackSaveRating = async ({
  mediaType,
  rating,
}: TrackSaveRatingParams): Promise<void> => {
  await initializeAnalytics();
  await runAnalyticsCall('save_rating', async () => {
    await analytics().logEvent('save_rating', {
      media_type: mediaType,
      rating_value: rating,
    });
  });
};

export const trackCreateReminder = async ({
  mediaType,
  reminderTiming,
  tvFrequency,
}: TrackCreateReminderParams): Promise<void> => {
  await initializeAnalytics();
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

export const trackPremiumPaywallView = async (): Promise<void> => {
  await initializeAnalytics();
  await runAnalyticsCall('view_paywall', async () => {
    await analytics().logEvent('view_paywall');
  });
};
