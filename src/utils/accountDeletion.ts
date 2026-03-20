import { TRAKT_STORAGE_KEYS } from '@/src/config/trakt';
import { clearUserDocumentCache } from '@/src/services/UserDocumentCache';
import { writeToSharedPreferences } from '@/src/services/sharedPreferencesService';
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
  ]);

  if (userId) {
    asyncStorageKeysToRemove.add(`isPremium_${userId}`);
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
