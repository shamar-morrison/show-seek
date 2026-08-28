import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OnboardingSelections } from '@/src/types/onboarding';

export interface OnboardingProgress {
  stepIndex: number;
  selections: OnboardingSelections;
  selectedViaOther?: boolean;
}

const getProgressKey = (userId: string) => `onboardingProgress:${userId}`;
// Legacy key for backwards compatibility / cleanup
const getLegacyStepIndexKey = (userId: string) => `onboardingStepIndex:${userId}`;

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
