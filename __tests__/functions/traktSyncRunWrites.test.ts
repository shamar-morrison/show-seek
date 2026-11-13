/**
 * Trakt sync worker writes: Firestore payload sanitization, outbound request headers,
 * custom list writes and write batching.
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

import { __test__, reconcileRatings, runTraktSync } from '@/functions/src/trakt';
import {
  assertNoUndefined,
  emptyItemsSynced,
  firestoreFn,
  MockTimestamp,
  resetTraktMocks,
} from './helpers/traktHarness';

beforeEach(resetTraktMocks);

describe('Trakt sync Firestore sanitization', () => {
  it('sanitizes failed worker status writes when optional diagnostics are absent', async () => {
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
          traktConnected: false,
          traktSyncStatus: {
            runId: 'run-1',
          },
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

    await expect(
      (runTraktSync as any)({
        data: { runId: 'run-1', userId: 'user-1' },
        retryCount: 0,
        retryReason: undefined,
      })
    ).resolves.toBeUndefined();

    expect(batchSet).toHaveBeenCalledTimes(2);
    expect(batchCommit).toHaveBeenCalledTimes(1);
  });

  it('sends the shared User-Agent on authenticated sync API requests', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const listSet = jest.fn().mockResolvedValue(undefined);
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

        if (name === 'traktEnrichmentRuns') {
          return {
            doc: jest.fn((id = 'enrich-1') => ({
              id,
              path: `users/user-1/traktEnrichmentRuns/${id}`,
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
      runTransaction: jest.fn().mockResolvedValue({
        kind: 'active',
        status: {
          runId: 'enrich-1',
          status: 'in_progress',
        },
        userData: {
          traktEnrichmentStatus: {
            runId: 'enrich-1',
            status: 'in_progress',
          },
        },
      }),
    }));

    (global.fetch as jest.Mock).mockImplementation((input: any) => {
      const url = String(input);

      if (url.includes('/users/settings')) {
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

      if (url.includes('/sync/watchlist')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              id: 1,
              listed_at: '2024-01-02T00:00:00.000Z',
              movie: {
                ids: {
                  slug: 'movie-2',
                  tmdb: 102,
                  trakt: 202,
                },
                title: 'Movie Two',
                year: 2024,
              },
              type: 'movie',
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      if (url.includes('/sync/favorites')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              id: 2,
              listed_at: '2024-01-03T00:00:00.000Z',
              movie: {
                ids: {
                  slug: 'movie-3',
                  tmdb: 103,
                  trakt: 203,
                },
                title: 'Movie Three',
                year: 2024,
              },
              type: 'movie',
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      if (
        url.includes('/sync/watched/shows') ||
        url.includes('/sync/ratings') ||
        url.includes('/users/tester/lists')
      ) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([]),
          ok: true,
          status: 200,
        });
      }

      throw new Error(`Unexpected fetch URL ${url}`);
    });

    await (runTraktSync as any)({
      data: { runId: 'run-1', userId: 'user-1' },
      retryCount: 0,
      retryReason: undefined,
    });

    expect((global.fetch as jest.Mock).mock.calls).not.toHaveLength(0);

    const [, firstRequestInit] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      { headers: Record<string, string> }
    ];

    expect(firstRequestInit.headers).toEqual(
      expect.objectContaining({
        Accept: 'application/json',
        Authorization: 'Bearer token',
        'User-Agent': 'ShowSeek-TraktFunctions/1.0',
        'trakt-api-key': 'test-secret',
        'trakt-api-version': '2',
      })
    );
    expect(firstRequestInit.headers['Content-Type']).toBeUndefined();
  });

  it('preserves completed timestamps while omitting empty diagnostics objects', () => {
    const completedAt = MockTimestamp.now();
    const startedAt = MockTimestamp.fromMillis(completedAt.toMillis() - 60_000);

    const sanitized = __test__.sanitizeSyncStatusForWrite({
      attempt: 1,
      completedAt: completedAt as any,
      diagnostics: {
        cfRay: undefined,
        endpoint: undefined,
        retryAfterSeconds: undefined,
        retryReason: undefined,
        snippet: undefined,
        statusCode: undefined,
      },
      itemsSynced: emptyItemsSynced(),
      lastSyncedAt: completedAt as any,
      maxAttempts: 5,
      runId: 'run-1',
      startedAt: startedAt as any,
      status: 'completed',
      updatedAt: completedAt as any,
      userId: 'user-1',
    }) as Record<string, unknown>;

    expect(sanitized.completedAt).toBe(completedAt);
    expect(sanitized.lastSyncedAt).toBe(completedAt);
    expect(sanitized.startedAt).toBe(startedAt);
    expect(sanitized).not.toHaveProperty('diagnostics');
  });

  it('writes Firestore timestamps for synced custom lists', async () => {
    const listSet = jest.fn().mockResolvedValue(undefined);
    const usersCollection = {
      doc: jest.fn(() => ({
        collection: jest.fn((name: string) => {
          if (name !== 'lists') {
            throw new Error(`Unexpected subcollection ${name}`);
          }

          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue({
                data: () => undefined,
                exists: false,
              }),
              set: listSet,
            })),
            get: jest.fn().mockResolvedValue({ docs: [] }),
          };
        }),
      })),
    };

    firestoreFn.mockImplementation(() => ({
      collection: jest.fn((name: string) => {
        if (name !== 'users') {
          throw new Error(`Unexpected collection ${name}`);
        }

        return usersCollection;
      }),
    }));

    (global.fetch as jest.Mock).mockResolvedValue({
      headers: {
        get: () => null,
      },
      json: jest.fn().mockResolvedValue([
        {
          id: 1,
          listed_at: '2024-01-03T00:00:00.000Z',
          movie: {
            ids: {
              slug: 'movie-slug',
              tmdb: 101,
              trakt: 202,
            },
            title: 'Example Movie',
            year: 2024,
          },
          rank: 1,
          type: 'movie',
        },
      ]),
      ok: true,
      status: 200,
      text: jest.fn(),
    });

    await (__test__ as any).reconcileCustomLists(
      'user-1',
      'access-token',
      'showseek-user',
      [
        {
          created_at: '2024-01-01T00:00:00.000Z',
          description: 'Custom list',
          ids: {
            slug: 'favorites',
            trakt: 55,
          },
          name: 'Favorites',
          privacy: 'public',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
      ],
      {},
      true
    );

    const payload = listSet.mock.calls[0][0];
    expect(payload.createdAt.toMillis()).toBe(new Date('2024-01-01T00:00:00.000Z').getTime());
    expect(payload.updatedAt.toMillis()).toBe(new Date('2024-01-02T00:00:00.000Z').getTime());
    expect(payload.metadata.lastUpdated).toBeInstanceOf(MockTimestamp);
  });

  it('leaves a custom list TMDB could not check untouched and syncs the others', async () => {
    const listSet = jest.fn().mockResolvedValue(undefined);
    const existingListRef = { delete: jest.fn(), path: 'users/user-1/lists/trakt_1' };
    const usersCollection = {
      doc: jest.fn(() => ({
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({ data: () => undefined, exists: false }),
            set: listSet,
          })),
          get: jest.fn().mockResolvedValue({ docs: [{ id: 'trakt_1', ref: existingListRef }] }),
        })),
      })),
    };
    firestoreFn.mockImplementation(() => ({ collection: jest.fn(() => usersCollection) }));
    const traktResponse = (body: unknown) => ({
      headers: { get: () => null },
      json: jest.fn().mockResolvedValue(body),
      ok: true,
      status: 200,
      text: jest.fn(),
    });
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('themoviedb.org')) {
        return { headers: { get: () => null }, json: jest.fn(), ok: false, status: 503 };
      }
      if (url.includes('/lists/with-episodes/items')) {
        return traktResponse([
          {
            episode: { ids: { slug: 'e', tmdb: 62103, trakt: 5 }, number: 12, season: 2, title: 'Phoenix' },
            id: 9,
            listed_at: '2025-12-22T16:34:01.000Z',
            rank: 1,
            show: { ids: { slug: 'bb', tmdb: 1396, trakt: 1 }, title: 'Breaking Bad', year: 2008 },
            type: 'episode',
          },
        ]);
      }
      return traktResponse([
        {
          id: 1,
          listed_at: '2024-01-03T00:00:00.000Z',
          movie: { ids: { slug: 'm', tmdb: 101, trakt: 202 }, title: 'Example Movie', year: 2024 },
          rank: 1,
          type: 'movie',
        },
      ]);
    });
    const list = (trakt: number, slug: string) => ({
      created_at: '2024-01-01T00:00:00.000Z',
      description: '',
      ids: { slug, trakt },
      name: slug,
      privacy: 'private',
      updated_at: '2026-01-02T00:00:00.000Z',
    });
    const previousState = { slug: 'with-episodes', updatedAt: '2025-01-01T00:00:00.000Z' };
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await (__test__ as any).reconcileCustomLists(
      'user-1',
      'access-token',
      'showseek-user',
      [list(1, 'with-episodes'), list(2, 'movies-only')],
      { '1': previousState },
      false
    );

    expect(result.lookupFailure).toMatchObject({ category: 'tmdb_unavailable' });
    // Only the movies-only list was written; the other kept its saved state, so it is re-read.
    expect(listSet).toHaveBeenCalledTimes(1);
    expect(listSet.mock.calls[0][0]).toMatchObject({ name: 'movies-only' });
    expect(result.customLists['1']).toEqual(previousState);
    expect(existingListRef.delete).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('warns when episode watchedAt strings are invalid before falling back to now', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    (global.fetch as jest.Mock).mockResolvedValue({
      headers: {
        get: () => null,
      },
      json: jest.fn().mockResolvedValue({
        episodes: [
          {
            air_date: '2020-01-01',
            episode_number: 1,
            id: 77,
            name: 'Pilot',
          },
        ],
      }),
      ok: true,
      status: 200,
    });

    const enrichedEpisodes = await (__test__ as any).enrichEpisodeTracking(99, {
      '1_1': {
        watchedAt: 'not-a-date',
      },
    });

    expect(warnSpy).toHaveBeenCalledWith(
      '[TraktEnrichment] Invalid watchedAt string, defaulting to now.',
      expect.objectContaining({
        episodeKey: '1_1',
        showId: 99,
        watchedAt: 'not-a-date',
      })
    );
    expect(enrichedEpisodes['1_1'].watchedAt.toMillis()).toBe(1_700_000_000_000);

    warnSpy.mockRestore();
    nowSpy.mockRestore();
  });

  it('omits undefined release_date from already-watched items when Trakt movies are missing year', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const listSet = jest.fn((_data: Record<string, unknown>) => Promise.resolve(undefined));
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

        if (name === 'traktEnrichmentRuns') {
          return {
            doc: jest.fn((id = 'enrich-1') => ({
              id,
              path: `users/user-1/traktEnrichmentRuns/${id}`,
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
      runTransaction: jest.fn().mockResolvedValue({
        kind: 'active',
        status: {
          runId: 'enrich-1',
          status: 'in_progress',
        },
        userData: {
          traktEnrichmentStatus: {
            runId: 'enrich-1',
            status: 'in_progress',
          },
        },
      }),
    }));

    (global.fetch as jest.Mock).mockImplementation((input: any) => {
      const url = String(input);

      if (url.includes('/users/settings')) {
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

      if (url.includes('/sync/watched/movies')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              last_updated_at: '2024-01-01T00:00:00.000Z',
              last_watched_at: '2024-01-01T00:00:00.000Z',
              movie: {
                ids: {
                  slug: 'movie-1',
                  tmdb: 576788,
                  trakt: 201,
                },
                title: 'Movie Without Year',
                year: 0,
              },
              plays: 1,
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      if (
        url.includes('/sync/last_activities') ||
        url.includes('/sync/watched/shows') ||
        url.includes('/sync/ratings') ||
        url.includes('/sync/watchlist') ||
        url.includes('/sync/favorites') ||
        url.includes('/users/tester/lists')
      ) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([]),
          ok: true,
          status: 200,
        });
      }

      throw new Error(`Unexpected fetch URL ${url}`);
    });

    await expect(
      (runTraktSync as any)({
        data: { runId: 'run-1', userId: 'user-1' },
        retryCount: 0,
        retryReason: undefined,
      })
    ).resolves.toBeUndefined();

    const alreadyWatchedWrite = listSet.mock.calls.find(
      ([data]) => data && typeof data === 'object' && data.id === 'already-watched'
    )?.[0] as Record<string, unknown> | undefined;

    expect(alreadyWatchedWrite).toBeDefined();
    const movieEntry = (alreadyWatchedWrite?.items as Record<string, Record<string, unknown>>)?.[
      'movie-576788'
    ];
    expect(movieEntry).toEqual(
      expect.objectContaining({
        id: 576788,
        media_type: 'movie',
        title: 'Movie Without Year',
      })
    );
    expect(movieEntry).not.toHaveProperty('release_date');
  });

  it('omits undefined traktId from custom list items before writing Firestore docs', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const listSet = jest.fn((_data: Record<string, unknown>) => Promise.resolve(undefined));
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

        if (name === 'traktEnrichmentRuns') {
          return {
            doc: jest.fn((id = 'enrich-1') => ({
              id,
              path: `users/user-1/traktEnrichmentRuns/${id}`,
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
      runTransaction: jest.fn().mockResolvedValue({
        kind: 'active',
        status: {
          runId: 'enrich-1',
          status: 'in_progress',
        },
        userData: {
          traktEnrichmentStatus: {
            runId: 'enrich-1',
            status: 'in_progress',
          },
        },
      }),
    }));

    (global.fetch as jest.Mock).mockImplementation((input: any) => {
      const url = String(input);

      if (url.includes('/users/settings')) {
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

      if (
        url.includes('/sync/last_activities') ||
        url.includes('/sync/watched/movies') ||
        url.includes('/sync/watched/shows') ||
        url.includes('/sync/ratings') ||
        url.includes('/sync/watchlist') ||
        url.includes('/sync/favorites')
      ) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([]),
          ok: true,
          status: 200,
        });
      }

      if (url.includes('/users/tester/lists') && !url.includes('/items')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              created_at: '2024-01-01T00:00:00.000Z',
              description: '',
              ids: {
                slug: 'custom-list',
                trakt: 701,
              },
              name: 'Custom List',
              privacy: 'private',
              updated_at: '2024-01-02T00:00:00.000Z',
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      if (url.includes('/users/tester/lists/custom-list/items')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              id: 9001,
              listed_at: '2024-01-03T00:00:00.000Z',
              movie: {
                ids: {
                  slug: 'movie-no-trakt-id',
                  tmdb: 333,
                },
                title: 'Movie Without Trakt Id',
                year: 2024,
              },
              rank: 1,
              type: 'movie',
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      throw new Error(`Unexpected fetch URL ${url}`);
    });

    await expect(
      (runTraktSync as any)({
        data: { runId: 'run-1', userId: 'user-1' },
        retryCount: 0,
        retryReason: undefined,
      })
    ).resolves.toBeUndefined();

    const customListWrite = listSet.mock.calls.find(
      ([data]) => data && typeof data === 'object' && data.name === 'Custom List'
    )?.[0] as Record<string, unknown> | undefined;

    expect(customListWrite).toBeDefined();
    const customItem = (customListWrite?.items as Record<string, Record<string, unknown>>)?.[
      'movie-333'
    ];
    expect(customItem).toEqual(
      expect.objectContaining({
        id: 333,
        media_type: 'movie',
        title: 'Movie Without Trakt Id',
      })
    );
    expect(customItem).not.toHaveProperty('traktId');
  });
});

describe('Trakt sync batching', () => {
  it('splits large rating syncs into batches under the 500-write limit', async () => {
    const commits: number[] = [];
    firestoreFn.mockImplementation(() => ({
      batch: jest.fn(() => {
        let writes = 0;
        return {
          set: jest.fn(() => {
            writes += 1;
          }),
          commit: jest.fn(async () => {
            commits.push(writes);
          }),
        };
      }),
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          collection: jest.fn(() => ({
            doc: jest.fn((id: string) => ({ id })),
            get: jest.fn().mockResolvedValue({ docs: [] }),
          })),
        })),
      })),
    }));
    const ratings = Array.from({ length: 950 }, (_, i) => ({
      movie: { ids: { tmdb: i + 1, trakt: i + 1 }, title: `Movie ${i}`, year: 2000 },
      rated_at: '2024-01-01T00:00:00.000Z',
      rating: 7,
      type: 'movie',
    }));

    const result = await reconcileRatings('user-1', ratings as any);

    expect(result.changedCount).toBe(950);
    expect(commits.every((size) => size <= 400)).toBe(true);
    expect(commits.reduce((total, size) => total + size, 0)).toBe(950);
  });
});
