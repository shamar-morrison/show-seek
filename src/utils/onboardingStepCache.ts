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
const REENGAGEMENT_NOTIFICATION_ID_KEY = 'onboardingReengagementNotificationId';

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
 * Persist scheduled re-engagement notification ID to AsyncStorage so it survives app kills.
 */
export const persistPendingReengagementNotificationId = async (
  notificationId: string
): Promise<void> => {
  try {
    await AsyncStorage.setItem(REENGAGEMENT_NOTIFICATION_ID_KEY, notificationId);
  } catch (error) {
    console.warn('[onboardingCache] Failed to persist pending notification ID:', error);
  }
};

/**
 * Read scheduled re-engagement notification ID from AsyncStorage.
 */
export const readPendingReengagementNotificationId = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(REENGAGEMENT_NOTIFICATION_ID_KEY);
  } catch (error) {
    console.warn('[onboardingCache] Failed to read pending notification ID:', error);
    return null;
  }
};

/**
 * Clear scheduled re-engagement notification ID from AsyncStorage.
 */
export const clearPendingReengagementNotificationId = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(REENGAGEMENT_NOTIFICATION_ID_KEY);
  } catch (error) {
    console.warn('[onboardingCache] Failed to clear pending notification ID:', error);
  }
};

/**
 * Universal cancellation helper:
 * Reads any durable pending notification ID from AsyncStorage,
 * cancels it via expo-notifications, and cleans up storage.
 * Safe to call repeatedly and across app cold starts/foreground transitions.
 */
export const cancelPendingReengagementNotification = async (params?: {
  stepIndex?: number;
  stepId?: string;
}): Promise<void> => {
  try {
    const notificationId = await readPendingReengagementNotificationId();
    if (notificationId) {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      await clearPendingReengagementNotificationId();
      console.log(`[Reengagement] Cancelled pending notification: ${notificationId}`);

      if (params?.stepIndex !== undefined && params?.stepId) {
        void trackOnboardingReengagementCancelled({
          stepIndex: params.stepIndex,
          stepId: params.stepId,
        });
      }
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
