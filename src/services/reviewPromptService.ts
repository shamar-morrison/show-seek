import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { Platform } from 'react-native';

// ─── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY = '@showseek/review-prompt';
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_SESSION_COUNT = 2;

// ─── State Shape ─────────────────────────────────────────────────────────────

interface ReviewPromptState {
  /** Epoch ms — set on first fully-initialized session */
  firstOpenTimestamp: number | null;
  /** Incremented on each cold start (after init gates clear) */
  sessionCount: number;
  /** Flipped true on first qualifying engagement action */
  hasEngaged: boolean;
  /** Set true immediately after calling requestReview() */
  hasRequestedReview: boolean;
  /** Epoch ms — set on purchase/restore failure or crash */
  lastNegativeEventTimestamp: number | null;
}

interface EligibilityResult {
  eligible: boolean;
  reason?: string;
}

interface RequestResult {
  requested: boolean;
  reason?: string;
}

const DEFAULT_STATE: ReviewPromptState = {
  firstOpenTimestamp: null,
  sessionCount: 0,
  hasEngaged: false,
  hasRequestedReview: false,
  lastNegativeEventTimestamp: null,
};

// ─── Persistence ─────────────────────────────────────────────────────────────

async function readState(): Promise<ReviewPromptState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_STATE };
    }

    const parsed = JSON.parse(raw) as Partial<ReviewPromptState>;
    return { ...DEFAULT_STATE, ...parsed };
  } catch (error) {
    console.error('[ReviewPrompt] Failed to read state:', error);
    return { ...DEFAULT_STATE };
  }
}

async function writeState(state: ReviewPromptState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('[ReviewPrompt] Failed to write state:', error);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Called once per cold start from `RootLayoutNav` after init gates clear.
 * Sets `firstOpenTimestamp` on the very first session and increments `sessionCount`.
 */
export async function initializeSession(): Promise<void> {
  const state = await readState();
  const now = Date.now();

  if (state.firstOpenTimestamp === null) {
    state.firstOpenTimestamp = now;
  }

  state.sessionCount += 1;
  await writeState(state);

  if (__DEV__) {
    console.log('[ReviewPrompt] Session initialized:', {
      sessionCount: state.sessionCount,
      firstOpenTimestamp: new Date(state.firstOpenTimestamp).toISOString(),
    });
  }
}

/**
 * Called from `onSuccess` of engagement mutations (addToList, addWatch, markEpisodeWatched).
 * Sets `hasEngaged = true` if not already set. No-op when already engaged.
 */
export async function recordEngagement(): Promise<void> {
  const state = await readState();

  if (state.hasEngaged) {
    return;
  }

  state.hasEngaged = true;
  await writeState(state);

  if (__DEV__) {
    console.log('[ReviewPrompt] Engagement recorded');
  }
}

/**
 * Called from purchase/restore error handlers and error boundary.
 * Sets `lastNegativeEventTimestamp` to now.
 */
export async function recordNegativeEvent(): Promise<void> {
  const state = await readState();
  state.lastNegativeEventTimestamp = Date.now();
  await writeState(state);

  if (__DEV__) {
    console.log('[ReviewPrompt] Negative event recorded');
  }
}

/**
 * Checks all eligibility conditions for showing the review prompt.
 *
 * All must be true:
 * 1. firstOpenTimestamp is set AND ≥ 48 hours have elapsed
 * 2. sessionCount ≥ 2
 * 3. hasEngaged === true
 * 4. hasRequestedReview === false
 * 5. lastNegativeEventTimestamp is null OR ≥ 7 days have elapsed
 */
export async function checkEligibility(): Promise<EligibilityResult> {
  const state = await readState();
  const now = Date.now();

  if (state.hasRequestedReview) {
    return { eligible: false, reason: 'Review already requested' };
  }

  if (state.firstOpenTimestamp === null) {
    return { eligible: false, reason: 'First open timestamp not set' };
  }

  if (now - state.firstOpenTimestamp < FORTY_EIGHT_HOURS_MS) {
    return { eligible: false, reason: 'Less than 48 hours since first open' };
  }

  if (state.sessionCount < MIN_SESSION_COUNT) {
    return { eligible: false, reason: `Only ${state.sessionCount}/${MIN_SESSION_COUNT} sessions` };
  }

  if (!state.hasEngaged) {
    return { eligible: false, reason: 'No engagement action recorded' };
  }

  if (
    state.lastNegativeEventTimestamp !== null &&
    now - state.lastNegativeEventTimestamp < SEVEN_DAYS_MS
  ) {
    return { eligible: false, reason: 'Recent negative event (within 7 days)' };
  }

  return { eligible: true };
}

/**
 * Main entry point: checks eligibility → platform availability → requests review.
 * Sets `hasRequestedReview = true` immediately after calling `requestReview()`,
 * regardless of whether the native dialog was actually displayed (per Google's API design).
 */
export async function requestReviewIfEligible(): Promise<RequestResult> {
  const eligibility = await checkEligibility();

  if (!eligibility.eligible) {
    if (__DEV__) {
      console.log('[ReviewPrompt] Not eligible:', eligibility.reason);
    }
    return { requested: false, reason: eligibility.reason };
  }

  // Only supported on Android and iOS
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return { requested: false, reason: 'Platform not supported' };
  }

  const isAvailable = await StoreReview.isAvailableAsync();
  if (!isAvailable) {
    if (__DEV__) {
      console.log('[ReviewPrompt] StoreReview not available on this device');
    }
    return { requested: false, reason: 'StoreReview not available' };
  }

  await StoreReview.requestReview();

  // Mark as requested immediately — we can't know if the dialog was actually shown
  const state = await readState();
  state.hasRequestedReview = true;
  await writeState(state);

  if (__DEV__) {
    console.log('[ReviewPrompt] Review requested successfully');
  }

  return { requested: true };
}

/**
 * Dev-only: bypasses all eligibility checks and directly calls `requestReview()`.
 * Used by the `EXPO_PUBLIC_FORCE_REVIEW_PROMPT` env flag for QA testing.
 *
 * Has a hard `__DEV__` guard as the first line so this can never execute
 * in production, even if called directly — EXPO_PUBLIC_* env vars get
 * baked into the production bundle at build time.
 */
export async function forceRequestReview(): Promise<void> {
  if (!__DEV__) {
    return;
  }

  console.log('[ReviewPrompt] Force-triggering review (dev override)');

  const isAvailable = await StoreReview.isAvailableAsync();
  if (!isAvailable) {
    console.warn('[ReviewPrompt] StoreReview not available on this device (force mode)');
    return;
  }

  await StoreReview.requestReview();
}

/**
 * Returns the current persisted state. Useful for debugging.
 */
export async function getState(): Promise<ReviewPromptState> {
  return readState();
}

/**
 * Dev-only: resets all persisted review state. Useful for testing.
 */
export async function resetState(): Promise<void> {
  if (!__DEV__) {
    return;
  }

  await AsyncStorage.removeItem(STORAGE_KEY);
  console.log('[ReviewPrompt] State reset');
}
