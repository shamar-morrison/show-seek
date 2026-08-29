import { useAuth } from '@/src/context/auth';
import { usePremium } from '@/src/context/PremiumContext';
import {
  trackPaywallWinbackDecision,
  trackPaywallWinbackShown,
} from '@/src/services/analytics';
import type { PaywallWinbackScreen } from '@/src/services/analytics';
import {
  markHasSeenPaywallWinback,
  readHasSeenPaywallWinback,
} from '@/src/utils/winbackStorage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform } from 'react-native';

export interface UsePaywallExitGuardOptions {
  /**
   * Which paywall screen this guard is active on.
   * Default: 'onboarding-paywall'.
   */
  screenName?: PaywallWinbackScreen | string;

  /**
   * Whether the exit guard should be active. Default: true.
   */
  enabled?: boolean;

  /**
   * Fallback exit callback invoked when closing on non-Android platforms
   * or when BackHandler.exitApp is unavailable.
   */
  onExit?: () => void;
}

export interface UsePaywallExitGuardResult {
  /** Whether the win-back offer modal is currently visible. */
  isWinbackModalVisible: boolean;

  /** Call when the user explicitly declines or dismisses the win-back offer. */
  handleDecline: () => void;

  /**
   * Call when the user taps the paywall 'X' close button.
   * Intercepts and displays winback modal on first attempt, or exits on subsequent attempts.
   */
  handleCloseAttempt: () => void;

  /** Dismisses the winback modal without triggering decline exit logic (e.g. on successful purchase). */
  dismissWinbackModal: () => void;

  /** Whether the user is eligible to see the win-back offer. */
  isEligible: boolean;
}

/**
 * Intercepts the Android hardware back button and paywall close button on the
 * paywall step to show a one-time exit-intent win-back offer modal.
 *
 * Safety valve: the modal is shown at most once per user across sessions.
 * - First exit attempt → show modal, block exit, mark as seen.
 * - Second back press (while modal visible) → allow exit (exitApp).
 * - "No thanks" / Decline button → dismiss modal, exit app.
 * - On success purchase → dismiss modal, delegate to paywall's isPremium flow.
 */
export function usePaywallExitGuard({
  screenName = 'onboarding-paywall',
  enabled = true,
  onExit,
}: UsePaywallExitGuardOptions = {}): UsePaywallExitGuardResult {
  let user: { uid?: string } | null = null;
  try {
    const authContext = useAuth();
    user = authContext?.user ?? null;
  } catch {
    user = null;
  }

  const { isPremium } = usePremium();
  const [isWinbackModalVisible, setIsWinbackModalVisible] = useState(false);
  const [hasSeenWinback, setHasSeenWinback] = useState<boolean | null>(null);

  const hasShownRef = useRef(false);
  const screenNameRef = useRef(screenName);
  const readPromiseRef = useRef<Promise<boolean> | null>(null);
  const isEvaluatingRef = useRef(false);

  useEffect(() => {
    screenNameRef.current = screenName;
  }, [screenName]);

  const isEligible =
    Platform.OS === 'android' &&
    !isPremium &&
    hasSeenWinback === false &&
    !hasShownRef.current;

  const exitAction = useCallback(() => {
    if (Platform.OS === 'android' && typeof BackHandler?.exitApp === 'function') {
      BackHandler.exitApp();
      return;
    }
    if (onExit) {
      onExit();
    }
  }, [onExit]);

  // On mount, check whether the user has already seen the win-back offer
  useEffect(() => {
    let isCancelled = false;

    if (Platform.OS !== 'android' || isPremium) {
      setHasSeenWinback(true);
      readPromiseRef.current = Promise.resolve(true);
      return;
    }

    const promise = (async () => {
      try {
        const seen = await readHasSeenPaywallWinback(user?.uid);
        if (!isCancelled) {
          setHasSeenWinback(seen);
        }
        return seen;
      } catch (error) {
        console.warn('[usePaywallExitGuard] Failed to check winback seen status:', error);
        if (!isCancelled) {
          setHasSeenWinback(false);
        }
        return false;
      }
    })();

    readPromiseRef.current = promise;

    return () => {
      isCancelled = true;
      readPromiseRef.current = null;
    };
  }, [isPremium, user?.uid]);

  const executeDecisionForSeenStatus = useCallback(
    (seenStatus: boolean) => {
      if (isWinbackModalVisible) {
        setIsWinbackModalVisible(false);
        exitAction();
        return;
      }

      const eligible =
        Platform.OS === 'android' &&
        !isPremium &&
        !seenStatus &&
        !hasShownRef.current;

      if (!eligible) {
        // Ineligible or already shown — proceed with exit
        exitAction();
        return;
      }

      // First exit attempt: show modal and mark as seen
      hasShownRef.current = true;
      setHasSeenWinback(true);
      setIsWinbackModalVisible(true);

      if (user?.uid) {
        void markHasSeenPaywallWinback(user.uid);
      }

      void trackPaywallWinbackShown({
        screen: screenNameRef.current,
      });
    },
    [exitAction, isPremium, isWinbackModalVisible, user?.uid]
  );

  const triggerWinbackOffer = useCallback((): boolean => {
    // If modal is already showing, second back press allows exit
    if (isWinbackModalVisible) {
      setIsWinbackModalVisible(false);
      exitAction();
      return true;
    }

    // Ineligible regardless of seen status (non-Android, premium, or already shown)
    if (Platform.OS !== 'android' || isPremium || hasShownRef.current) {
      exitAction();
      return true;
    }

    // If seen status has resolved
    if (hasSeenWinback !== null) {
      executeDecisionForSeenStatus(hasSeenWinback);
      return true;
    }

    // If seen status is still pending (null), defer the decision until read resolves
    if (isEvaluatingRef.current) {
      // Rapid second attempt while read is pending: allow exit
      exitAction();
      return true;
    }

    isEvaluatingRef.current = true;
    const inFlightPromise =
      readPromiseRef.current ??
      readHasSeenPaywallWinback(user?.uid).catch((error) => {
        console.warn('[usePaywallExitGuard] Failed to check winback seen status:', error);
        return false;
      });

    void inFlightPromise
      .then((seen) => {
        executeDecisionForSeenStatus(seen);
      })
      .catch(() => {
        executeDecisionForSeenStatus(false);
      })
      .finally(() => {
        isEvaluatingRef.current = false;
      });

    return true;
  }, [
    executeDecisionForSeenStatus,
    exitAction,
    hasSeenWinback,
    isPremium,
    isWinbackModalVisible,
    user?.uid,
  ]);

  // Intercept Android hardware back button
  useEffect(() => {
    if (
      Platform.OS !== 'android' ||
      !enabled ||
      typeof BackHandler?.addEventListener !== 'function'
    ) {
      return;
    }

    const handleBackPress = (): boolean => {
      return triggerWinbackOffer();
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => subscription.remove();
  }, [enabled, triggerWinbackOffer]);

  const handleDecline = useCallback(() => {
    void trackPaywallWinbackDecision({
      screen: screenNameRef.current,
      decision: 'decline',
    });

    setIsWinbackModalVisible(false);
    exitAction();
  }, [exitAction]);

  const handleCloseAttempt = useCallback(() => {
    triggerWinbackOffer();
  }, [triggerWinbackOffer]);

  const dismissWinbackModal = useCallback(() => {
    setIsWinbackModalVisible(false);
  }, []);

  return {
    isWinbackModalVisible,
    handleDecline,
    handleCloseAttempt,
    dismissWinbackModal,
    isEligible,
  };
}
