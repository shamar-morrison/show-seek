import * as crypto from 'node:crypto';
import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import {
  MAX_PAGINATION_PAGES,
  TMDB_API_BASE,
  TMDB_API_KEY,
  TRAKT_API_BASE,
  TRAKT_API_VERSION,
  TRAKT_APP_USER_AGENT,
  TRAKT_CLIENT_ID,
  TRAKT_CLIENT_SECRET,
  TRAKT_OAUTH_START_COOLDOWN_MS,
  TRAKT_OAUTH_STATE_TTL_MS,
  TRAKT_OAUTH_TIMEOUT_MS,
  TRAKT_REDIRECT_URI,
  TRAKT_REQUEST_TIMEOUT_MS,
  TRAKT_SYNC_LOCKED_ACCOUNT_MESSAGE,
  TRAKT_SYNC_RECONNECT_MESSAGE,
} from './constants';
import { isPlainObject } from './transforms';
import {
  SecretLike,
  TraktActivitiesGroup,
  TraktFavorite,
  TraktHeaderOptions,
  TraktLastActivities,
  TraktList,
  TraktListItem,
  TraktOAuthError,
  TraktOAuthStateDoc,
  TraktRating,
  TraktRawResponse,
  TraktRequestOptions,
  TraktSyncError,
  TraktTokenResponse,
  TraktUserDoc,
  TraktWatchedMovie,
  TraktWatchedShow,
  TraktWatchlistItem,
  UserProfileResponse,
} from './types';

export const trimSecret = (secret: SecretLike, secretName: string): string => {
  const value = secret.value()?.trim();
  if (!value) {
    throw new TraktSyncError(`Missing secret ${secretName}.`, 'internal', false);
  }
  return value;
};

export const sanitizeSnippet = (rawBody: string): string | undefined => {
  const normalized = rawBody.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.slice(0, 160);
};

export const parseRetryAfterSeconds = (headerValue: string | null): number | undefined => {
  if (!headerValue) {
    return undefined;
  }

  const numericSeconds = parseInt(headerValue, 10);
  if (Number.isFinite(numericSeconds) && numericSeconds >= 0) {
    return numericSeconds;
  }

  const retryDate = new Date(headerValue);
  if (!Number.isNaN(retryDate.getTime())) {
    const diffSeconds = Math.ceil((retryDate.getTime() - Date.now()) / 1000);
    return diffSeconds > 0 ? diffSeconds : 0;
  }

  return undefined;
};

export const isCloudflareBlockedResponse = (
  status: number,
  contentType: string,
  rawBody: string,
  cfRay?: string
): boolean => {
  if (status === 403 || status === 503) {
    if (Boolean(cfRay)) {
      return true;
    }
    if (contentType.includes('text/html')) {
      const lower = rawBody.toLowerCase();
      return (
        lower.includes('cloudflare') ||
        lower.includes('ray id') ||
        lower.includes('attention required') ||
        lower.includes('challenge-platform')
      );
    }
  }
  return false;
};

export const getOAuthConfig = (): { clientId: string; clientSecret: string; redirectUri: string } => ({
  clientId: trimSecret(TRAKT_CLIENT_ID, 'TRAKT_CLIENT_ID'),
  clientSecret: trimSecret(TRAKT_CLIENT_SECRET, 'TRAKT_CLIENT_SECRET'),
  redirectUri: trimSecret(TRAKT_REDIRECT_URI, 'TRAKT_REDIRECT_URI'),
});

export const buildTraktHeaders = ({
  accessToken,
  clientId,
  hasJsonBody = false,
}: TraktHeaderOptions): Record<string, string> => {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': TRAKT_APP_USER_AGENT,
    'trakt-api-key': clientId,
    'trakt-api-version': TRAKT_API_VERSION,
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  if (hasJsonBody) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
};

export const requestOAuthToken = async (
  body: Record<string, string>,
  operation: 'exchange' | 'refresh'
): Promise<TraktTokenResponse> => {
  const { clientId } = getOAuthConfig();
  let response: globalThis.Response;

  try {
    response = await fetch(`${TRAKT_API_BASE}/oauth/token`, {
      method: 'POST',
      headers: buildTraktHeaders({
        clientId,
        hasJsonBody: true,
      }),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TRAKT_OAUTH_TIMEOUT_MS),
    });
  } catch {
    const message =
      operation === 'exchange'
        ? 'Token exchange request timed out or failed.'
        : 'Token refresh request timed out or failed.';
    throw new TraktOAuthError(message, 'upstream_unavailable');
  }

  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
  const cfRay = response.headers.get('cf-ray') ?? undefined;
  const rawBody = await response.text();
  const snippet = sanitizeSnippet(rawBody);

  if (response.ok) {
    try {
      const parsed = JSON.parse(rawBody) as Partial<TraktTokenResponse>;
      if (
        typeof parsed.access_token === 'string' &&
        typeof parsed.refresh_token === 'string' &&
        typeof parsed.expires_in === 'number' &&
        typeof parsed.created_at === 'number'
      ) {
        return parsed as TraktTokenResponse;
      }
    } catch {
      // Ignore parse errors below.
    }

    throw new TraktOAuthError('Trakt OAuth returned an unexpected response.', 'upstream_unavailable', {
      cfRay,
      snippet,
      statusCode: response.status,
    });
  }

  if (response.status === 429) {
    throw new TraktOAuthError('Trakt OAuth start is rate limited.', 'rate_limited', {
      cfRay,
      snippet,
      statusCode: response.status,
    });
  }

  if (isCloudflareBlockedResponse(response.status, contentType, rawBody, cfRay)) {
    throw new TraktOAuthError('Trakt OAuth request was blocked upstream.', 'upstream_blocked', {
      cfRay,
      snippet,
      statusCode: response.status,
    });
  }

  if (response.status >= 500) {
    throw new TraktOAuthError('Trakt OAuth is temporarily unavailable.', 'upstream_unavailable', {
      cfRay,
      snippet,
      statusCode: response.status,
    });
  }

  throw new TraktOAuthError('Trakt OAuth rejected the request.', 'invalid_oauth', {
    cfRay,
    snippet,
    statusCode: response.status,
  });
};

export const exchangeAuthorizationCode = async (code: string): Promise<TraktTokenResponse> => {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  return requestOAuthToken(
    {
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    },
    'exchange'
  );
};

export const refreshAccessToken = async (refreshToken: string): Promise<TraktTokenResponse> => {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  return requestOAuthToken(
    {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      redirect_uri: redirectUri,
      refresh_token: refreshToken,
    },
    'refresh'
  );
};

export const createOAuthState = async (userId: string): Promise<{ authUrl: string; nextAllowedAt: Timestamp }> => {
  const { clientId, redirectUri } = getOAuthConfig();
  const db = admin.firestore();
  const userRef = db.collection('users').doc(userId);
  const nowMillis = Date.now();
  const now = Timestamp.fromMillis(nowMillis);
  const nextAllowedAt = Timestamp.fromMillis(nowMillis + TRAKT_OAUTH_START_COOLDOWN_MS);
  const expiresAt = Timestamp.fromMillis(nowMillis + TRAKT_OAUTH_STATE_TTL_MS);
  const state = crypto.randomUUID().replace(/-/g, '');
  const stateRef = db.collection('traktOAuthStates').doc(state);

  await db.runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(userRef);
    const userData = (userSnapshot.data() ?? {}) as TraktUserDoc;
    const currentAllowedAt = userData.traktOauthStartAllowedAt;

    if (currentAllowedAt instanceof Timestamp && currentAllowedAt.toMillis() > nowMillis) {
      throw new TraktOAuthError('Please wait before trying to connect Trakt again.', 'rate_limited', {
        statusCode: 429,
      });
    }

    transaction.set(
      stateRef,
      {
        createdAt: now,
        expiresAt,
        used: false,
        userId,
      } satisfies TraktOAuthStateDoc,
      { merge: true }
    );

    transaction.set(
      userRef,
      {
        traktOauthStartAllowedAt: nextAllowedAt,
      },
      { merge: true }
    );
  });

  const authUrl =
    `https://trakt.tv/oauth/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;

  return { authUrl, nextAllowedAt };
};

export const consumeOAuthState = async (state: string): Promise<string> => {
  const db = admin.firestore();
  const stateRef = db.collection('traktOAuthStates').doc(state);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(stateRef);
    if (!snapshot.exists) {
      throw new TraktOAuthError('Missing OAuth state.', 'invalid_oauth', { statusCode: 400 });
    }

    const stateData = snapshot.data() as TraktOAuthStateDoc;
    if (stateData.used) {
      throw new TraktOAuthError('OAuth state already used.', 'invalid_oauth', { statusCode: 400 });
    }

    if (!(stateData.expiresAt instanceof Timestamp) || stateData.expiresAt.toMillis() < Date.now()) {
      throw new TraktOAuthError('OAuth state expired.', 'invalid_oauth', { statusCode: 400 });
    }

    transaction.set(
      stateRef,
      {
        used: true,
        usedAt: Timestamp.now(),
      },
      { merge: true }
    );

    return stateData.userId;
  });
};

export const getHeaderValue = (headers: unknown, name: string): string | null => {
  if (!headers) {
    return null;
  }
  if (typeof (headers as { get?: unknown }).get === 'function') {
    return (headers as { get: (headerName: string) => string | null }).get(name);
  }
  if (typeof headers === 'object') {
    const target = name.toLowerCase();
    for (const [key, val] of Object.entries(headers as Record<string, unknown>)) {
      if (key.toLowerCase() === target && typeof val === 'string') {
        return val;
      }
    }
  }
  return null;
};

export const traktRequestRaw = async <T>({
  accessToken,
  endpoint,
  method = 'GET',
  body,
}: TraktRequestOptions): Promise<TraktRawResponse<T>> => {
  const { clientId } = getOAuthConfig();
  let response: globalThis.Response;
  const hasJsonBody = body !== undefined;

  try {
    response = await fetch(`${TRAKT_API_BASE}${endpoint}`, {
      method,
      headers: buildTraktHeaders({
        accessToken,
        clientId,
        hasJsonBody,
      }),
      body: hasJsonBody ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TRAKT_REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new TraktSyncError('Trakt API request timed out or failed.', 'upstream_unavailable', true, {
      endpoint,
    });
  }

  if (response.ok) {
    const data = (await response.json()) as T;
    return { data, headers: response.headers };
  }

  const rawHeaders = response.headers;
  const contentType = (getHeaderValue(rawHeaders, 'content-type') ?? '').toLowerCase();
  const cfRay = getHeaderValue(rawHeaders, 'cf-ray') ?? undefined;
  const retryAfterSeconds = parseRetryAfterSeconds(getHeaderValue(rawHeaders, 'retry-after'));
  const rawBody = await response.text();
  const snippet = sanitizeSnippet(rawBody);

  if (response.status === 423) {
    throw new TraktSyncError(TRAKT_SYNC_LOCKED_ACCOUNT_MESSAGE, 'locked_account', false, {
      cfRay,
      endpoint,
      snippet,
      statusCode: response.status,
    });
  }

  if (response.status === 429) {
    throw new TraktSyncError('Trakt rate limited the sync request.', 'rate_limited', true, {
      cfRay,
      endpoint,
      retryAfterSeconds,
      snippet,
      statusCode: response.status,
    });
  }

  if (response.status === 401) {
    throw new TraktSyncError(TRAKT_SYNC_RECONNECT_MESSAGE, 'auth_invalid', false, {
      cfRay,
      endpoint,
      snippet,
      statusCode: response.status,
    });
  }

  if (isCloudflareBlockedResponse(response.status, contentType, rawBody, cfRay)) {
    throw new TraktSyncError('Trakt blocked the request upstream.', 'upstream_blocked', true, {
      cfRay,
      endpoint,
      snippet,
      statusCode: response.status,
    });
  }

  if (response.status >= 500) {
    throw new TraktSyncError('Trakt is temporarily unavailable.', 'upstream_unavailable', true, {
      cfRay,
      endpoint,
      retryAfterSeconds,
      snippet,
      statusCode: response.status,
    });
  }

  throw new TraktSyncError(`Trakt API request failed with status ${response.status}.`, 'internal', false, {
    cfRay,
    endpoint,
    retryAfterSeconds,
    snippet,
    statusCode: response.status,
  });
};

export const traktRequest = async <T>(options: TraktRequestOptions): Promise<T> => {
  const { data } = await traktRequestRaw<T>(options);
  return data;
};

export const appendPaginationParams = (endpoint: string, page: number, limit = 100): string => {
  const [basePath, queryString] = endpoint.split('?');
  const searchParams = new URLSearchParams(queryString || '');
  searchParams.set('page', String(page));
  searchParams.set('limit', String(limit));
  return `${basePath}?${searchParams.toString()}`;
};

export const traktPaginatedRequest = async <T>({
  accessToken,
  endpoint,
  limit = 100,
}: {
  accessToken: string;
  endpoint: string;
  limit?: number;
}): Promise<T[]> => {
  const firstPageEndpoint = appendPaginationParams(endpoint, 1, limit);
  const { data: firstPageData, headers } = await traktRequestRaw<unknown>({
    accessToken,
    endpoint: firstPageEndpoint,
  });

  if (!Array.isArray(firstPageData)) {
    if (firstPageData !== null && firstPageData !== undefined) {
      console.warn(
        `[TraktSync] Expected array response from paginated endpoint ${endpoint}, received ${typeof firstPageData}`
      );
    }
    return [];
  }

  const pageCountStr =
    getHeaderValue(headers, 'x-pagination-page-count') ||
    getHeaderValue(headers, 'X-Pagination-Page-Count');
  const totalPages = pageCountStr ? parseInt(pageCountStr, 10) : 1;

  const allItems: T[] = [...(firstPageData as T[])];

  if (Number.isFinite(totalPages) && totalPages > 1) {
    if (totalPages > MAX_PAGINATION_PAGES) {
      console.warn(
        `[TraktSync] Total pages reported (${totalPages}) exceeds MAX_PAGINATION_PAGES (${MAX_PAGINATION_PAGES}) for endpoint ${endpoint}. Fetching capped to ${MAX_PAGINATION_PAGES} pages.`
      );
    }
    const pagesToFetch = Math.min(totalPages, MAX_PAGINATION_PAGES);
    for (let page = 2; page <= pagesToFetch; page++) {
      const pageEndpoint = appendPaginationParams(endpoint, page, limit);
      const { data: pageData } = await traktRequestRaw<unknown>({
        accessToken,
        endpoint: pageEndpoint,
      });

      if (Array.isArray(pageData)) {
        allItems.push(...(pageData as T[]));
      } else {
        console.warn(
          `[TraktSync] Expected array on page ${page} from paginated endpoint ${endpoint}, received ${typeof pageData}`
        );
      }
    }
  }

  return allItems;
};

export const getUserProfile = async (accessToken: string): Promise<UserProfileResponse['user']> => {
  const response = await traktRequest<UserProfileResponse>({
    accessToken,
    endpoint: '/users/settings',
  });
  return response.user;
};

export const getWatchedMovies = (accessToken: string): Promise<TraktWatchedMovie[]> =>
  traktPaginatedRequest<TraktWatchedMovie>({
    accessToken,
    endpoint: '/sync/watched/movies',
  });

export const getWatchedShows = (accessToken: string): Promise<TraktWatchedShow[]> =>
  traktPaginatedRequest<TraktWatchedShow>({
    accessToken,
    endpoint: '/sync/watched/shows?extended=progress',
  });

export const getRatings = (accessToken: string): Promise<TraktRating[]> =>
  traktPaginatedRequest<TraktRating>({
    accessToken,
    endpoint: '/sync/ratings',
  });

export const getUserLists = (accessToken: string, username: string): Promise<TraktList[]> =>
  traktPaginatedRequest<TraktList>({
    accessToken,
    endpoint: `/users/${username}/lists`,
  });

export const getListItems = (accessToken: string, username: string, listId: string): Promise<TraktListItem[]> =>
  traktPaginatedRequest<TraktListItem>({
    accessToken,
    endpoint: `/users/${username}/lists/${listId}/items`,
  });

export const getWatchlist = (accessToken: string): Promise<TraktWatchlistItem[]> =>
  traktPaginatedRequest<TraktWatchlistItem>({
    accessToken,
    endpoint: '/sync/watchlist',
  });

export const getFavorites = (accessToken: string): Promise<TraktFavorite[]> =>
  traktPaginatedRequest<TraktFavorite>({
    accessToken,
    endpoint: '/sync/favorites',
  });

export const getLastActivities = async (accessToken: string): Promise<TraktLastActivities> => {
  const activities = await traktRequest<Record<string, unknown>>({
    accessToken,
    endpoint: '/sync/last_activities',
  });

  return {
    episodes: isPlainObject(activities.episodes) ? (activities.episodes as TraktActivitiesGroup) : undefined,
    favorites: isPlainObject(activities.favorites) ? (activities.favorites as TraktActivitiesGroup) : undefined,
    lists: isPlainObject(activities.lists) ? (activities.lists as TraktActivitiesGroup) : undefined,
    movies: isPlainObject(activities.movies) ? (activities.movies as TraktActivitiesGroup) : undefined,
    shows: isPlainObject(activities.shows) ? (activities.shows as TraktActivitiesGroup) : undefined,
    watchlist: isPlainObject(activities.watchlist) ? (activities.watchlist as TraktActivitiesGroup) : undefined,
  };
};

export const fetchTMDBJson = async <T>(path: string): Promise<T | null> => {
  const apiKey = trimSecret(TMDB_API_KEY, 'TMDB_API_KEY');

  try {
    const response = await fetch(`${TMDB_API_BASE}${path}${path.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(apiKey)}`, {
      signal: AbortSignal.timeout(TRAKT_REQUEST_TIMEOUT_MS),
    });

    if (response.status === 404) {
      return null;
    }

    if (response.status === 429) {
      throw new TraktSyncError('TMDB rate limited the enrichment request.', 'rate_limited', true, {
        endpoint: path,
        retryAfterSeconds: parseRetryAfterSeconds(response.headers.get('retry-after')),
        statusCode: response.status,
      });
    }

    if (response.status >= 500) {
      throw new TraktSyncError('TMDB is temporarily unavailable.', 'upstream_unavailable', true, {
        endpoint: path,
        retryAfterSeconds: parseRetryAfterSeconds(response.headers.get('retry-after')),
        statusCode: response.status,
      });
    }

    if (response.status === 401 || response.status === 403) {
      throw new TraktSyncError('TMDB enrichment is not configured correctly.', 'internal', false, {
        endpoint: path,
        statusCode: response.status,
      });
    }

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof TraktSyncError) {
      throw error;
    }

    throw new TraktSyncError('TMDB request timed out or failed.', 'upstream_unavailable', true, {
      endpoint: path,
    });
  }
};
