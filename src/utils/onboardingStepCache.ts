import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { trackOnboardingReengagementCancelled } from '@/src/services/analytics';
import type { OnboardingSelections } from '@/src/types/onboarding';

export interface OnboardingProgress {
  stepIndex: number;
  selections: OnboardingSelections;
  selectedViaOther?: boolean;
}

const getProgressKey = (userId: string) => `onboardingProgress:${userId}`;
// Legacy key for backwards compatibility / cleanup
const getLegacyStepIndexKey = (userId: string) => `onboardingStepIndex:${userId}`;

/** Constant deterministic notification identifier for onboarding re-engagement */
export const ONBOARDING_REENGAGEMENT_NOTIFICATION_ID = 'onboarding-reengagement';

/**
 * Persist the user's combined onboarding progress (step index + selections) as a single atomic unit.
 * Called on every step transition and when the app is backgrounded.
 */
export const persistOnboardingProgress = async (
  userId: string,
  progress: OnboardingProgress
): Promise<void> => {
  try {
    await AsyncStorage.setItem(getProgressKey(userId), JSON.stringify(progress));
  } catch (error) {
    console.warn('[onboardingCache] Failed to persist onboarding progress:', error);
  }
};

/**
 * Read the persisted onboarding progress.
 * Returns null if no progress has been saved or if the data is invalid.
 */
export const readOnboardingProgress = async (
  userId: string
): Promise<OnboardingProgress | null> => {
  try {
    const raw = await AsyncStorage.getItem(getProgressKey(userId));
    if (!raw) {
      // Fallback check for legacy step index key if present
      const legacyStep = await AsyncStorage.getItem(getLegacyStepIndexKey(userId));
      if (legacyStep !== null) {
        const parsedStep = Number(legacyStep);
        if (Number.isFinite(parsedStep) && parsedStep >= 0) {
          return {
            stepIndex: parsedStep,
            selections: {} as OnboardingSelections,
          };
        }
      }
      return null;
    }

    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.stepIndex === 'number' &&
      parsed.stepIndex >= 0 &&
      parsed.selections &&
      typeof parsed.selections === 'object'
    ) {
      return parsed as OnboardingProgress;
    }

    return null;
  } catch (error) {
    console.warn('[onboardingCache] Failed to read onboarding progress:', error);
    return null;
  }
};

/**
 * Clear the persisted onboarding progress.
 * Called when onboarding completes successfully.
 */
export const clearOnboardingProgress = async (userId: string): Promise<void> => {
  try {
    await Promise.all([
      AsyncStorage.removeItem(getProgressKey(userId)),
      AsyncStorage.removeItem(getLegacyStepIndexKey(userId)),
    ]);
  } catch (error) {
    console.warn('[onboardingCache] Failed to clear onboarding progress:', error);
  }
};

/**
 * Universal cancellation helper:
 * Cancels any scheduled notification under the constant identifier ONBOARDING_REENGAGEMENT_NOTIFICATION_ID.
 * Safe to call unconditionally on cold starts, foreground transitions, and onboarding completion.
 */
export const cancelPendingReengagementNotification = async (params?: {
  stepIndex?: number;
  stepId?: string;
}): Promise<void> => {
  try {
    await Notifications.cancelScheduledNotificationAsync(ONBOARDING_REENGAGEMENT_NOTIFICATION_ID);

    if (params?.stepIndex !== undefined && params?.stepId) {
      void trackOnboardingReengagementCancelled({
        stepIndex: params.stepIndex,
        stepId: params.stepId,
      });
    }
  } catch (error) {
    console.warn('[Reengagement] Failed to cancel pending notification:', error);
  }
};

// Aliases for backwards compatibility
export const persistOnboardingStepIndex = async (
  userId: string,
  stepIndex: number
): Promise<void> => {
  const existing = await readOnboardingProgress(userId);
  await persistOnboardingProgress(userId, {
    stepIndex,
    selections: existing?.selections ?? ({} as OnboardingSelections),
    selectedViaOther: existing?.selectedViaOther,
  });
};

export const readOnboardingStepIndex = async (userId: string): Promise<number | null> => {
  const progress = await readOnboardingProgress(userId);
  return progress?.stepIndex ?? null;
};

export const clearOnboardingStepIndex = clearOnboardingProgress;
