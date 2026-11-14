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

import { TRAKT_LISTS_SCHEMA_VERSION } from '@/functions/src/trakt';
import {
  DAY_MS,
  emptyItemsSynced,
  MockTimestamp,
  resetTraktMocks,
} from './helpers/traktHarness';
import {
  ACTIVE_ENRICHMENT_RUN,
  connectedSyncUser,
  CUSTOM_LIST,
  CUSTOM_MOVIE,
  findSyncStatusWrite,
  FIRST_SYNC_ROUTES,
  incrementalSyncUser,
  LAST_ACTIVITIES,
  listedMovie,
  mockSyncFirestore,
  mockTraktFetch,
  MOVIE_ONE,
  MOVIE_TWO,
  runSyncTask,
  timestampAt,
  TRAKT_USER_SETTINGS,
  watchedMovie,
} from './helpers/traktSyncHarness';

beforeEach(resetTraktMocks);

/** The custom-list item Trakt returns for `custom-list`. */
const customListItem = {
  id: 77,
  listed_at: '2024-01-06T00:00:00.000Z',
  movie: CUSTOM_MOVIE,
  rank: 1,
  type: 'movie',
};

/** The saved copy of the Trakt custom list 701, as a list document. */
const savedCustomList = (overrides: Record<string, unknown>) => ({
  createdAt: timestampAt('2024-01-05T00:00:00.000Z'),
  description: 'Custom list',
  isCustom: true,
  metadata: {
    itemCount: 1,
    lastUpdated: MockTimestamp.now(),
    needsEnrichment: false,
  },
  name: 'Custom List',
  privacy: 'private',
  traktId: 701,
  updatedAt: timestampAt('2024-01-07T00:00:00.000Z'),
  ...overrides,
});

describe('Trakt sync Firestore sanitization', () => {
  it('writes a 24-hour cooldown after a successful sync completes', async () => {
    const frozenNow = Date.UTC(2026, 2, 25, 12, 0, 0);
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(frozenNow);
    const { batchSet } = mockSyncFirestore({
      enrichmentQueue: ACTIVE_ENRICHMENT_RUN,
      episodeTracking: {},
      lists: {},
      ratings: {},
      user: connectedSyncUser(),
    });
    mockTraktFetch(FIRST_SYNC_ROUTES);

    try {
      await expect(runSyncTask()).resolves.toBeUndefined();
    } finally {
      dateNowSpy.mockRestore();
    }

    const completedWrite = findSyncStatusWrite(batchSet, 'completed');

    expect(completedWrite).toBeDefined();
    expect(completedWrite?.completedAt.toMillis()).toBe(frozenNow);
    expect(completedWrite?.nextAllowedSyncAt.toMillis()).toBe(frozenNow + DAY_MS);
  });

  it('reports bootstrap summary mode with imported totals even when local data is already up to date', async () => {
    const { batchDelete, batchSet, listSet } = mockSyncFirestore({
      allowBatchDelete: true,
      episodeTracking: {
        '201': {
          episodes: {
            '1_1': {
              watched: true,
              watchedAt: timestampAt('2024-02-01T00:00:00.000Z'),
            },
            '1_2': {
              watched: true,
              watchedAt: timestampAt('2024-02-03T00:00:00.000Z'),
            },
            '1_3': {
              watched: true,
              watchedAt: timestampAt('2024-02-04T00:00:00.000Z'),
            },
          },
          metadata: {
            lastUpdated: MockTimestamp.now(),
            tvShowName: 'Show One',
          },
        },
        '999': {
          episodes: {
            '1_1': {
              watched: true,
              watchedAt: timestampAt('2024-03-04T00:00:00.000Z'),
            },
          },
          metadata: {
            lastUpdated: MockTimestamp.now(),
            tvShowName: 'Local Only Show',
          },
        },
      },
      listQueryIds: ['trakt_701'],
      lists: {
        'already-watched': {
          id: 'already-watched',
          items: {
            'movie-101': {
              addedAt: timestampAt('2024-01-02T00:00:00.000Z'),
              id: 101,
              media_type: 'movie',
              release_date: '2024-01-01',
              title: 'Movie One',
            },
            'movie-999': {
              addedAt: timestampAt('2024-03-01T00:00:00.000Z'),
              id: 999,
              media_type: 'movie',
              release_date: '2023-01-01',
              title: 'Local Movie Only',
            },
            'tv-201': {
              addedAt: timestampAt('2024-02-03T00:00:00.000Z'),
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
        },
        favorites: {
          id: 'favorites',
          items: {
            'tv-202': {
              addedAt: timestampAt('2024-01-05T00:00:00.000Z'),
              id: 202,
              media_type: 'tv',
              title: 'Favorite Show',
            },
            'movie-303': {
              addedAt: timestampAt('2024-03-03T00:00:00.000Z'),
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
        },
        trakt_701: savedCustomList({
          items: {
            'movie-333': {
              addedAt: timestampAt('2024-01-06T00:00:00.000Z'),
              id: 333,
              media_type: 'movie',
              title: 'Custom Movie',
              traktId: 303,
            },
          },
        }),
        watchlist: {
          id: 'watchlist',
          items: {
            'movie-102': {
              addedAt: timestampAt('2024-01-03T00:00:00.000Z'),
              id: 102,
              media_type: 'movie',
              release_date: '2024-01-01',
              title: 'Movie Two',
            },
            'tv-909': {
              addedAt: timestampAt('2024-03-02T00:00:00.000Z'),
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
        },
      },
      ratings: {
        'movie-101': {
          id: '101',
          mediaType: 'movie',
          ratedAt: timestampAt('2024-01-09T00:00:00.000Z'),
          rating: 8,
          title: 'Movie One',
        },
        'tv-909': {
          id: '909',
          mediaType: 'tv',
          ratedAt: timestampAt('2024-03-05T00:00:00.000Z'),
          rating: 9,
          title: 'Local TV Rating',
        },
      },
      user: connectedSyncUser(),
    });
    mockTraktFetch({
      '/sync/last_activities': {},
      '/sync/watched/movies': [watchedMovie(MOVIE_ONE, '2024-01-01T00:00:00.000Z')],
      '/sync/watched/shows': [
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
      ],
      '/sync/ratings': [
        {
          movie: MOVIE_ONE,
          rated_at: '2024-01-08T00:00:00.000Z',
          rating: 8,
          type: 'movie',
        },
      ],
      '/sync/watchlist': [listedMovie(1, '2024-01-02T00:00:00.000Z', MOVIE_TWO)],
      '/sync/favorites': [
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
      ],
      '/users/settings': TRAKT_USER_SETTINGS,
      '/users/tester/lists': [CUSTOM_LIST],
      '/users/tester/lists/custom-list/items': [customListItem],
    });

    await expect(runSyncTask()).resolves.toBeUndefined();

    expect(findSyncStatusWrite(batchSet, 'completed')).toMatchObject({
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
    const { batchSet, listSet } = mockSyncFirestore({
      episodeTracking: {},
      listAccess: 'doc',
      lists: {
        'already-watched': {
          id: 'already-watched',
          items: {
            '101': {
              addedAt: timestampAt('2024-01-01T00:00:00.000Z'),
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
              addedAt: timestampAt('2024-01-04T00:00:00.000Z'),
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
              addedAt: timestampAt('2024-01-02T00:00:00.000Z'),
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
      },
      user: incrementalSyncUser(),
    });
    mockTraktFetch({
      '/sync/last_activities': {
        ...LAST_ACTIVITIES,
        favorites: {
          updated_at: '2024-01-06T00:00:00.000Z',
        },
        movies: {
          ...LAST_ACTIVITIES.movies,
          watched_at: '2024-01-06T00:00:00.000Z',
        },
        watchlist: {
          updated_at: '2024-01-06T00:00:00.000Z',
        },
      },
      '/sync/watched/movies': [watchedMovie(MOVIE_ONE, '2024-01-01T00:00:00.000Z')],
      '/sync/watched/shows': [],
      '/sync/watchlist': [listedMovie(1, '2024-01-02T00:00:00.000Z', MOVIE_TWO)],
      '/sync/favorites': [
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
      ],
    });

    await expect(runSyncTask()).resolves.toBeUndefined();

    expect(findSyncStatusWrite(batchSet, 'completed')).toMatchObject({
      itemsSynced: emptyItemsSynced(),
      summaryMode: 'incremental',
    });
    expect(listSet).toHaveBeenCalledTimes(3);
  });

  it('keeps itemsSynced.lists at zero when incremental custom list reconciliation only normalizes local data', async () => {
    const { batchSet, listSet } = mockSyncFirestore({
      listAccess: 'query',
      lists: {
        trakt_701: savedCustomList({
          items: {
            '333': {
              addedAt: timestampAt('2024-01-06T00:00:00.000Z'),
              id: 333,
              media_type: 'movie',
              title: 'Custom Movie',
              traktId: 303,
            },
          },
        }),
      },
      user: incrementalSyncUser(),
    });
    mockTraktFetch({
      '/sync/last_activities': {
        ...LAST_ACTIVITIES,
        lists: {
          updated_at: '2024-01-06T00:00:00.000Z',
        },
      },
      '/users/settings': TRAKT_USER_SETTINGS,
      '/users/tester/lists': [CUSTOM_LIST],
      '/users/tester/lists/custom-list/items': [customListItem],
    });

    await expect(runSyncTask()).resolves.toBeUndefined();

    expect(findSyncStatusWrite(batchSet, 'completed')).toMatchObject({
      itemsSynced: {
        ...emptyItemsSynced(),
        lists: 0,
      },
      summaryMode: 'incremental',
    });
    expect(listSet).toHaveBeenCalledTimes(1);
  });

  it('counts remote custom list metadata changes in itemsSynced.lists even when items are unchanged', async () => {
    const { batchSet, listSet } = mockSyncFirestore({
      listAccess: 'query',
      lists: {
        trakt_701: savedCustomList({
          items: {
            'movie-333': {
              addedAt: timestampAt('2024-01-06T00:00:00.000Z'),
              id: 333,
              media_type: 'movie',
              title: 'Custom Movie',
              traktId: 303,
            },
          },
          name: 'Old Custom List',
          updatedAt: timestampAt('2024-01-06T00:00:00.000Z'),
        }),
      },
      user: incrementalSyncUser({
        customLists: {
          '701': {
            slug: 'custom-list',
            updatedAt: '2024-01-06T00:00:00.000Z',
          },
        },
      }),
    });
    mockTraktFetch({
      '/sync/last_activities': {
        ...LAST_ACTIVITIES,
        lists: {
          updated_at: '2024-01-07T00:00:00.000Z',
        },
      },
      '/users/settings': TRAKT_USER_SETTINGS,
      '/users/tester/lists': [CUSTOM_LIST],
      '/users/tester/lists/custom-list/items': [customListItem],
    });

    await expect(runSyncTask()).resolves.toBeUndefined();

    expect(findSyncStatusWrite(batchSet, 'completed')).toMatchObject({
      itemsSynced: {
        ...emptyItemsSynced(),
        lists: 1,
      },
      summaryMode: 'incremental',
    });
    expect(listSet).toHaveBeenCalledTimes(1);
  });

  it('preserves local-only ratings and only overwrites overlapping Trakt ratings when Trakt is newer', async () => {
    const { batchDelete, batchSet } = mockSyncFirestore({
      allowBatchDelete: true,
      ratings: {
        'movie-101': {
          id: '101',
          mediaType: 'movie',
          ratedAt: timestampAt('2024-01-06T00:00:00.000Z'),
          rating: 9,
          title: 'Movie One',
        },
        'movie-303': {
          id: '303',
          mediaType: 'movie',
          ratedAt: timestampAt('2024-01-07T00:00:00.000Z'),
          rating: 7,
          title: 'Local Only Movie',
        },
        'tv-202': {
          id: '202',
          mediaType: 'tv',
          ratedAt: timestampAt('2024-01-03T00:00:00.000Z'),
          rating: 6,
          title: 'Show Two',
        },
      },
      user: incrementalSyncUser(),
    });
    mockTraktFetch({
      '/sync/last_activities': {
        ...LAST_ACTIVITIES,
        movies: {
          ...LAST_ACTIVITIES.movies,
          rated_at: '2024-01-06T00:00:00.000Z',
        },
        shows: {
          ...LAST_ACTIVITIES.shows,
          rated_at: '2024-01-05T00:00:00.000Z',
        },
      },
      '/sync/ratings': [
        {
          movie: MOVIE_ONE,
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
      ],
    });

    await expect(runSyncTask()).resolves.toBeUndefined();

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

    expect(findSyncStatusWrite(batchSet, 'completed')).toMatchObject({
      itemsSynced: {
        ratings: 1,
      },
      summaryMode: 'incremental',
    });
  });

  it('reports zero changed items for unchanged incremental syncs', async () => {
    const { batchSet } = mockSyncFirestore({ user: incrementalSyncUser() });
    mockTraktFetch({ '/sync/last_activities': LAST_ACTIVITIES });

    await expect(runSyncTask()).resolves.toBeUndefined();

    expect(findSyncStatusWrite(batchSet, 'completed')).toMatchObject({
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
    const { batchSet, listSet } = mockSyncFirestore({
      enrichmentQueue: ACTIVE_ENRICHMENT_RUN,
      listAccess: 'doc',
      lists: {},
      user: incrementalSyncUser(),
    });
    mockTraktFetch({
      '/sync/last_activities': {
        ...LAST_ACTIVITIES,
        watchlist: {
          updated_at: '2024-01-06T00:00:00.000Z',
        },
      },
      '/sync/watchlist': [listedMovie(1, '2024-01-06T00:00:00.000Z', MOVIE_TWO)],
    });

    await expect(runSyncTask()).resolves.toBeUndefined();

    expect(findSyncStatusWrite(batchSet, 'completed')).toMatchObject({
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
