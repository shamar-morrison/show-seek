import { TRAKT_STORAGE_KEYS } from '@/src/config/trakt';
import {
  clearLocalAccountData,
  isPolarDeleteBlocked,
  isPolarPurchaseBlocked,
  isPolarSubscriptionActiveError,
  POLAR_SUBSCRIPTION_ACTIVE_REASON,
} from '@/src/utils/accountDeletion';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

const mockWriteToSharedPreferences = jest.fn();
const mockClearUserDocumentCache = jest.fn();

jest.mock('@/src/services/sharedPreferencesService', () => ({
  writeToSharedPreferences: (...args: any[]) => mockWriteToSharedPreferences(...args),
}));

jest.mock('@/src/services/UserDocumentCache', () => ({
  clearUserDocumentCache: (...args: any[]) => mockClearUserDocumentCache(...args),
}));

describe('clearLocalAccountData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue([
      'widget_data_watchlist_user-1_watchlist',
      'widget_data_upcoming_movies',
      'showseek_language',
    ]);
    (AsyncStorage.multiRemove as jest.Mock).mockResolvedValue(undefined);
    mockWriteToSharedPreferences.mockResolvedValue(undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('removes user-scoped async storage keys and clears notifications', async () => {
    await clearLocalAccountData('user-1');

    expect(AsyncStorage.multiRemove).toHaveBeenCalledTimes(1);

    const removedKeys = new Set((AsyncStorage.multiRemove as jest.Mock).mock.calls[0][0]);
    expect(removedKeys).toEqual(
      new Set([
        'userId',
        'lastReminderSyncTimestamp',
        TRAKT_STORAGE_KEYS.CONNECTED,
        TRAKT_STORAGE_KEYS.LAST_SYNCED,
        TRAKT_STORAGE_KEYS.SYNC_STATUS,
        TRAKT_STORAGE_KEYS.LAST_ENRICHED,
        TRAKT_STORAGE_KEYS.DISMISSED_ZIP_IMPORT_ID,
        'isPremium_user-1',
        'hasCompletedPersonalOnboarding:user-1',
        'widget_data_watchlist_user-1_watchlist',
        'widget_data_upcoming_movies',
      ])
    );

    expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.dismissAllNotificationsAsync).toHaveBeenCalledTimes(1);
  });

  it('swallows async storage removal failures and continues the rest of local cleanup', async () => {
    const storageError = new Error('multiRemove failed');
    (AsyncStorage.multiRemove as jest.Mock).mockRejectedValue(storageError);

    await clearLocalAccountData('user-1');

    expect(console.warn).toHaveBeenCalledWith(
      '[accountDeletion] Failed to remove AsyncStorage keys:',
      storageError
    );
    expect(mockClearUserDocumentCache).toHaveBeenCalledWith('user-1');
    expect(mockWriteToSharedPreferences).toHaveBeenCalledTimes(7);
    expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.dismissAllNotificationsAsync).toHaveBeenCalledTimes(1);
  });
});

describe('isPolarDeleteBlocked', () => {
  it('blocks active and billing-issue Polar subscriptions', () => {
    expect(
      isPolarDeleteBlocked({ isPremium: true, provider: 'polar', subscriptionState: 'ACTIVE' })
    ).toBe(true);
    expect(
      isPolarDeleteBlocked({
        isPremium: true,
        provider: 'polar',
        subscriptionState: 'BILLING_ISSUE',
      })
    ).toBe(true);
    expect(isPolarDeleteBlocked({ isPremium: true, provider: 'polar' })).toBe(true);
  });

  it('allows cancelled, expired, non-polar, and missing premium', () => {
    expect(
      isPolarDeleteBlocked({
        isPremium: true,
        provider: 'polar',
        subscriptionState: 'CANCELLED',
      })
    ).toBe(false);
    expect(
      isPolarDeleteBlocked({ isPremium: false, provider: 'polar', subscriptionState: 'ACTIVE' })
    ).toBe(false);
    expect(
      isPolarDeleteBlocked({
        isPremium: true,
        provider: 'revenuecat',
        subscriptionState: 'ACTIVE',
      })
    ).toBe(false);
    expect(isPolarDeleteBlocked(null)).toBe(false);
    expect(isPolarDeleteBlocked(undefined)).toBe(false);
  });
});

describe('isPolarSubscriptionActiveError', () => {  it('matches only the Polar active-subscription reason', () => {
    expect(
      isPolarSubscriptionActiveError({
        code: 'functions/failed-precondition',
        details: { reason: POLAR_SUBSCRIPTION_ACTIVE_REASON },
      })
    ).toBe(true);
    expect(isPolarSubscriptionActiveError(new Error('boom'))).toBe(false);
    expect(
      isPolarSubscriptionActiveError({
        code: 'functions/failed-precondition',
        details: { reason: 'SOMETHING_ELSE' },
      })
    ).toBe(false);
    expect(isPolarSubscriptionActiveError(null)).toBe(false);
  });
});

describe('isPolarPurchaseBlocked', () => {
  it('blocks Polar premium regardless of subscription state (no CANCELLED exemption)', () => {
    expect(
      isPolarPurchaseBlocked({ isPremium: true, provider: 'polar', subscriptionState: 'ACTIVE' })
    ).toBe(true);
    expect(
      isPolarPurchaseBlocked({
        isPremium: true,
        provider: 'polar',
        subscriptionState: 'CANCELLED',
      })
    ).toBe(true);
    expect(
      isPolarPurchaseBlocked({
        isPremium: true,
        provider: 'polar',
        subscriptionState: 'BILLING_ISSUE',
      })
    ).toBe(true);
    expect(isPolarPurchaseBlocked({ isPremium: true, provider: 'polar' })).toBe(true);
  });

  it('allows non-premium Polar, RevenueCat premium, and missing premium', () => {
    expect(
      isPolarPurchaseBlocked({ isPremium: false, provider: 'polar', subscriptionState: 'ACTIVE' })
    ).toBe(false);
    expect(
      isPolarPurchaseBlocked({
        isPremium: true,
        provider: 'revenuecat',
        subscriptionState: 'ACTIVE',
      })
    ).toBe(false);
    expect(isPolarPurchaseBlocked({ isPremium: false, provider: null })).toBe(false);
    expect(isPolarPurchaseBlocked(null)).toBe(false);
    expect(isPolarPurchaseBlocked(undefined)).toBe(false);
  });
});
