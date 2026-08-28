import { trackOnboardingReengagementScheduled } from '@/src/services/analytics';
import { ONBOARDING_STEPS } from '@/src/types/onboarding';
import type { OnboardingSelections } from '@/src/types/onboarding';
import {
  cancelPendingReengagementNotification,
  ONBOARDING_REENGAGEMENT_NOTIFICATION_ID,
  persistOnboardingProgress,
} from '@/src/utils/onboardingStepCache';
import { auth } from '@/src/firebase/config';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';

/** Production delay: 15 minutes */
const REENGAGEMENT_DELAY_MS = 15 * 60 * 1000;

/**
 * Get the notification scheduling delay.
 * In DEV mode, uses 15 seconds for quick testing (mirrors ReminderService pattern).
 */
const getScheduleDelay = (): number => {
  if (__DEV__) {
    return 15 * 1000; // 15 seconds in dev
  }
  return REENGAGEMENT_DELAY_MS;
};

/**
 * Resolve the step ID string from a step index, with safe fallback.
 */
const resolveStepId = (stepIndex: number): string => {
  return ONBOARDING_STEPS[stepIndex]?.id ?? 'unknown';
};

/**
 * Hook that schedules a local re-engagement notification when the user
 * backgrounds the app during personalized onboarding.
 *
 * - Schedules with a constant identifier (`ONBOARDING_REENGAGEMENT_NOTIFICATION_ID`) to ensure deterministic cancellation and prevent duplicates
 * - On background: cancels any existing notification and schedules the re-engagement notification
 * - Universal cancellation on foreground/cold start is handled globally at the app root in `_layout.tsx`
 *
 * Follows the same pattern as `useOnboardingExitGuard`.
 */
export function useOnboardingReengagement(
  currentStepIndex: number,
  selections?: OnboardingSelections,
  selectedViaOther?: boolean,
  hasRehydratedRef?: React.RefObject<boolean> | React.MutableRefObject<boolean>
) {
  const appStateRef = useRef<AppStateStatus>(AppState?.currentState ?? 'active');
  const stepIndexRef = useRef(currentStepIndex);
  stepIndexRef.current = currentStepIndex;

  const selectionsRef = useRef(selections);
  selectionsRef.current = selections;

  const selectedViaOtherRef = useRef(selectedViaOther);
  selectedViaOtherRef.current = selectedViaOther;

  const rehydratedRef = useRef(hasRehydratedRef);
  rehydratedRef.current = hasRehydratedRef;

  useEffect(() => {
    if (!AppState?.addEventListener) {
      return;
    }

    const scheduleNotification = async (): Promise<void> => {
      const stepIndex = stepIndexRef.current;
      const stepId = resolveStepId(stepIndex);
      const currentSelections = selectionsRef.current;
      const currentSelectedViaOther = selectedViaOtherRef.current;
      const isRehydrated = rehydratedRef.current ? rehydratedRef.current.current : true;

      // Cancel any existing scheduled notification under this constant ID first
      await cancelPendingReengagementNotification();

      // Persist combined progress (step index + selections) for deep-link resume if rehydrated
      const userId = auth.currentUser?.uid;
      if (userId && currentSelections && isRehydrated) {
        try {
          await persistOnboardingProgress(userId, {
            stepIndex,
            selections: currentSelections,
            selectedViaOther: currentSelectedViaOther,
          });
        } catch (error) {
          console.warn('[Reengagement] Failed to persist onboarding progress:', error);
        }
      }

      try {
        const notificationId = await Notifications.scheduleNotificationAsync({
          identifier: ONBOARDING_REENGAGEMENT_NOTIFICATION_ID,
          content: {
            title: 'Your watchlist is waiting 🎬',
            body: 'Finish setup in under a minute and get personalized picks just for you.',
            data: {
              type: 'onboarding_reengagement',
              stepIndex,
            },
            sound: true,
            priority: Notifications.AndroidNotificationPriority.HIGH,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(Date.now() + getScheduleDelay()),
            ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
          },
        });

        console.log(
          `[Reengagement] Scheduled notification ${notificationId} for step ${stepIndex} (${stepId})`
        );

        void trackOnboardingReengagementScheduled({ stepIndex, stepId });
      } catch (error) {
        console.error('[Reengagement] Failed to schedule notification:', error);
      }
    };

    const handleAppStateChange = (nextState: AppStateStatus) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      const isBackgroundTransition =
        previousState === 'active' && (nextState === 'inactive' || nextState === 'background');

      if (isBackgroundTransition) {
        void scheduleNotification();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, []);

  return null;
}
