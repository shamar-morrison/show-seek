import { TRAKT_STORAGE_KEYS } from '@/src/config/trakt';
import { clearLocalAccountData } from '@/src/utils/accountDeletion';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

describe('clearLocalAccountData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue([
      'widget_data_watchlist_user-1_watchlist',
      'widget_data_upcoming_movies',
      'showseek_language',
    ]);
    (AsyncStorage.multiRemove as jest.Mock).mockResolvedValue(undefined);
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
        'isPremium_user-1',
        'widget_data_watchlist_user-1_watchlist',
        'widget_data_upcoming_movies',
      ])
    );

    expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.dismissAllNotificationsAsync).toHaveBeenCalledTimes(1);
  });
});
