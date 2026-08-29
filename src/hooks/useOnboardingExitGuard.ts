import {
  trackOnboardingExitIntentDecision,
  trackOnboardingExitIntentShown,
} from '@/src/services/analytics';
import type {
  OnboardingExitIntentScreen,
  OnboardingExitIntentVariant,
} from '@/src/services/analytics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform } from 'react-native';

interface UseOnboardingExitGuardOptions {
  /**
   * Which onboarding screen this guard is active on.
   * Used for analytics event params.
   */
  screenName: OnboardingExitIntentScreen;

  /**
   * Copy variant for A/B testing. Default: 'a'.
   */
  variant?: OnboardingExitIntentVariant;

  /**
   * Whether the exit guard should be active.
   * Set to `false` to disable interception (e.g. when on a non-first step
   * in a multi-step flow where back should navigate between steps instead).
   * Default: true.
   */
  enabled?: boolean;
}

interface UseOnboardingExitGuardResult {
  /** Whether the exit-intent modal should be visible. */
  isExitModalVisible: boolean;

  /** Call when the user taps "Continue Setup" — dismisses modal and resets the one-shot flag. */
  onContinue: () => void;

  /** Call when the user taps "Exit Anyway" — allows the app to exit. */
  onExit: () => void;
}

/**
 * Intercepts the Android hardware back button on onboarding screens to show
 * an exit-intent modal before allowing the app to exit.
 *
 * Safety valve: the modal is shown at most once per exit attempt.
 * - First back press → show modal, block exit.
 * - Second back press (while modal visible) → allow exit.
 * - "Continue" button → dismiss modal, reset flag so it can show again next time.
 * - "Exit" button → exit the app.
 *
 * On iOS/web this hook is a no-op since swipe-back is disabled via
 * `gestureEnabled: false` on the Stack screen options.
 */
export function useOnboardingExitGuard({
  screenName,
  variant = 'a',
  enabled = true,
}: UseOnboardingExitGuardOptions): UseOnboardingExitGuardResult {
  const [isExitModalVisible, setIsExitModalVisible] = useState(false);
  const hasShownRef = useRef(false);

  // Keep variant in a ref so the BackHandler callback doesn't go stale
  const variantRef = useRef(variant);
  variantRef.current = variant;

  const screenNameRef = useRef(screenName);
  screenNameRef.current = screenName;

  useEffect(() => {
    if (Platform.OS !== 'android' || !enabled) {
      return;
    }

    const handleBackPress = (): boolean => {
      if (hasShownRef.current) {
        // Modal was already shown for this exit attempt — let the OS exit.
        setIsExitModalVisible(false);
        return false;
      }

      // First back press — show the modal and block exit.
      hasShownRef.current = true;
      setIsExitModalVisible(true);

      void trackOnboardingExitIntentShown({
        screen: screenNameRef.current,
        variant: variantRef.current,
      });

      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => subscription.remove();
  }, [enabled]);

  const onContinue = useCallback(() => {
    setIsExitModalVisible(false);
    // Reset the one-shot flag so the modal can show again on the next exit attempt.
    hasShownRef.current = false;

    void trackOnboardingExitIntentDecision({
      screen: screenNameRef.current,
      variant: variantRef.current,
      decision: 'continue',
    });
  }, []);

  const onExit = useCallback(() => {
    void trackOnboardingExitIntentDecision({
      screen: screenNameRef.current,
      variant: variantRef.current,
      decision: 'exit',
    });

    setIsExitModalVisible(false);
    // Allow the app to exit.
    BackHandler.exitApp();
  }, []);

  return { isExitModalVisible, onContinue, onExit };
}
