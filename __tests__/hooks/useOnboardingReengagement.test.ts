import { renderHook, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useOnboardingReengagement } from '@/src/hooks/useOnboardingReengagement';
import {
  trackOnboardingReengagementCancelled,
  trackOnboardingReengagementScheduled,
} from '@/src/services/analytics';
import { persistOnboardingProgress } from '@/src/utils/onboardingStepCache';
import type { OnboardingSelections } from '@/src/types/onboarding';

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notification-id-123'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidNotificationPriority: { HIGH: 'high' },
}));

jest.mock('@/src/services/analytics', () => ({
  trackOnboardingReengagementScheduled: jest.fn().mockResolvedValue(undefined),
  trackOnboardingReengagementCancelled: jest.fn().mockResolvedValue(undefined),
  trackOnboardingReengagementTapped: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/src/utils/onboardingStepCache', () => ({
  persistOnboardingProgress: jest.fn().mockResolvedValue(undefined),
  persistOnboardingStepIndex: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/src/firebase/config', () => ({
  auth: {
    currentUser: { uid: 'test-user-123' },
  },
}));

const mockSelections: OnboardingSelections = {
  region: 'US',
  displayName: 'Alex',
  homeScreenLists: [],
  language: 'en-US',
  selectedGenreIds: [28],
  selectedTVGenreIds: [],
  selectedTVShows: [],
  selectedMovies: [],
  selectedActors: [],
  accentColor: null,
};

describe('useOnboardingReengagement', () => {
  let appStateListener: ((state: AppStateStatus) => void) | null = null;
  const mockRemove = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    appStateListener = null;

    jest.spyOn(AppState, 'addEventListener').mockImplementation((event: any, handler: any) => {
      if (event === 'change') {
        appStateListener = handler;
      }
      return { remove: mockRemove } as any;
    });
  });

  it('subscribes to AppState changes on mount and unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useOnboardingReengagement(3));

    expect(AppState.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

    unmount();
    expect(mockRemove).toHaveBeenCalled();
  });

  it('schedules notification and persists progress on active -> background transition', async () => {
    (AppState as any).currentState = 'active';
    renderHook(() => useOnboardingReengagement(2, mockSelections, true));

    expect(appStateListener).toBeDefined();

    // Trigger transition to background
    appStateListener!('background');

    await waitFor(() => {
      expect(persistOnboardingProgress).toHaveBeenCalledWith('test-user-123', {
        stepIndex: 2,
        selections: mockSelections,
        selectedViaOther: true,
      });
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            data: expect.objectContaining({
              type: 'onboarding_reengagement',
              stepIndex: 2,
            }),
          }),
        })
      );
      expect(trackOnboardingReengagementScheduled).toHaveBeenCalledWith({
        stepIndex: 2,
        stepId: 'streaming-providers',
      });
    });
  });

  it('cancels pending notification on background -> active transition', async () => {
    (AppState as any).currentState = 'active';
    renderHook(() => useOnboardingReengagement(4, mockSelections));

    // First go to background to schedule
    appStateListener!('background');
    await waitFor(() => {
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    });

    // Then return to active
    appStateListener!('active');

    await waitFor(() => {
      expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notification-id-123');
      expect(trackOnboardingReengagementCancelled).toHaveBeenCalledWith({
        stepIndex: 4,
        stepId: 'languages',
      });
    });
  });

  it('cancels pending notification on unmount', async () => {
    (AppState as any).currentState = 'active';
    const { unmount } = renderHook(() => useOnboardingReengagement(1, mockSelections));

    appStateListener!('background');
    await waitFor(() => {
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    });

    unmount();

    await waitFor(() => {
      expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notification-id-123');
    });
  });

  it('reads live hasRehydratedRef at the moment of background transition without re-render', async () => {
    (AppState as any).currentState = 'active';
    const rehydratedRef = { current: false };

    renderHook(() => useOnboardingReengagement(2, mockSelections, true, rehydratedRef));

    expect(appStateListener).toBeDefined();

    // Mutate ref directly without triggering any re-render
    rehydratedRef.current = true;

    // Trigger transition to background
    appStateListener!('background');

    await waitFor(() => {
      expect(persistOnboardingProgress).toHaveBeenCalledWith('test-user-123', {
        stepIndex: 2,
        selections: mockSelections,
        selectedViaOther: true,
      });
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
    });
  });

  it('skips progress persistence if hasRehydratedRef is false during background transition', async () => {
    (AppState as any).currentState = 'active';
    const rehydratedRef = { current: false };

    renderHook(() => useOnboardingReengagement(2, mockSelections, true, rehydratedRef));

    appStateListener!('background');

    await waitFor(() => {
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
      expect(persistOnboardingProgress).not.toHaveBeenCalled();
    });
  });
});
