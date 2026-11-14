/**
 * Trakt sync worker failures: retries, Retry-After, storage limits and run-fatal errors.
 */
jest.mock(
  'firebase-functions/params',
  () => jest.requireActual('./helpers/traktHarness').paramsModule,
  { virtual: true }
);
jest.mock(
  'firebase-functions/v2/https',
  () => jest.requireActual('./helpers/traktHarness').httpsModule,
  { virtual: true }
);
jest.mock(
  'firebase-functions/v2/tasks',
  () => jest.requireActual('./helpers/traktHarness').tasksModule,
  { virtual: true }
);
jest.mock(
  'firebase-admin/firestore',
  () => jest.requireActual('./helpers/traktHarness').firestoreModule,
  { virtual: true }
);
jest.mock(
  'firebase-admin/functions',
  () => jest.requireActual('./helpers/traktHarness').functionsModule,
  { virtual: true }
);
jest.mock(
  'firebase-admin',
  () => jest.requireActual('./helpers/traktHarness').firebaseAdminModule,
  { virtual: true }
);


import { isRunFatalSyncError, TraktOAuthError, TraktSyncError } from '@/functions/src/trakt';
import { mockEnqueue, resetTraktMocks } from './helpers/traktHarness';
import {
  connectedSyncUser,
  findSyncStatusWrite,
  mockSyncFirestore,
  mockTraktFetch,
  MOVIE_ONE,
  runSyncTask,
  TRAKT_USER_SETTINGS,
  watchedMovie,
} from './helpers/traktSyncHarness';

beforeEach(resetTraktMocks);

describe('Trakt sync Firestore sanitization', () => {
  it('marks upstream blocked sync errors as retrying and rethrows for Cloud Tasks retries', async () => {
    const { batchCommit, batchSet } = mockSyncFirestore({ user: connectedSyncUser() });

    (global.fetch as jest.Mock).mockResolvedValue({
      headers: {
        get: (name: string) => {
          const header = name.toLowerCase();
          if (header === 'cf-ray') return 'ray-1';
          if (header === 'content-type') return 'text/html';
          return null;
        },
      },
      ok: false,
      status: 403,
      text: jest.fn().mockResolvedValue('<html>cloudflare blocked cf-ray</html>'),
    });

    await expect(runSyncTask('upstream-blocked')).rejects.toMatchObject({
      category: 'upstream_blocked',
      retryable: true,
    });

    expect(batchCommit).toHaveBeenCalledTimes(2);

    const retryingWrite = findSyncStatusWrite(batchSet, 'retrying');

    expect(retryingWrite).toMatchObject({
      errorCategory: 'upstream_blocked',
      status: 'retrying',
    });
    expect(retryingWrite?.nextAllowedSyncAt).toBeUndefined();
  });

  it('schedules a delayed sync retry when Trakt returns Retry-After', async () => {
    const { batchCommit, batchSet } = mockSyncFirestore({ user: connectedSyncUser() });

    (global.fetch as jest.Mock).mockResolvedValue({
      headers: {
        get: (name: string) => (name.toLowerCase() === 'retry-after' ? '60' : null),
      },
      ok: false,
      status: 429,
      text: jest.fn().mockResolvedValue('rate limited'),
    });

    await expect(runSyncTask('rate-limited')).resolves.toBeUndefined();

    expect(batchCommit).toHaveBeenCalledTimes(2);
    expect(mockEnqueue).toHaveBeenCalledWith(
      { runId: 'run-1', userId: 'user-1' },
      expect.objectContaining({
        dispatchDeadlineSeconds: 1800,
        scheduleDelaySeconds: 60,
      })
    );
    expect(mockEnqueue.mock.calls[0][1]).not.toHaveProperty('id');

    const retryingWrite = findSyncStatusWrite(batchSet, 'retrying');

    expect(retryingWrite).toMatchObject({
      errorCategory: 'rate_limited',
      status: 'retrying',
    });
    expect(retryingWrite?.nextAllowedSyncAt).toBeUndefined();
    expect(retryingWrite?.nextRetryAt).toBeDefined();
  });

  it('marks sync failures caused by Firestore index-entry limits as storage_limit without retrying', async () => {
    const indexLimitError = new Error(
      '3 INVALID_ARGUMENT: too many index entries for entity /users/user-1/lists/already-watched'
    );
    const { batchCommit, batchSet } = mockSyncFirestore({
      episodeTracking: {},
      listSet: jest.fn((data: Record<string, unknown>) => {
        if (data.id === 'already-watched') {
          return Promise.reject(indexLimitError);
        }

        return Promise.resolve(undefined);
      }),
      lists: {},
      ratings: {},
      user: connectedSyncUser(),
    });
    // Later sync steps still run after the failed list write; give them empty Trakt data.
    mockTraktFetch(
      {
        '/users/settings': TRAKT_USER_SETTINGS,
        '/sync/last_activities': {},
        '/sync/watched/movies': [watchedMovie(MOVIE_ONE, '2024-01-01T00:00:00.000Z')],
      },
      { fallback: [] }
    );

    await expect(runSyncTask('index-limit')).resolves.toBeUndefined();

    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(batchCommit).toHaveBeenCalledTimes(2);

    const failedWrite = findSyncStatusWrite(batchSet, 'failed');

    expect(failedWrite).toMatchObject({
      errorCategory: 'storage_limit',
      errorMessage: 'Your Trakt history is too large to import right now. Please try again later.',
      status: 'failed',
    });
    expect((failedWrite?.diagnostics as Record<string, unknown> | undefined)?.snippet).toBe(
      indexLimitError.message
    );
    expect(failedWrite?.nextRetryAt).toBeUndefined();
    expect(failedWrite?.nextAllowedSyncAt).toBeUndefined();
  });

  it('keeps syncing the other steps when one list write fails, then fails the run as storage_limit', async () => {
    const sizeLimitError = new Error(
      "3 INVALID_ARGUMENT: Document 'projects/p/databases/(default)/documents/users/user-1/lists/already-watched' cannot be written because its size (1,100,000 bytes) exceeds the maximum allowed size of 1,048,576 bytes."
    );
    const writtenListIds: string[] = [];
    const { batchSet } = mockSyncFirestore({
      episodeTracking: {},
      listSet: jest.fn((data: Record<string, unknown>) => {
        if (data.id === 'already-watched') {
          return Promise.reject(sizeLimitError);
        }
        writtenListIds.push(String(data.id));
        return Promise.resolve(undefined);
      }),
      lists: {},
      ratings: {},
      user: connectedSyncUser(),
    });
    mockTraktFetch(
      {
        '/users/settings': { user: { ids: { slug: 'tester' }, username: 'tester' } },
        '/sync/watched/movies': [
          {
            last_watched_at: '2024-01-01T00:00:00.000Z',
            movie: MOVIE_ONE,
            plays: 1,
          },
        ],
        '/sync/watchlist': [
          {
            listed_at: '2024-02-01T00:00:00.000Z',
            movie: { ids: { slug: 'movie-2', tmdb: 102, trakt: 202 }, title: 'Movie Two', year: 2023 },
            type: 'movie',
          },
        ],
        '/sync/last_activities': {},
      },
      { fallback: [] }
    );

    await expect(runSyncTask('size-limit')).resolves.toBeUndefined();

    // The steps after the failed Already Watched write still ran and wrote.
    const fetchedPaths = (global.fetch as jest.Mock).mock.calls.map(
      ([url]) => new URL(String(url)).pathname
    );
    expect(fetchedPaths).toEqual(
      expect.arrayContaining(['/sync/ratings', '/sync/watchlist', '/sync/favorites'])
    );
    expect(writtenListIds).toContain('watchlist');

    const failedWrite = findSyncStatusWrite(batchSet, 'failed');

    expect(failedWrite).toMatchObject({ errorCategory: 'storage_limit', status: 'failed' });
    expect(mockEnqueue).not.toHaveBeenCalled();
    // A failed run must not advance the incremental state, or the next sync would skip the step.
    expect(batchSet.mock.calls.every(([_ref, data]) => !('traktIncrementalState' in data))).toBe(true);
  });

  it('only treats Trakt-side errors as fatal to the whole sync run', () => {
    expect(isRunFatalSyncError(new TraktSyncError('slow down', 'rate_limited', true))).toBe(true);
    expect(isRunFatalSyncError(new TraktSyncError('reconnect', 'auth_invalid', false))).toBe(true);
    expect(
      isRunFatalSyncError(new TraktOAuthError('invalid grant', 'invalid_grant'))
    ).toBe(true);
    expect(isRunFatalSyncError(new TraktSyncError('write failed', 'internal', false))).toBe(false);
    expect(isRunFatalSyncError(new TraktSyncError('too big', 'storage_limit', false))).toBe(false);
    // TMDB couldn't check a list's episodes: only that list waits.
    expect(
      isRunFatalSyncError(new TraktSyncError('no TMDB', 'tmdb_unavailable', true))
    ).toBe(false);
    expect(isRunFatalSyncError(new Error('Firestore write failed'))).toBe(false);
  });
});
