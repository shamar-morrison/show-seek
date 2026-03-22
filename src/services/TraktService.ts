/**
 * Trakt API Service
 *
 * Handles communication with the Firebase Functions Trakt backend for:
 * - OAuth authentication flow
 * - Triggering data sync
 * - Checking sync status
 * - Disconnecting Trakt account
 */

import { TRAKT_CONFIG } from '@/src/config/trakt';
import { auth } from '@/src/firebase/config';
import type {
  EnrichmentOptions,
  EnrichmentStatus,
  SyncErrorCategory,
  SyncStatus,
} from '@/src/types/trakt';
import { createTimeoutWithCleanup } from '@/src/utils/timeout';
import * as WebBrowser from 'expo-web-browser';

const { BACKEND_URL, REDIRECT_URI } = TRAKT_CONFIG;

const isActiveSyncStatus = (status?: SyncStatus['status']): boolean =>
  status === 'queued' || status === 'in_progress' || status === 'retrying';

const isActiveEnrichmentStatus = (status?: EnrichmentStatus['status']): boolean =>
  status === 'queued' || status === 'in_progress' || status === 'retrying';

const requireAuthenticatedUser = async () => {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Must be logged in to use Trakt');
  }

  const idToken = await currentUser.getIdToken();
  return {
    currentUser,
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
  };
};

const parseJsonSafely = async (response: Response): Promise<Record<string, unknown> | undefined> => {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return undefined;
  }
};

export class TraktRequestError extends Error {
  category?: SyncErrorCategory;
  nextAllowedEnrichAt?: string;
  nextAllowedSyncAt?: string;
  responseBody?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      category?: SyncErrorCategory;
      nextAllowedEnrichAt?: string;
      nextAllowedSyncAt?: string;
      responseBody?: Record<string, unknown>;
    } = {}
  ) {
    super(message);
    this.name = 'TraktRequestError';
    this.category = options.category;
    this.nextAllowedEnrichAt = options.nextAllowedEnrichAt;
    this.nextAllowedSyncAt = options.nextAllowedSyncAt;
    this.responseBody = options.responseBody;
  }
}

const buildRequestError = async (
  response: Response,
  fallbackMessage: string
): Promise<TraktRequestError> => {
  const responseBody = await parseJsonSafely(response);
  const message =
    typeof responseBody?.errorMessage === 'string'
      ? responseBody.errorMessage
      : typeof responseBody?.error === 'string'
        ? responseBody.error
        : fallbackMessage;

  return new TraktRequestError(message, {
    category:
      typeof responseBody?.errorCategory === 'string'
        ? (responseBody.errorCategory as SyncErrorCategory)
        : undefined,
    nextAllowedEnrichAt:
      typeof responseBody?.nextAllowedEnrichAt === 'string'
        ? responseBody.nextAllowedEnrichAt
        : undefined,
    nextAllowedSyncAt:
      typeof responseBody?.nextAllowedSyncAt === 'string' ? responseBody.nextAllowedSyncAt : undefined,
    responseBody,
  });
};

/**
 * Initiate OAuth flow by requesting an auth URL from the backend and opening it in a browser.
 */
export async function initiateOAuthFlow(): Promise<WebBrowser.WebBrowserAuthSessionResult> {
  const { headers } = await requireAuthenticatedUser();
  const { promise: timeoutPromise, cancel: cancelTimeout } = createTimeoutWithCleanup(10000);

  try {
    const response = await Promise.race([
      fetch(`${BACKEND_URL}/oauth/start`, {
        method: 'POST',
        headers,
      }),
      timeoutPromise,
    ]);

    cancelTimeout();

    if (!response.ok) {
      throw await buildRequestError(response, 'Failed to start Trakt OAuth');
    }

    const payload = await response.json();
    if (!payload?.authUrl || typeof payload.authUrl !== 'string') {
      throw new Error('Missing Trakt OAuth URL from backend');
    }

    return WebBrowser.openAuthSessionAsync(payload.authUrl, REDIRECT_URI);
  } catch (error) {
    cancelTimeout();
    throw error;
  }
}

/**
 * Trigger data sync from Trakt to Firestore.
 */
export async function triggerSync(): Promise<void> {
  const { currentUser, headers } = await requireAuthenticatedUser();
  console.log('[Trakt] Triggering sync for user:', currentUser.uid);

  const { promise: timeoutPromise, cancel: cancelTimeout } = createTimeoutWithCleanup(15000);

  try {
    const response = await Promise.race([
      fetch(`${BACKEND_URL}/sync`, {
        method: 'POST',
        headers,
      }),
      timeoutPromise,
    ]);

    cancelTimeout();

    if (!response.ok) {
      throw await buildRequestError(response, 'Sync failed');
    }
  } catch (error) {
    cancelTimeout();

    if (error instanceof Error && error.message === 'Request timed out') {
      try {
        const status = await checkSyncStatus();
        if (isActiveSyncStatus(status.status)) {
          console.log('[Trakt] Sync request timed out locally, but backend already has an active run');
          return;
        }
      } catch (statusError) {
        console.warn('[Trakt] Failed to recover sync status after timeout:', statusError);
      }
    }

    throw error;
  }
}

/**
 * Check the current sync status for the authenticated user.
 */
export async function checkSyncStatus(): Promise<SyncStatus> {
  const { currentUser, headers } = await requireAuthenticatedUser();
  console.log('[Trakt] Checking sync status for user:', currentUser.uid);

  const { promise: timeoutPromise, cancel: cancelTimeout } = createTimeoutWithCleanup(10000);

  try {
    const response = await Promise.race([
      fetch(`${BACKEND_URL}/sync`, {
        headers: {
          Authorization: headers.Authorization,
        },
      }),
      timeoutPromise,
    ]);

    cancelTimeout();

    if (!response.ok) {
      throw await buildRequestError(response, 'Failed to check sync status');
    }

    return response.json();
  } catch (error) {
    cancelTimeout();
    throw error;
  }
}

/**
 * Disconnect Trakt account from the user's profile.
 */
export async function disconnectTrakt(): Promise<void> {
  const { currentUser, headers } = await requireAuthenticatedUser();
  console.log('[Trakt] Disconnecting for user:', currentUser.uid);

  const { promise: timeoutPromise, cancel: cancelTimeout } = createTimeoutWithCleanup(10000);

  try {
    const response = await Promise.race([
      fetch(`${BACKEND_URL}/disconnect`, {
        method: 'POST',
        headers,
      }),
      timeoutPromise,
    ]);

    cancelTimeout();

    if (!response.ok) {
      throw await buildRequestError(response, 'Disconnect failed');
    }
  } catch (error) {
    cancelTimeout();
    throw error;
  }
}

/**
 * Trigger TMDB enrichment for synced Trakt data.
 */
export async function triggerEnrichment(options?: EnrichmentOptions): Promise<void> {
  const { currentUser, headers } = await requireAuthenticatedUser();
  console.log('[Trakt] Triggering enrichment for user:', currentUser.uid);

  const { promise: timeoutPromise, cancel: cancelTimeout } = createTimeoutWithCleanup(15000);

  try {
    const response = await Promise.race([
      fetch(`${BACKEND_URL}/enrich`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          includeEpisodes: options?.includeEpisodes || false,
          lists: options?.lists || ['already-watched', 'watchlist', 'favorites'],
        }),
      }),
      timeoutPromise,
    ]);

    cancelTimeout();

    if (!response.ok) {
      throw await buildRequestError(response, 'Enrichment failed');
    }
  } catch (error) {
    cancelTimeout();

    if (error instanceof Error && error.message === 'Request timed out') {
      try {
        const status = await checkEnrichmentStatus();
        if (isActiveEnrichmentStatus(status.status)) {
          console.log('[Trakt] Enrichment request timed out locally, but backend already has an active run');
          return;
        }
      } catch (statusError) {
        console.warn('[Trakt] Failed to recover enrichment status after timeout:', statusError);
      }
    }

    throw error;
  }
}

/**
 * Check the current enrichment status for the authenticated user.
 */
export async function checkEnrichmentStatus(): Promise<EnrichmentStatus> {
  const { currentUser, headers } = await requireAuthenticatedUser();
  console.log('[Trakt] Checking enrichment status for user:', currentUser.uid);

  const { promise: timeoutPromise, cancel: cancelTimeout } = createTimeoutWithCleanup(10000);

  try {
    const response = await Promise.race([
      fetch(`${BACKEND_URL}/enrich`, {
        headers: {
          Authorization: headers.Authorization,
        },
      }),
      timeoutPromise,
    ]);

    cancelTimeout();

    if (!response.ok) {
      throw await buildRequestError(response, 'Failed to check enrichment status');
    }

    return response.json();
  } catch (error) {
    cancelTimeout();
    throw error;
  }
}
