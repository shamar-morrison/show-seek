import { TRAKT_STORAGE_KEYS } from '@/src/config/trakt';
import { clearLocalAccountData } from '@/src/utils/accountDeletion';
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
        'isPremium_user-1',
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
