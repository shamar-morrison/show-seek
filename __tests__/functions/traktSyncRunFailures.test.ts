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

import {
  isRunFatalSyncError,
  runTraktSync,
  TraktOAuthError,
  TraktSyncError,
} from '@/functions/src/trakt';
import {
  assertNoUndefined,
  firestoreFn,
  mockEnqueue,
  MockTimestamp,
  resetTraktMocks,
} from './helpers/traktHarness';

beforeEach(resetTraktMocks);

describe('Trakt sync Firestore sanitization', () => {
  it('marks upstream blocked sync errors as retrying and rethrows for Cloud Tasks retries', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name !== 'traktSyncRuns') {
          throw new Error(`Unexpected subcollection ${name}`);
        }

        return {
          doc: jest.fn((id: string) => ({
            id,
            path: `users/user-1/traktSyncRuns/${id}`,
          })),
        };
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktAccessToken: 'token',
          traktConnected: true,
          traktSyncStatus: {
            runId: 'run-1',
          },
          traktTokenExpiresAt: MockTimestamp.fromMillis(Date.now() + 2 * 60 * 60 * 1000),
        }),
        exists: true,
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      batch: jest.fn(() => ({
        commit: batchCommit,
        set: batchSet,
      })),
      collection: jest.fn((name: string) => {
        if (name !== 'users') {
          throw new Error(`Unexpected collection ${name}`);
        }

        return {
          doc: jest.fn(() => userRef),
        };
      }),
    }));

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

    await expect(
      (runTraktSync as any)({
        data: { runId: 'run-1', userId: 'user-1' },
        retryCount: 0,
        retryReason: 'upstream-blocked',
      })
    ).rejects.toMatchObject({
      category: 'upstream_blocked',
      retryable: true,
    });

    expect(batchCommit).toHaveBeenCalledTimes(2);

    const retryingWrite = batchSet.mock.calls
      .map(([_ref, data]) => ('traktSyncStatus' in data ? data.traktSyncStatus : data))
      .find((data) => data?.status === 'retrying') as Record<string, unknown> | undefined;

    expect(retryingWrite).toMatchObject({
      errorCategory: 'upstream_blocked',
      status: 'retrying',
    });
    expect(retryingWrite?.nextAllowedSyncAt).toBeUndefined();
  });

  it('schedules a delayed sync retry when Trakt returns Retry-After', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name !== 'traktSyncRuns') {
          throw new Error(`Unexpected subcollection ${name}`);
        }

        return {
          doc: jest.fn((id: string) => ({
            id,
            path: `users/user-1/traktSyncRuns/${id}`,
          })),
        };
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktAccessToken: 'token',
          traktConnected: true,
          traktSyncStatus: {
            runId: 'run-1',
          },
          traktTokenExpiresAt: MockTimestamp.fromMillis(Date.now() + 2 * 60 * 60 * 1000),
        }),
        exists: true,
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      batch: jest.fn(() => ({
        commit: batchCommit,
        set: batchSet,
      })),
      collection: jest.fn((name: string) => {
        if (name !== 'users') {
          throw new Error(`Unexpected collection ${name}`);
        }

        return {
          doc: jest.fn(() => userRef),
        };
      }),
    }));

    (global.fetch as jest.Mock).mockResolvedValue({
      headers: {
        get: (name: string) => (name.toLowerCase() === 'retry-after' ? '60' : null),
      },
      ok: false,
      status: 429,
      text: jest.fn().mockResolvedValue('rate limited'),
    });

    await expect(
      (runTraktSync as any)({
        data: { runId: 'run-1', userId: 'user-1' },
        retryCount: 0,
        retryReason: 'rate-limited',
      })
    ).resolves.toBeUndefined();

    expect(batchCommit).toHaveBeenCalledTimes(2);
    expect(mockEnqueue).toHaveBeenCalledWith(
      { runId: 'run-1', userId: 'user-1' },
      expect.objectContaining({
        dispatchDeadlineSeconds: 1800,
        scheduleDelaySeconds: 60,
      })
    );
    expect(mockEnqueue.mock.calls[0][1]).not.toHaveProperty('id');

    const retryingWrite = batchSet.mock.calls
      .map(([_ref, data]) => ('traktSyncStatus' in data ? data.traktSyncStatus : data))
      .find((data) => data?.status === 'retrying') as Record<string, unknown> | undefined;

    expect(retryingWrite).toMatchObject({
      errorCategory: 'rate_limited',
      status: 'retrying',
    });
    expect(retryingWrite?.nextAllowedSyncAt).toBeUndefined();
    expect(retryingWrite?.nextRetryAt).toBeDefined();
  });

  it('marks sync failures caused by Firestore index-entry limits as storage_limit without retrying', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const indexLimitError = new Error(
      '3 INVALID_ARGUMENT: too many index entries for entity /users/user-1/lists/already-watched'
    );
    const listSet = jest.fn((data: Record<string, unknown>) => {
      if (data.id === 'already-watched') {
        return Promise.reject(indexLimitError);
      }

      return Promise.resolve(undefined);
    });
    const listsCollection = {
      doc: jest.fn((id: string) => ({
        id,
        path: `users/user-1/lists/${id}`,
        get: jest.fn().mockResolvedValue({
          data: () => undefined,
          exists: false,
        }),
        set: listSet,
      })),
      get: jest.fn().mockResolvedValue({ docs: [] }),
    };
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name === 'traktSyncRuns') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/traktSyncRuns/${id}`,
            })),
          };
        }

        if (name === 'lists') {
          return listsCollection;
        }

        if (name === 'episode_tracking') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/episode_tracking/${id}`,
            })),
            get: jest.fn().mockResolvedValue({ docs: [] }),
          };
        }

        if (name === 'ratings') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/ratings/${id}`,
            })),
            get: jest.fn().mockResolvedValue({ docs: [] }),
          };
        }

        throw new Error(`Unexpected subcollection ${name}`);
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktAccessToken: 'token',
          traktConnected: true,
          traktSyncStatus: {
            runId: 'run-1',
          },
          traktTokenExpiresAt: MockTimestamp.fromMillis(Date.now() + 2 * 60 * 60 * 1000),
        }),
        exists: true,
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      batch: jest.fn(() => ({
        commit: batchCommit,
        set: batchSet,
      })),
      collection: jest.fn((name: string) => {
        if (name !== 'users') {
          throw new Error(`Unexpected collection ${name}`);
        }

        return {
          doc: jest.fn(() => userRef),
        };
      }),
    }));

    (global.fetch as jest.Mock).mockImplementation((input: any) => {
      const url = String(input);

      if (url.endsWith('/users/settings')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue({
            user: {
              ids: {
                slug: 'tester',
              },
              name: 'Tester',
              private: false,
              username: 'tester',
              vip: false,
              vip_ep: false,
            },
          }),
          ok: true,
          status: 200,
        });
      }

      if (url.includes('/sync/last_activities')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue({}),
          ok: true,
          status: 200,
        });
      }

      if (url.includes('/sync/watched/movies')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              last_updated_at: '2024-01-01T00:00:00.000Z',
              last_watched_at: '2024-01-01T00:00:00.000Z',
              movie: {
                ids: {
                  slug: 'movie-1',
                  tmdb: 101,
                  trakt: 201,
                },
                title: 'Movie One',
                year: 2024,
              },
              plays: 1,
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      if (url.includes('/sync/watched/shows')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([]),
          ok: true,
          status: 200,
        });
      }

      // Later sync steps still run after the failed list write; give them empty Trakt data.
      return Promise.resolve({
        json: jest.fn().mockResolvedValue([]),
        ok: true,
        status: 200,
      });
    });

    await expect(
      (runTraktSync as any)({
        data: { runId: 'run-1', userId: 'user-1' },
        retryCount: 0,
        retryReason: 'index-limit',
      })
    ).resolves.toBeUndefined();

    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(batchCommit).toHaveBeenCalledTimes(2);

    const failedWrite = batchSet.mock.calls
      .map(([_ref, data]) => ('traktSyncStatus' in data ? data.traktSyncStatus : data))
      .find((data) => data?.status === 'failed') as Record<string, unknown> | undefined;

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
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const sizeLimitError = new Error(
      "3 INVALID_ARGUMENT: Document 'projects/p/databases/(default)/documents/users/user-1/lists/already-watched' cannot be written because its size (1,100,000 bytes) exceeds the maximum allowed size of 1,048,576 bytes."
    );
    const writtenListIds: string[] = [];
    const listSet = jest.fn((data: Record<string, unknown>) => {
      if (data.id === 'already-watched') {
        return Promise.reject(sizeLimitError);
      }
      writtenListIds.push(String(data.id));
      return Promise.resolve(undefined);
    });
    const emptyCollection = (name: string) => ({
      doc: jest.fn((id: string) => ({
        id,
        path: `users/user-1/${name}/${id}`,
        get: jest.fn().mockResolvedValue({ data: () => undefined, exists: false }),
        set: listSet,
      })),
      get: jest.fn().mockResolvedValue({ docs: [] }),
    });
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name === 'traktSyncRuns') {
          return { doc: jest.fn((id: string) => ({ id, path: `users/user-1/traktSyncRuns/${id}` })) };
        }
        if (['lists', 'episode_tracking', 'ratings'].includes(name)) {
          return emptyCollection(name);
        }
        throw new Error(`Unexpected subcollection ${name}`);
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktAccessToken: 'token',
          traktConnected: true,
          traktSyncStatus: { runId: 'run-1' },
          traktTokenExpiresAt: MockTimestamp.fromMillis(Date.now() + 2 * 60 * 60 * 1000),
        }),
        exists: true,
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      batch: jest.fn(() => ({ commit: batchCommit, set: batchSet })),
      collection: jest.fn((name: string) => {
        if (name !== 'users') {
          throw new Error(`Unexpected collection ${name}`);
        }
        return { doc: jest.fn(() => userRef) };
      }),
    }));

    const fetchedPaths: string[] = [];
    (global.fetch as jest.Mock).mockImplementation((input: any) => {
      const url = String(input);
      fetchedPaths.push(new URL(url).pathname);
      const json = (body: unknown) =>
        Promise.resolve({ json: jest.fn().mockResolvedValue(body), ok: true, status: 200 });

      if (url.endsWith('/users/settings')) {
        return json({ user: { ids: { slug: 'tester' }, username: 'tester' } });
      }
      if (url.includes('/sync/watched/movies')) {
        return json([
          {
            last_watched_at: '2024-01-01T00:00:00.000Z',
            movie: { ids: { slug: 'movie-1', tmdb: 101, trakt: 201 }, title: 'Movie One', year: 2024 },
            plays: 1,
          },
        ]);
      }
      if (url.includes('/sync/watchlist')) {
        return json([
          {
            listed_at: '2024-02-01T00:00:00.000Z',
            movie: { ids: { slug: 'movie-2', tmdb: 102, trakt: 202 }, title: 'Movie Two', year: 2023 },
            type: 'movie',
          },
        ]);
      }
      if (url.includes('/sync/last_activities')) {
        return json({});
      }
      return json([]);
    });

    await expect(
      (runTraktSync as any)({
        data: { runId: 'run-1', userId: 'user-1' },
        retryCount: 0,
        retryReason: 'size-limit',
      })
    ).resolves.toBeUndefined();

    // The steps after the failed Already Watched write still ran and wrote.
    expect(fetchedPaths).toEqual(
      expect.arrayContaining(['/sync/ratings', '/sync/watchlist', '/sync/favorites'])
    );
    expect(writtenListIds).toContain('watchlist');

    const failedWrite = batchSet.mock.calls
      .map(([_ref, data]) => ('traktSyncStatus' in data ? data.traktSyncStatus : data))
      .find((data) => data?.status === 'failed') as Record<string, unknown> | undefined;

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
