/**
 * Trakt sync worker (runTraktSync): completion cooldown, bootstrap and incremental
 * summaries, and ratings reconciliation.
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

import { runTraktSync, TRAKT_LISTS_SCHEMA_VERSION } from '@/functions/src/trakt';
import {
  assertNoUndefined,
  createCollectionSnapshot,
  createDocSnapshot,
  createDocSnapshotWithSet,
  DAY_MS,
  emptyItemsSynced,
  firestoreFn,
  MockTimestamp,
  resetTraktMocks,
} from './helpers/traktHarness';

beforeEach(resetTraktMocks);

describe('Trakt sync Firestore sanitization', () => {
  it('writes a 24-hour cooldown after a successful sync completes', async () => {
    const frozenNow = Date.UTC(2026, 2, 25, 12, 0, 0);
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(frozenNow);
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
          traktTokenExpiresAt: MockTimestamp.fromMillis(frozenNow + 2 * 60 * 60 * 1000),
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

    try {
      await expect(
        (runTraktSync as any)({
          data: { runId: 'run-1', userId: 'user-1' },
          retryCount: 0,
          retryReason: undefined,
        })
      ).resolves.toBeUndefined();
    } finally {
      dateNowSpy.mockRestore();
    }

    const completedWrite = batchSet.mock.calls
      .map(([_ref, data]) => ('traktSyncStatus' in data ? data.traktSyncStatus : data))
      .find((data) => data?.status === 'completed') as
      | { completedAt: MockTimestamp; nextAllowedSyncAt: MockTimestamp }
      | undefined;

    expect(completedWrite).toBeDefined();
    expect(completedWrite?.completedAt.toMillis()).toBe(frozenNow);
    expect(completedWrite?.nextAllowedSyncAt.toMillis()).toBe(frozenNow + DAY_MS);
  });

  it('reports bootstrap summary mode with imported totals even when local data is already up to date', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchDelete = jest.fn();
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const listSet = jest.fn().mockResolvedValue(undefined);
    const alreadyWatchedData = {
      id: 'already-watched',
      items: {
        'movie-101': {
          addedAt: MockTimestamp.fromMillis(new Date('2024-01-02T00:00:00.000Z').getTime()),
          id: 101,
          media_type: 'movie',
          release_date: '2024-01-01',
          title: 'Movie One',
        },
        'movie-999': {
          addedAt: MockTimestamp.fromMillis(new Date('2024-03-01T00:00:00.000Z').getTime()),
          id: 999,
          media_type: 'movie',
          release_date: '2023-01-01',
          title: 'Local Movie Only',
        },
        'tv-201': {
          addedAt: MockTimestamp.fromMillis(new Date('2024-02-03T00:00:00.000Z').getTime()),
          first_air_date: '2020-01-01',
          id: 201,
          media_type: 'tv',
          name: 'Show One',
        },
      },
      metadata: {
        itemCount: 3,
        lastUpdated: MockTimestamp.now(),
        needsEnrichment: false,
      },
      name: 'Already Watched',
    };
    const watchlistData = {
      id: 'watchlist',
      items: {
        'movie-102': {
          addedAt: MockTimestamp.fromMillis(new Date('2024-01-03T00:00:00.000Z').getTime()),
          id: 102,
          media_type: 'movie',
          release_date: '2024-01-01',
          title: 'Movie Two',
        },
        'tv-909': {
          addedAt: MockTimestamp.fromMillis(new Date('2024-03-02T00:00:00.000Z').getTime()),
          first_air_date: '2021-01-01',
          id: 909,
          media_type: 'tv',
          name: 'Local Watchlist Show',
        },
      },
      metadata: {
        itemCount: 2,
        lastUpdated: MockTimestamp.now(),
        needsEnrichment: false,
      },
      name: 'Should Watch',
    };
    const favoritesData = {
      id: 'favorites',
      items: {
        'tv-202': {
          addedAt: MockTimestamp.fromMillis(new Date('2024-01-05T00:00:00.000Z').getTime()),
          id: 202,
          media_type: 'tv',
          title: 'Favorite Show',
        },
        'movie-303': {
          addedAt: MockTimestamp.fromMillis(new Date('2024-03-03T00:00:00.000Z').getTime()),
          id: 303,
          media_type: 'movie',
          title: 'Local Favorite Movie',
        },
      },
      metadata: {
        itemCount: 2,
        lastUpdated: MockTimestamp.now(),
        needsEnrichment: false,
      },
      name: 'Favorites',
    };
    const customListData = {
      createdAt: MockTimestamp.fromMillis(new Date('2024-01-05T00:00:00.000Z').getTime()),
      description: 'Custom list',
      isCustom: true,
      items: {
        'movie-333': {
          addedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
          id: 333,
          media_type: 'movie',
          title: 'Custom Movie',
          traktId: 303,
        },
      },
      metadata: {
        itemCount: 1,
        lastUpdated: MockTimestamp.now(),
        needsEnrichment: false,
      },
      name: 'Custom List',
      privacy: 'private',
      traktId: 701,
      updatedAt: MockTimestamp.fromMillis(new Date('2024-01-07T00:00:00.000Z').getTime()),
    };
    const listSnapshots = {
      'already-watched': createDocSnapshot('users/user-1/lists/already-watched', alreadyWatchedData),
      favorites: createDocSnapshot('users/user-1/lists/favorites', favoritesData),
      trakt_701: createDocSnapshot('users/user-1/lists/trakt_701', customListData),
      watchlist: createDocSnapshot('users/user-1/lists/watchlist', watchlistData),
    };
    const listsCollection = {
      doc: jest.fn((id: string) => ({
        get: jest.fn().mockResolvedValue({
          data: () => listSnapshots[id as keyof typeof listSnapshots]?.data(),
          exists: Boolean(listSnapshots[id as keyof typeof listSnapshots]),
        }),
        id,
        path: `users/user-1/lists/${id}`,
        set: listSet,
      })),
      get: jest.fn().mockResolvedValue(createCollectionSnapshot([listSnapshots.trakt_701])),
    };
    const episodeTrackingCollection = {
      doc: jest.fn((id: string) => ({
        id,
        path: `users/user-1/episode_tracking/${id}`,
      })),
      get: jest.fn().mockResolvedValue(
        createCollectionSnapshot([
          createDocSnapshot('users/user-1/episode_tracking/201', {
            episodes: {
              '1_1': {
                watched: true,
                watchedAt: MockTimestamp.fromMillis(new Date('2024-02-01T00:00:00.000Z').getTime()),
              },
              '1_2': {
                watched: true,
                watchedAt: MockTimestamp.fromMillis(new Date('2024-02-03T00:00:00.000Z').getTime()),
              },
              '1_3': {
                watched: true,
                watchedAt: MockTimestamp.fromMillis(new Date('2024-02-04T00:00:00.000Z').getTime()),
              },
            },
            metadata: {
              lastUpdated: MockTimestamp.now(),
              tvShowName: 'Show One',
            },
          }),
          createDocSnapshot('users/user-1/episode_tracking/999', {
            episodes: {
              '1_1': {
                watched: true,
                watchedAt: MockTimestamp.fromMillis(new Date('2024-03-04T00:00:00.000Z').getTime()),
              },
            },
            metadata: {
              lastUpdated: MockTimestamp.now(),
              tvShowName: 'Local Only Show',
            },
          }),
        ])
      ),
    };
    const ratingsCollection = {
      doc: jest.fn((id: string) => ({
        id,
        path: `users/user-1/ratings/${id}`,
      })),
      get: jest.fn().mockResolvedValue(
        createCollectionSnapshot([
          createDocSnapshot('users/user-1/ratings/movie-101', {
            id: '101',
            mediaType: 'movie',
            ratedAt: MockTimestamp.fromMillis(new Date('2024-01-09T00:00:00.000Z').getTime()),
            rating: 8,
            title: 'Movie One',
          }),
          createDocSnapshot('users/user-1/ratings/tv-909', {
            id: '909',
            mediaType: 'tv',
            ratedAt: MockTimestamp.fromMillis(new Date('2024-03-05T00:00:00.000Z').getTime()),
            rating: 9,
            title: 'Local TV Rating',
          }),
        ])
      ),
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
          return episodeTrackingCollection;
        }

        if (name === 'ratings') {
          return ratingsCollection;
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
        delete: batchDelete,
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

    (global.fetch as jest.Mock).mockImplementation((input: unknown) => {
      const url = String(input);

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
          json: jest.fn().mockResolvedValue([
            {
              last_updated_at: '2024-02-03T00:00:00.000Z',
              last_watched_at: '2024-02-03T00:00:00.000Z',
              plays: 2,
              seasons: [
                {
                  episodes: [
                    {
                      last_watched_at: '2024-02-01T00:00:00.000Z',
                      number: 1,
                      plays: 1,
                    },
                    {
                      last_watched_at: '2024-02-02T00:00:00.000Z',
                      number: 2,
                      plays: 1,
                    },
                  ],
                  number: 1,
                },
              ],
              show: {
                ids: {
                  slug: 'show-1',
                  tmdb: 201,
                  trakt: 301,
                },
                title: 'Show One',
                year: 2020,
              },
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      if (url.includes('/sync/ratings')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              movie: {
                ids: {
                  slug: 'movie-1',
                  tmdb: 101,
                  trakt: 201,
                },
                title: 'Movie One',
                year: 2024,
              },
              rated_at: '2024-01-08T00:00:00.000Z',
              rating: 8,
              type: 'movie',
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
              listed_at: '2024-01-04T00:00:00.000Z',
              show: {
                ids: {
                  slug: 'favorite-show',
                  tmdb: 202,
                  trakt: 302,
                },
                title: 'Favorite Show',
                year: 2022,
              },
              type: 'show',
            },
          ]),
          ok: true,
          status: 200,
        });
      }

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

      if (url.includes('/users/tester/lists') && !url.includes('/items')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              created_at: '2024-01-05T00:00:00.000Z',
              description: 'Custom list',
              ids: {
                slug: 'custom-list',
                trakt: 701,
              },
              name: 'Custom List',
              privacy: 'private',
              updated_at: '2024-01-07T00:00:00.000Z',
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
              id: 77,
              listed_at: '2024-01-06T00:00:00.000Z',
              movie: {
                ids: {
                  slug: 'custom-movie',
                  tmdb: 333,
                  trakt: 303,
                },
                title: 'Custom Movie',
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

    const completedWrite = batchSet.mock.calls
      .map(([_ref, data]) => ('traktSyncStatus' in data ? data.traktSyncStatus : data))
      .find((data) => data?.status === 'completed') as
      | {
          itemsSynced: ReturnType<typeof emptyItemsSynced>;
          summaryMode: string;
        }
      | undefined;

    expect(completedWrite).toMatchObject({
      itemsSynced: {
        episodes: 2,
        favorites: 1,
        lists: 1,
        movies: 1,
        ratings: 1,
        shows: 1,
        watchlistItems: 1,
      },
      summaryMode: 'bootstrap',
    });
    expect(batchDelete).not.toHaveBeenCalled();
    expect(listSet).not.toHaveBeenCalled();
  });

  it('reports zero incremental summary deltas for normalization-only managed list writes', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const listSet = jest.fn().mockResolvedValue(undefined);
    const lastActivitiesBefore = {
      episodes: {
        watched_at: '2024-01-03T00:00:00.000Z',
      },
      favorites: {
        updated_at: '2024-01-04T00:00:00.000Z',
      },
      lists: {
        updated_at: '2024-01-05T00:00:00.000Z',
      },
      movies: {
        rated_at: '2024-01-02T00:00:00.000Z',
        watched_at: '2024-01-01T00:00:00.000Z',
      },
      shows: {
        rated_at: '2024-01-02T00:00:00.000Z',
        watched_at: '2024-01-03T00:00:00.000Z',
      },
      watchlist: {
        updated_at: '2024-01-04T00:00:00.000Z',
      },
    };
    const lastActivitiesAfter = {
      ...lastActivitiesBefore,
      favorites: {
        updated_at: '2024-01-06T00:00:00.000Z',
      },
      movies: {
        ...lastActivitiesBefore.movies,
        watched_at: '2024-01-06T00:00:00.000Z',
      },
      watchlist: {
        updated_at: '2024-01-06T00:00:00.000Z',
      },
    };
    const listDataById: Record<string, Record<string, unknown>> = {
      'already-watched': {
        id: 'already-watched',
        items: {
          '101': {
            addedAt: MockTimestamp.fromMillis(new Date('2024-01-01T00:00:00.000Z').getTime()),
            id: 101,
            media_type: 'movie',
            release_date: '2024-01-01',
            title: 'Movie One',
          },
        },
        metadata: {
          itemCount: 1,
          lastUpdated: MockTimestamp.now(),
          needsEnrichment: false,
        },
        name: 'Already Watched',
      },
      favorites: {
        id: 'favorites',
        items: {
          '202': {
            addedAt: MockTimestamp.fromMillis(new Date('2024-01-04T00:00:00.000Z').getTime()),
            id: 202,
            media_type: 'tv',
            title: 'Favorite Show',
          },
        },
        metadata: {
          itemCount: 1,
          lastUpdated: MockTimestamp.now(),
          needsEnrichment: false,
        },
        name: 'Favorites',
      },
      watchlist: {
        id: 'watchlist',
        items: {
          '102': {
            addedAt: MockTimestamp.fromMillis(new Date('2024-01-02T00:00:00.000Z').getTime()),
            id: 102,
            media_type: 'movie',
            release_date: '2024-01-01',
            title: 'Movie Two',
          },
        },
        metadata: {
          itemCount: 1,
          lastUpdated: MockTimestamp.now(),
          needsEnrichment: false,
        },
        name: 'Should Watch',
      },
    };
    const listsCollection = {
      doc: jest.fn((id: string) => ({
        get: jest.fn().mockResolvedValue({
          data: () => listDataById[id],
          exists: Boolean(listDataById[id]),
        }),
        id,
        path: `users/user-1/lists/${id}`,
        set: listSet,
      })),
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

        throw new Error(`Unexpected subcollection ${name}`);
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktAccessToken: 'token',
          traktConnected: true,
          traktIncrementalState: {
            bootstrapCompletedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
            customLists: {},
            lastActivities: lastActivitiesBefore,
            listsSchemaVersion: TRAKT_LISTS_SCHEMA_VERSION,
            schemaVersion: 1,
            updatedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
          },
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

    (global.fetch as jest.Mock).mockImplementation((input: unknown) => {
      const url = String(input);

      if (url.includes('/sync/last_activities')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue(lastActivitiesAfter),
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
              listed_at: '2024-01-04T00:00:00.000Z',
              show: {
                ids: {
                  slug: 'favorite-show',
                  tmdb: 202,
                  trakt: 302,
                },
                title: 'Favorite Show',
                year: 2022,
              },
              type: 'show',
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

    const completedWrite = batchSet.mock.calls
      .map(([_ref, data]) => ('traktSyncStatus' in data ? data.traktSyncStatus : data))
      .find((data) => data?.status === 'completed') as
      | {
          itemsSynced: ReturnType<typeof emptyItemsSynced>;
          summaryMode: string;
        }
      | undefined;

    expect(completedWrite).toMatchObject({
      itemsSynced: emptyItemsSynced(),
      summaryMode: 'incremental',
    });
    expect(listSet).toHaveBeenCalledTimes(3);
  });

  it('keeps itemsSynced.lists at zero when incremental custom list reconciliation only normalizes local data', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const listSet = jest.fn().mockResolvedValue(undefined);
    const lastActivitiesBefore = {
      episodes: {
        watched_at: '2024-01-03T00:00:00.000Z',
      },
      favorites: {
        updated_at: '2024-01-04T00:00:00.000Z',
      },
      lists: {
        updated_at: '2024-01-05T00:00:00.000Z',
      },
      movies: {
        rated_at: '2024-01-02T00:00:00.000Z',
        watched_at: '2024-01-01T00:00:00.000Z',
      },
      shows: {
        rated_at: '2024-01-02T00:00:00.000Z',
        watched_at: '2024-01-03T00:00:00.000Z',
      },
      watchlist: {
        updated_at: '2024-01-04T00:00:00.000Z',
      },
    };
    const lastActivitiesAfter = {
      ...lastActivitiesBefore,
      lists: {
        updated_at: '2024-01-06T00:00:00.000Z',
      },
    };
    const localListDoc = createDocSnapshotWithSet(
      'users/user-1/lists/trakt_701',
      {
        createdAt: MockTimestamp.fromMillis(new Date('2024-01-05T00:00:00.000Z').getTime()),
        description: 'Custom list',
        isCustom: true,
        items: {
          '333': {
            addedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
            id: 333,
            media_type: 'movie',
            title: 'Custom Movie',
            traktId: 303,
          },
        },
        metadata: {
          itemCount: 1,
          lastUpdated: MockTimestamp.now(),
          needsEnrichment: false,
        },
        name: 'Custom List',
        privacy: 'private',
        traktId: 701,
        updatedAt: MockTimestamp.fromMillis(new Date('2024-01-07T00:00:00.000Z').getTime()),
      },
      listSet
    );
    const listsCollection = {
      get: jest.fn().mockResolvedValue({
        docs: [localListDoc],
      }),
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

        throw new Error(`Unexpected subcollection ${name}`);
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktAccessToken: 'token',
          traktConnected: true,
          traktIncrementalState: {
            bootstrapCompletedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
            customLists: {},
            lastActivities: lastActivitiesBefore,
            listsSchemaVersion: TRAKT_LISTS_SCHEMA_VERSION,
            schemaVersion: 1,
            updatedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
          },
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

    (global.fetch as jest.Mock).mockImplementation((input: unknown) => {
      const url = String(input);

      if (url.includes('/sync/last_activities')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue(lastActivitiesAfter),
          ok: true,
          status: 200,
        });
      }

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

      if (url.includes('/users/tester/lists') && !url.includes('/items')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              created_at: '2024-01-05T00:00:00.000Z',
              description: 'Custom list',
              ids: {
                slug: 'custom-list',
                trakt: 701,
              },
              name: 'Custom List',
              privacy: 'private',
              updated_at: '2024-01-07T00:00:00.000Z',
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
              id: 77,
              listed_at: '2024-01-06T00:00:00.000Z',
              movie: {
                ids: {
                  slug: 'custom-movie',
                  tmdb: 333,
                  trakt: 303,
                },
                title: 'Custom Movie',
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

    const completedWrite = batchSet.mock.calls
      .map(([_ref, data]) => ('traktSyncStatus' in data ? data.traktSyncStatus : data))
      .find((data) => data?.status === 'completed') as
      | {
          itemsSynced: ReturnType<typeof emptyItemsSynced>;
          summaryMode: string;
        }
      | undefined;

    expect(completedWrite).toMatchObject({
      itemsSynced: {
        ...emptyItemsSynced(),
        lists: 0,
      },
      summaryMode: 'incremental',
    });
    expect(listSet).toHaveBeenCalledTimes(1);
  });

  it('counts remote custom list metadata changes in itemsSynced.lists even when items are unchanged', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const listSet = jest.fn().mockResolvedValue(undefined);
    const lastActivitiesBefore = {
      episodes: {
        watched_at: '2024-01-03T00:00:00.000Z',
      },
      favorites: {
        updated_at: '2024-01-04T00:00:00.000Z',
      },
      lists: {
        updated_at: '2024-01-05T00:00:00.000Z',
      },
      movies: {
        rated_at: '2024-01-02T00:00:00.000Z',
        watched_at: '2024-01-01T00:00:00.000Z',
      },
      shows: {
        rated_at: '2024-01-02T00:00:00.000Z',
        watched_at: '2024-01-03T00:00:00.000Z',
      },
      watchlist: {
        updated_at: '2024-01-04T00:00:00.000Z',
      },
    };
    const lastActivitiesAfter = {
      ...lastActivitiesBefore,
      lists: {
        updated_at: '2024-01-07T00:00:00.000Z',
      },
    };
    const localListDoc = createDocSnapshotWithSet(
      'users/user-1/lists/trakt_701',
      {
        createdAt: MockTimestamp.fromMillis(new Date('2024-01-05T00:00:00.000Z').getTime()),
        description: 'Custom list',
        isCustom: true,
        items: {
          'movie-333': {
            addedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
            id: 333,
            media_type: 'movie',
            title: 'Custom Movie',
            traktId: 303,
          },
        },
        metadata: {
          itemCount: 1,
          lastUpdated: MockTimestamp.now(),
          needsEnrichment: false,
        },
        name: 'Old Custom List',
        privacy: 'private',
        traktId: 701,
        updatedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
      },
      listSet
    );
    const listsCollection = {
      get: jest.fn().mockResolvedValue({
        docs: [localListDoc],
      }),
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

        throw new Error(`Unexpected subcollection ${name}`);
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktAccessToken: 'token',
          traktConnected: true,
          traktIncrementalState: {
            bootstrapCompletedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
            customLists: {
              '701': {
                slug: 'custom-list',
                updatedAt: '2024-01-06T00:00:00.000Z',
              },
            },
            lastActivities: lastActivitiesBefore,
            listsSchemaVersion: TRAKT_LISTS_SCHEMA_VERSION,
            schemaVersion: 1,
            updatedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
          },
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

    (global.fetch as jest.Mock).mockImplementation((input: unknown) => {
      const url = String(input);

      if (url.includes('/sync/last_activities')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue(lastActivitiesAfter),
          ok: true,
          status: 200,
        });
      }

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

      if (url.includes('/users/tester/lists') && !url.includes('/items')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              created_at: '2024-01-05T00:00:00.000Z',
              description: 'Custom list',
              ids: {
                slug: 'custom-list',
                trakt: 701,
              },
              name: 'Custom List',
              privacy: 'private',
              updated_at: '2024-01-07T00:00:00.000Z',
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
              id: 77,
              listed_at: '2024-01-06T00:00:00.000Z',
              movie: {
                ids: {
                  slug: 'custom-movie',
                  tmdb: 333,
                  trakt: 303,
                },
                title: 'Custom Movie',
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

    const completedWrite = batchSet.mock.calls
      .map(([_ref, data]) => ('traktSyncStatus' in data ? data.traktSyncStatus : data))
      .find((data) => data?.status === 'completed') as
      | {
          itemsSynced: ReturnType<typeof emptyItemsSynced>;
          summaryMode: string;
        }
      | undefined;

    expect(completedWrite).toMatchObject({
      itemsSynced: {
        ...emptyItemsSynced(),
        lists: 1,
      },
      summaryMode: 'incremental',
    });
    expect(listSet).toHaveBeenCalledTimes(1);
  });

  it('preserves local-only ratings and only overwrites overlapping Trakt ratings when Trakt is newer', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchDelete = jest.fn();
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const lastActivitiesBefore = {
      episodes: {
        watched_at: '2024-01-03T00:00:00.000Z',
      },
      favorites: {
        updated_at: '2024-01-04T00:00:00.000Z',
      },
      lists: {
        updated_at: '2024-01-05T00:00:00.000Z',
      },
      movies: {
        rated_at: '2024-01-02T00:00:00.000Z',
        watched_at: '2024-01-01T00:00:00.000Z',
      },
      shows: {
        rated_at: '2024-01-02T00:00:00.000Z',
        watched_at: '2024-01-03T00:00:00.000Z',
      },
      watchlist: {
        updated_at: '2024-01-04T00:00:00.000Z',
      },
    };
    const lastActivitiesAfter = {
      ...lastActivitiesBefore,
      movies: {
        ...lastActivitiesBefore.movies,
        rated_at: '2024-01-06T00:00:00.000Z',
      },
      shows: {
        ...lastActivitiesBefore.shows,
        rated_at: '2024-01-05T00:00:00.000Z',
      },
    };
    const ratingsCollection = {
      doc: jest.fn((id: string) => ({
        id,
        path: `users/user-1/ratings/${id}`,
      })),
      get: jest.fn().mockResolvedValue(
        createCollectionSnapshot([
          createDocSnapshot('users/user-1/ratings/movie-101', {
            id: '101',
            mediaType: 'movie',
            ratedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
            rating: 9,
            title: 'Movie One',
          }),
          createDocSnapshot('users/user-1/ratings/movie-303', {
            id: '303',
            mediaType: 'movie',
            ratedAt: MockTimestamp.fromMillis(new Date('2024-01-07T00:00:00.000Z').getTime()),
            rating: 7,
            title: 'Local Only Movie',
          }),
          createDocSnapshot('users/user-1/ratings/tv-202', {
            id: '202',
            mediaType: 'tv',
            ratedAt: MockTimestamp.fromMillis(new Date('2024-01-03T00:00:00.000Z').getTime()),
            rating: 6,
            title: 'Show Two',
          }),
        ])
      ),
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

        if (name === 'ratings') {
          return ratingsCollection;
        }

        throw new Error(`Unexpected subcollection ${name}`);
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktAccessToken: 'token',
          traktConnected: true,
          traktIncrementalState: {
            bootstrapCompletedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
            customLists: {},
            lastActivities: lastActivitiesBefore,
            listsSchemaVersion: TRAKT_LISTS_SCHEMA_VERSION,
            schemaVersion: 1,
            updatedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
          },
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
        delete: batchDelete,
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

    (global.fetch as jest.Mock).mockImplementation((input: unknown) => {
      const url = String(input);

      if (url.includes('/sync/last_activities')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue(lastActivitiesAfter),
          ok: true,
          status: 200,
        });
      }

      if (url.includes('/sync/ratings')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              movie: {
                ids: {
                  slug: 'movie-1',
                  tmdb: 101,
                  trakt: 201,
                },
                title: 'Movie One',
                year: 2024,
              },
              rated_at: '2024-01-05T00:00:00.000Z',
              rating: 8,
              type: 'movie',
            },
            {
              rated_at: '2024-01-04T00:00:00.000Z',
              rating: 8,
              show: {
                ids: {
                  slug: 'show-2',
                  tmdb: 202,
                  trakt: 302,
                },
                title: 'Show Two',
                year: 2022,
              },
              type: 'show',
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

    const ratingWrites = batchSet.mock.calls
      .filter(([ref]) => typeof ref?.path === 'string' && ref.path.startsWith('users/user-1/ratings/'))
      .map((call) => {
        const [ref, data, options] = call as unknown as [
          { path: string },
          Record<string, unknown>,
          { merge: boolean } | undefined,
        ];

        return {
          data,
          options,
          path: ref.path,
        };
      });

    expect(ratingWrites).toHaveLength(1);
    expect(ratingWrites[0]?.path).toBe('users/user-1/ratings/tv-202');
    expect(ratingWrites[0]?.options).toEqual({ merge: false });
    expect(ratingWrites[0]?.data).toMatchObject({
      id: '202',
      mediaType: 'tv',
      rating: 8,
      title: 'Show Two',
    });
    expect((ratingWrites[0]?.data?.ratedAt as MockTimestamp).toMillis()).toBe(
      new Date('2024-01-04T00:00:00.000Z').getTime()
    );
    expect(ratingWrites[0]?.data).not.toHaveProperty('media_type');
    expect(ratingWrites.some((write) => write.path === 'users/user-1/ratings/movie-101')).toBe(false);
    expect(ratingWrites.some((write) => write.path === 'users/user-1/ratings/movie-303')).toBe(false);
    expect(batchDelete).not.toHaveBeenCalled();

    const completedWrite = batchSet.mock.calls
      .map(([_ref, data]) => ('traktSyncStatus' in data ? data.traktSyncStatus : data))
      .find((data) => data?.status === 'completed') as
      | {
          itemsSynced: ReturnType<typeof emptyItemsSynced>;
          summaryMode: string;
        }
      | undefined;

    expect(completedWrite).toMatchObject({
      itemsSynced: {
        ratings: 1,
      },
      summaryMode: 'incremental',
    });
  });

  it('reports zero changed items for unchanged incremental syncs', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const lastActivities = {
      episodes: {
        watched_at: '2024-01-03T00:00:00.000Z',
      },
      favorites: {
        updated_at: '2024-01-04T00:00:00.000Z',
      },
      lists: {
        updated_at: '2024-01-05T00:00:00.000Z',
      },
      movies: {
        rated_at: '2024-01-02T00:00:00.000Z',
        watched_at: '2024-01-01T00:00:00.000Z',
      },
      shows: {
        rated_at: '2024-01-02T00:00:00.000Z',
        watched_at: '2024-01-03T00:00:00.000Z',
      },
      watchlist: {
        updated_at: '2024-01-04T00:00:00.000Z',
      },
    };
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
          traktIncrementalState: {
            bootstrapCompletedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
            customLists: {},
            lastActivities,
            listsSchemaVersion: TRAKT_LISTS_SCHEMA_VERSION,
            schemaVersion: 1,
            updatedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
          },
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

    (global.fetch as jest.Mock).mockImplementation((input: unknown) => {
      const url = String(input);

      if (url.includes('/sync/last_activities')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue(lastActivities),
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

    const completedWrite = batchSet.mock.calls
      .map(([_ref, data]) => ('traktSyncStatus' in data ? data.traktSyncStatus : data))
      .find((data) => data?.status === 'completed') as
      | {
          itemsSynced: ReturnType<typeof emptyItemsSynced>;
          summaryMode: string;
        }
      | undefined;

    expect(completedWrite).toMatchObject({
      itemsSynced: emptyItemsSynced(),
      summaryMode: 'incremental',
    });
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);
    const savedState = batchSet.mock.calls
      .map(([_ref, data]) => data)
      .find((data) => data?.traktIncrementalState)?.traktIncrementalState;
    expect(savedState).toMatchObject({ listsSchemaVersion: TRAKT_LISTS_SCHEMA_VERSION, schemaVersion: 1 });
  });

  it('reports only the changed incremental bucket when a single activity group changes', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const listSet = jest.fn().mockResolvedValue(undefined);
    const lastActivitiesBefore = {
      episodes: {
        watched_at: '2024-01-03T00:00:00.000Z',
      },
      favorites: {
        updated_at: '2024-01-04T00:00:00.000Z',
      },
      lists: {
        updated_at: '2024-01-05T00:00:00.000Z',
      },
      movies: {
        rated_at: '2024-01-02T00:00:00.000Z',
        watched_at: '2024-01-01T00:00:00.000Z',
      },
      shows: {
        rated_at: '2024-01-02T00:00:00.000Z',
        watched_at: '2024-01-03T00:00:00.000Z',
      },
      watchlist: {
        updated_at: '2024-01-04T00:00:00.000Z',
      },
    };
    const lastActivitiesAfter = {
      ...lastActivitiesBefore,
      watchlist: {
        updated_at: '2024-01-06T00:00:00.000Z',
      },
    };
    const listsCollection = {
      doc: jest.fn((id: string) => ({
        get: jest.fn().mockResolvedValue({
          data: () => undefined,
          exists: false,
        }),
        id,
        path: `users/user-1/lists/${id}`,
        set: listSet,
      })),
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

        throw new Error(`Unexpected subcollection ${name}`);
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktAccessToken: 'token',
          traktConnected: true,
          traktIncrementalState: {
            bootstrapCompletedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
            customLists: {},
            lastActivities: lastActivitiesBefore,
            listsSchemaVersion: TRAKT_LISTS_SCHEMA_VERSION,
            schemaVersion: 1,
            updatedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
          },
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

    (global.fetch as jest.Mock).mockImplementation((input: unknown) => {
      const url = String(input);

      if (url.includes('/sync/last_activities')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue(lastActivitiesAfter),
          ok: true,
          status: 200,
        });
      }

      if (url.includes('/sync/watchlist')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              id: 1,
              listed_at: '2024-01-06T00:00:00.000Z',
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

      throw new Error(`Unexpected fetch URL ${url}`);
    });

    await expect(
      (runTraktSync as any)({
        data: { runId: 'run-1', userId: 'user-1' },
        retryCount: 0,
        retryReason: undefined,
      })
    ).resolves.toBeUndefined();

    const completedWrite = batchSet.mock.calls
      .map(([_ref, data]) => ('traktSyncStatus' in data ? data.traktSyncStatus : data))
      .find((data) => data?.status === 'completed') as
      | {
          itemsSynced: ReturnType<typeof emptyItemsSynced>;
          summaryMode: string;
        }
      | undefined;

    expect(completedWrite).toMatchObject({
      itemsSynced: {
        episodes: 0,
        favorites: 0,
        lists: 0,
        movies: 0,
        ratings: 0,
        shows: 0,
        watchlistItems: 1,
      },
      summaryMode: 'incremental',
    });
    expect(listSet).toHaveBeenCalledTimes(1);
  });
});
