import { TRAKT_STORAGE_KEYS } from '@/src/config/trakt';
import { clearUserDocumentCache } from '@/src/services/UserDocumentCache';
import { writeToSharedPreferences } from '@/src/services/sharedPreferencesService';
import { getPersonalOnboardingCacheKey } from '@/src/utils/personalOnboardingCache';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

const REMINDER_SYNC_COOLDOWN_KEY = 'lastReminderSyncTimestamp';
const WIDGET_CACHE_PREFIX = 'widget_data_';
const WIDGET_SHARED_PREFERENCES_RESETS: Array<{ key: string; value: unknown }> = [
  { key: 'widget_config', value: {} },
  { key: 'watchlist', value: { items: [], listId: '', listName: 'My Watchlist' } },
  { key: 'watchlist_loading', value: false },
  { key: 'upcoming_movies', value: [] },
  { key: 'upcoming_movies_loading', value: false },
  { key: 'upcoming_tv', value: [] },
  { key: 'upcoming_tv_loading', value: false },
];

export async function clearLocalAccountData(userId?: string): Promise<void> {
  clearUserDocumentCache(userId);

  const asyncStorageKeysToRemove = new Set<string>([
    'userId',
    REMINDER_SYNC_COOLDOWN_KEY,
    TRAKT_STORAGE_KEYS.CONNECTED,
    TRAKT_STORAGE_KEYS.LAST_SYNCED,
    TRAKT_STORAGE_KEYS.SYNC_STATUS,
    TRAKT_STORAGE_KEYS.LAST_ENRICHED,
    TRAKT_STORAGE_KEYS.DISMISSED_ZIP_IMPORT_ID,
  ]);

  if (userId) {
    asyncStorageKeysToRemove.add(`isPremium_${userId}`);
    asyncStorageKeysToRemove.add(getPersonalOnboardingCacheKey(userId));
  }

  try {
    const allKeys = await AsyncStorage.getAllKeys();
    allKeys
      .filter((key) => key.startsWith(WIDGET_CACHE_PREFIX))
      .forEach((key) => asyncStorageKeysToRemove.add(key));
  } catch (error) {
    console.warn('[accountDeletion] Failed to enumerate AsyncStorage keys:', error);
  }

  if (asyncStorageKeysToRemove.size > 0) {
    try {
      await AsyncStorage.multiRemove([...asyncStorageKeysToRemove]);
    } catch (error) {
      console.warn('[accountDeletion] Failed to remove AsyncStorage keys:', error);
    }
  }

  await Promise.allSettled([
    ...WIDGET_SHARED_PREFERENCES_RESETS.map(({ key, value }) =>
      writeToSharedPreferences(key, value)
    ),
    Notifications.cancelAllScheduledNotificationsAsync(),
    Notifications.dismissAllNotificationsAsync(),
  ]);
}

// NOTE: keep in sync with functions/src/accountDeletion.ts and
// show-seek-web/lib/polar-delete-guard.ts.
export const POLAR_CANCELLED_STATE = 'CANCELLED';
export const POLAR_SUBSCRIPTION_ACTIVE_REASON = 'POLAR_SUBSCRIPTION_ACTIVE';

export interface PolarPremiumStatus {
  isPremium?: boolean | null;
  provider?: string | null;
  subscriptionState?: string | null;
}

export function isPolarDeleteBlocked(premium?: PolarPremiumStatus | null): boolean {
  if (!premium) {
    return false;
  }
  if (premium.provider !== 'polar') {
    return false;
  }
  if (premium.isPremium !== true) {
    return false;
  }
  return premium.subscriptionState !== POLAR_CANCELLED_STATE;
}

export function isPolarSubscriptionActiveError(error: unknown): boolean {
  const details = (error as { details?: { reason?: unknown } | null } | null)?.details;
  return details?.reason === POLAR_SUBSCRIPTION_ACTIVE_REASON;
}

/**
 * Whether a Google Play purchase must not start for this premium state.
 * Unlike isPolarDeleteBlocked, there is NO exemption for CANCELLED: the
 * RevenueCat webhook ignores RC events for the whole time Polar isPremium is
 * true, so any Play purchase in that window would double-bill with no change
 * in the app. Blocked callers must behave like a user-cancelled purchase
 * (silent no-op). Keep in sync with functions/src/accountDeletion.ts semantics.
 */
export function isPolarPurchaseBlocked(premium?: PolarPremiumStatus | null): boolean {
  if (!premium) {
    return false;
  }
  if (premium.provider !== 'polar') {
    return false;
  }
  return premium.isPremium === true;
}
