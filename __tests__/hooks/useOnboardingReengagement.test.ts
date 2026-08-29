import { renderHook, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useOnboardingReengagement } from '@/src/hooks/useOnboardingReengagement';
import {
  trackOnboardingReengagementScheduled,
} from '@/src/services/analytics';
import {
  cancelPendingReengagementNotification,
  ONBOARDING_REENGAGEMENT_NOTIFICATION_ID,
  persistOnboardingProgress,
} from '@/src/utils/onboardingStepCache';
import type { OnboardingSelections } from '@/src/types/onboarding';

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('onboarding-reengagement'),
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
  ONBOARDING_REENGAGEMENT_NOTIFICATION_ID: 'onboarding-reengagement',
  persistOnboardingProgress: jest.fn().mockResolvedValue(undefined),
  persistOnboardingStepIndex: jest.fn().mockResolvedValue(undefined),
  cancelPendingReengagementNotification: jest.fn().mockResolvedValue(undefined),
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

  it('schedules notification with constant identifier and persists progress on active -> background transition', async () => {
    (AppState as any).currentState = 'active';
    renderHook(() => useOnboardingReengagement(2, mockSelections, true));

    expect(appStateListener).toBeDefined();

    // Trigger transition to background
    appStateListener!('background');

    await waitFor(() => {
      expect(cancelPendingReengagementNotification).toHaveBeenCalled();
      expect(persistOnboardingProgress).toHaveBeenCalledWith('test-user-123', {
        stepIndex: 2,
        selections: mockSelections,
        selectedViaOther: true,
      });
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: ONBOARDING_REENGAGEMENT_NOTIFICATION_ID,
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
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: ONBOARDING_REENGAGEMENT_NOTIFICATION_ID,
        })
      );
    });
  });

  it('skips progress persistence if hasRehydratedRef is false during background transition', async () => {
    (AppState as any).currentState = 'active';
    const rehydratedRef = { current: false };

    renderHook(() => useOnboardingReengagement(2, mockSelections, true, rehydratedRef));

    appStateListener!('background');

    await waitFor(() => {
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: ONBOARDING_REENGAGEMENT_NOTIFICATION_ID,
        })
      );
      expect(persistOnboardingProgress).not.toHaveBeenCalled();
    });
  });

  it('aborts scheduling when app returns to active while cancellation is in-flight', async () => {
    (AppState as any).currentState = 'active';

    let resolveCancel: () => void;
    (cancelPendingReengagementNotification as jest.Mock).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveCancel = resolve;
        })
    );

    renderHook(() => useOnboardingReengagement(2, mockSelections, true));

    expect(appStateListener).toBeDefined();

    // 1. App transitions to background (starts scheduling pipeline)
    appStateListener!('background');

    // 2. User back gesture is intercepted, returning app to active before cancel resolves
    (AppState as any).currentState = 'active';
    appStateListener!('active');

    // 3. Initial cancel finishes asynchronously
    resolveCancel!();

    await waitFor(() => {
      expect(cancelPendingReengagementNotification).toHaveBeenCalled();
    });

    // Notifications.scheduleNotificationAsync must NEVER be called for the aborted generation
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(trackOnboardingReengagementScheduled).not.toHaveBeenCalled();
  });

  it('aborts scheduling when app returns to active while progress persistence is in-flight', async () => {
    (AppState as any).currentState = 'active';

    let resolvePersist: () => void;
    (persistOnboardingProgress as jest.Mock).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolvePersist = resolve;
        })
    );

    renderHook(() => useOnboardingReengagement(2, mockSelections, true));

    expect(appStateListener).toBeDefined();

    // 1. App transitions to background (starts scheduling pipeline)
    appStateListener!('background');

    // Wait a tick for cancelPendingReengagementNotification to resolve so persistOnboardingProgress starts
    await new Promise((r) => setTimeout(r, 10));

    // 2. App returns to active while persistOnboardingProgress is in-flight
    (AppState as any).currentState = 'active';
    appStateListener!('active');

    // 3. Persist progress finishes asynchronously
    resolvePersist!();

    await waitFor(() => {
      expect(persistOnboardingProgress).toHaveBeenCalled();
    });

    // Notifications.scheduleNotificationAsync must NEVER be called for the aborted generation
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(trackOnboardingReengagementScheduled).not.toHaveBeenCalled();
  });

  it('drops stale scheduling generation on multiple rapid bounces and only schedules latest background', async () => {
    (AppState as any).currentState = 'active';

    let resolvePersistFirst: () => void;
    (persistOnboardingProgress as jest.Mock).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolvePersistFirst = resolve;
        })
    );

    renderHook(() => useOnboardingReengagement(2, mockSelections, true));

    // 1. First bounce: bg -> active
    appStateListener!('background');
    await new Promise((r) => setTimeout(r, 10));

    (AppState as any).currentState = 'active';
    appStateListener!('active');

    // 2. Second transition: active -> background (remains backgrounded)
    (AppState as any).currentState = 'background';
    appStateListener!('background');

    // First persist finally finishes late
    resolvePersistFirst!();

    await waitFor(() => {
      // Exactly 1 notification should be scheduled (from the second background generation)
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
      expect(trackOnboardingReengagementScheduled).toHaveBeenCalledTimes(1);
    });
  });

  it('cancels pending notifications on foreground transition', async () => {
    (AppState as any).currentState = 'background';
    renderHook(() => useOnboardingReengagement(2, mockSelections, true));

    (cancelPendingReengagementNotification as jest.Mock).mockClear();

    // Transition from background to active
    (AppState as any).currentState = 'active';
    appStateListener!('active');

    await waitFor(() => {
      expect(cancelPendingReengagementNotification).toHaveBeenCalled();
    });
  });
});
