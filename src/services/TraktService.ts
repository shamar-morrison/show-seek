/**
 * Trakt API Service
 *
 * Handles communication with the Trakt proxy backend for:
 * - OAuth authentication flow
 * - Triggering data sync
 * - Checking sync status
 * - Disconnecting Trakt account
 */

import { TRAKT_CONFIG } from '@/src/config/trakt';
import type { EnrichmentOptions, EnrichmentStatus, SyncStatus } from '@/src/types/trakt';
import { createTimeoutWithCleanup } from '@/src/utils/timeout';
import * as WebBrowser from 'expo-web-browser';

const { BACKEND_URL, CLIENT_ID, REDIRECT_URI } = TRAKT_CONFIG;

const validateUserId = (userId: string) => {
  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    throw new Error('Invalid userId: ID cannot be empty');
  }
};

/**
 * Initiate OAuth flow by opening Trakt authorization page in browser
 * The backend handles the token exchange via callback
 */
export async function initiateOAuthFlow(
  userId: string
): Promise<WebBrowser.WebBrowserAuthSessionResult> {
  validateUserId(userId);

  const authUrl =
    `https://trakt.tv/oauth/authorize?` +
    `response_type=code&` +
    `client_id=${CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
    `state=${userId}`;

  console.log('[Trakt] Initiating OAuth for user:', userId);

  return WebBrowser.openAuthSessionAsync(authUrl, REDIRECT_URI);
}

/**
 * Trigger data sync from Trakt to Firestore
 * The backend will import the user's watch history, ratings, lists, etc.
 */
export async function triggerSync(userId: string): Promise<void> {
  validateUserId(userId);
  console.log('[Trakt] Triggering sync for user:', userId);

  const { promise: timeoutPromise, cancel: cancelTimeout } = createTimeoutWithCleanup(15000);

  try {
    const response = await Promise.race([
      fetch(`${BACKEND_URL}/api/trakt/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      }),
      timeoutPromise,
    ]);

    cancelTimeout();

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Sync failed: ${errorText}`);
    }
  } catch (error) {
    cancelTimeout();
    throw error;
  }
}

/**
 * Check the current sync status for a user
 */
export async function checkSyncStatus(userId: string): Promise<SyncStatus> {
  validateUserId(userId);
  console.log('[Trakt] Checking sync status for user:', userId);

  const { promise: timeoutPromise, cancel: cancelTimeout } = createTimeoutWithCleanup(10000);

  try {
    const response = await Promise.race([
      fetch(`${BACKEND_URL}/api/trakt/sync?userId=${userId}`),
      timeoutPromise,
    ]);

    cancelTimeout();

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to check sync status: ${errorText}`);
    }

    return response.json();
  } catch (error) {
    cancelTimeout();
    throw error;
  }
}

/**
 * Disconnect Trakt account from the user's profile
 * Removes stored tokens but preserves synced data
 */
export async function disconnectTrakt(userId: string): Promise<void> {
  validateUserId(userId);
  console.log('[Trakt] Disconnecting for user:', userId);

  const { promise: timeoutPromise, cancel: cancelTimeout } = createTimeoutWithCleanup(10000);

  try {
    const response = await Promise.race([
      fetch(`${BACKEND_URL}/api/trakt/disconnect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      }),
      timeoutPromise,
    ]);

    cancelTimeout();

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Disconnect failed: ${errorText}`);
    }
  } catch (error) {
    cancelTimeout();
    throw error;
  }
}

/**
 * Trigger TMDB enrichment for synced Trakt data
 * Fetches posters, ratings, and genres from TMDB
 */
export async function triggerEnrichment(
  userId: string,
  options?: EnrichmentOptions
): Promise<void> {
  validateUserId(userId);
  console.log('[Trakt] Triggering enrichment for user:', userId);

  const { promise: timeoutPromise, cancel: cancelTimeout } = createTimeoutWithCleanup(15000);

  try {
    const response = await Promise.race([
      fetch(`${BACKEND_URL}/api/trakt/enrich`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          lists: options?.lists || ['already-watched', 'watchlist', 'favorites'],
          includeEpisodes: options?.includeEpisodes || false,
        }),
      }),
      timeoutPromise,
    ]);

    cancelTimeout();

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Enrichment failed: ${errorText}`);
    }
  } catch (error) {
    cancelTimeout();
    throw error;
  }
}

/**
 * Check the current enrichment status for a user
 */
export async function checkEnrichmentStatus(userId: string): Promise<EnrichmentStatus> {
  validateUserId(userId);
  console.log('[Trakt] Checking enrichment status for user:', userId);

  const { promise: timeoutPromise, cancel: cancelTimeout } = createTimeoutWithCleanup(10000);

  try {
    const response = await Promise.race([
      fetch(`${BACKEND_URL}/api/trakt/enrich?userId=${userId}`),
      timeoutPromise,
    ]);

    cancelTimeout();

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to check enrichment status: ${errorText}`);
    }

    return response.json();
  } catch (error) {
    cancelTimeout();
    throw error;
  }
}
