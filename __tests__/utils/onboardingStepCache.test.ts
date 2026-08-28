import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import {
  cancelPendingReengagementNotification,
  clearOnboardingProgress,
  clearOnboardingStepIndex,
  clearPendingReengagementNotificationId,
  persistOnboardingProgress,
  persistOnboardingStepIndex,
  persistPendingReengagementNotificationId,
  readOnboardingProgress,
  readOnboardingStepIndex,
  readPendingReengagementNotificationId,
} from '@/src/utils/onboardingStepCache';
import type { OnboardingSelections } from '@/src/types/onboarding';

jest.mock('expo-notifications', () => ({
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/src/services/analytics', () => ({
  trackOnboardingReengagementCancelled: jest.fn().mockResolvedValue(undefined),
}));

const mockSelections: OnboardingSelections = {
  region: 'US',
  displayName: 'Alex',
  homeScreenLists: [{ id: 'watchlist', type: 'tmdb', label: 'Watchlist' }],
  language: 'en-US',
  selectedGenreIds: [28, 12],
  selectedTVGenreIds: [10765],
  selectedTVShows: [],
  selectedMovies: [],
  selectedActors: [],
  accentColor: '#E50914',
};

describe('onboardingStepCache (combined progress & notification persistence)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('persists and reads combined progress correctly', async () => {
    await persistOnboardingProgress('user-123', {
      stepIndex: 5,
      selections: mockSelections,
      selectedViaOther: true,
    });

    const result = await readOnboardingProgress('user-123');
    expect(result).toEqual({
      stepIndex: 5,
      selections: mockSelections,
      selectedViaOther: true,
    });
  });

  it('returns null if no progress has been saved', async () => {
    const result = await readOnboardingProgress('user-unknown');
    expect(result).toBeNull();
  });

  it('clears combined progress correctly', async () => {
    await persistOnboardingProgress('user-123', {
      stepIndex: 7,
      selections: mockSelections,
    });
    await clearOnboardingProgress('user-123');

    const result = await readOnboardingProgress('user-123');
    expect(result).toBeNull();
  });

  it('handles corrupted stored JSON gracefully', async () => {
    await AsyncStorage.setItem('onboardingProgress:user-bad', 'invalid-json{{{');
    const result = await readOnboardingProgress('user-bad');
    expect(result).toBeNull();
  });

  it('supports legacy step index helpers with backwards compatibility', async () => {
    await persistOnboardingStepIndex('user-456', 3);
    const step = await readOnboardingStepIndex('user-456');
    expect(step).toBe(3);

    await clearOnboardingStepIndex('user-456');
    const cleared = await readOnboardingStepIndex('user-456');
    expect(cleared).toBeNull();
  });

  it('persists, reads, and clears pending notification IDs durably', async () => {
    await persistPendingReengagementNotificationId('notif-123');
    expect(await readPendingReengagementNotificationId()).toBe('notif-123');

    await clearPendingReengagementNotificationId();
    expect(await readPendingReengagementNotificationId()).toBeNull();
  });

  it('cancelPendingReengagementNotification cancels scheduled notification and purges storage', async () => {
    await persistPendingReengagementNotificationId('notif-456');

    await cancelPendingReengagementNotification({ stepIndex: 2, stepId: 'streaming-providers' });

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-456');
    expect(await readPendingReengagementNotificationId()).toBeNull();
  });

  it('cancelPendingReengagementNotification is safe no-op when no notification is pending', async () => {
    await cancelPendingReengagementNotification();
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });
});
