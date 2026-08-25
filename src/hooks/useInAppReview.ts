import {
  forceRequestReview,
  requestReviewIfEligible,
} from '@/src/services/reviewPromptService';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

const REVIEW_PROMPT_DELAY_MS = 2500;

/**
 * Hook that triggers the in-app review prompt when the Home tab gains focus.
 *
 * - Waits 2.5 seconds after focus before checking eligibility (natural pause).
 * - Clears the timeout on blur or unmount.
 * - If `__DEV__` AND `EXPO_PUBLIC_FORCE_REVIEW_PROMPT === 'true'`, bypasses all
 *   eligibility checks and force-triggers the prompt.
 * - Fire-and-forget: no return value, no UI.
 */
export function useInAppReview(): void {
  const hasAttemptedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      // Only attempt once per app session to avoid repeated checks on every tab switch
      if (hasAttemptedRef.current) {
        return;
      }

      const timer = setTimeout(async () => {
        hasAttemptedRef.current = true;

        try {
          // Dev override: both __DEV__ and the env flag must be true
          if (__DEV__ && process.env.EXPO_PUBLIC_FORCE_REVIEW_PROMPT === 'true') {
            await forceRequestReview();
            return;
          }

          const result = await requestReviewIfEligible();

          if (__DEV__) {
            console.log('[useInAppReview] Result:', result);
          }
        } catch (error) {
          console.error('[useInAppReview] Error:', error);
        }
      }, REVIEW_PROMPT_DELAY_MS);

      return () => {
        clearTimeout(timer);
      };
    }, [])
  );
}
