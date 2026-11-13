/**
 * Trakt managed list reconciliation: remote change detection, season entries, legacy
 * numeric keys, folded shows and one-time list re-reads.
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

import { __test__, getSyncSteps, TRAKT_LISTS_SCHEMA_VERSION } from '@/functions/src/trakt';
import { createDocSnapshotWithSet, MockTimestamp, resetTraktMocks } from './helpers/traktHarness';

beforeEach(resetTraktMocks);

describe('Trakt sync Firestore sanitization', () => {
  it('does not count normalization-only managed list writes as remote changes', async () => {
    const listSet = jest.fn().mockResolvedValue(undefined);
    const movieItem = {
      addedAt: MockTimestamp.fromMillis(new Date('2024-01-03T00:00:00.000Z').getTime()),
      id: 101,
      media_type: 'movie',
      release_date: '2024-01-01',
      title: 'Movie One',
    };

    const result = await (__test__ as any).reconcileManagedList(
      'user-1',
      'watchlist',
      {
        'movie-101': movieItem,
      },
      {
        id: 'watchlist',
        name: 'Should Watch',
      },
      createDocSnapshotWithSet(
        'users/user-1/lists/watchlist',
        {
          id: 'watchlist',
          items: {
            '101': movieItem,
          },
          metadata: {
            itemCount: 1,
            lastUpdated: MockTimestamp.now(),
            needsEnrichment: false,
          },
          name: 'Should Watch',
        },
        listSet
      ),
      {
        preserveLocalItems: true,
        recencyField: 'addedAt',
      }
    );

    expect(result).toEqual({
      changedCount: 0,
      changedMediaTypes: [],
      didRemoteChange: false,
      didWrite: true,
      shouldEnrich: false,
    });
    expect(listSet).toHaveBeenCalledWith(
      expect.objectContaining({
        items: {
          '101': 'FIELD_DELETE',
          'movie-101': expect.objectContaining({
            id: 101,
            media_type: 'movie',
            title: 'Movie One',
          }),
        },
        metadata: expect.objectContaining({
          itemCount: 1,
          needsEnrichment: false,
        }),
      }),
      { merge: true }
    );
  });

  it('does not treat equal addedAt millis with different raw shapes as remote changes', async () => {
    const listSet = jest.fn().mockResolvedValue(undefined);
    const addedAtMs = new Date('2024-01-03T00:00:00.000Z').getTime();

    const result = await (__test__ as any).reconcileManagedList(
      'user-1',
      'watchlist',
      {
        'movie-101': {
          addedAt: MockTimestamp.fromMillis(addedAtMs),
          id: 101,
          media_type: 'movie',
          release_date: '2024-01-01',
          title: 'Movie One',
        },
      },
      {
        id: 'watchlist',
        name: 'Should Watch',
      },
      createDocSnapshotWithSet(
        'users/user-1/lists/watchlist',
        {
          id: 'watchlist',
          items: {
            'movie-101': {
              addedAt: new Date(addedAtMs).toISOString(),
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
          name: 'Should Watch',
        },
        listSet
      ),
      {
        preserveLocalItems: true,
        recencyField: 'addedAt',
      }
    );

    expect(result).toEqual({
      changedCount: 0,
      changedMediaTypes: [],
      didRemoteChange: false,
      didWrite: false,
      shouldEnrich: false,
    });
    expect(listSet).not.toHaveBeenCalled();
  });

  it('applies equal addedAt millis updates when non-recency managed fields change', async () => {
    const listSet = jest.fn().mockResolvedValue(undefined);
    const addedAtMs = new Date('2024-01-03T00:00:00.000Z').getTime();

    const result = await (__test__ as any).reconcileManagedList(
      'user-1',
      'watchlist',
      {
        'movie-101': {
          addedAt: MockTimestamp.fromMillis(addedAtMs),
          id: 101,
          media_type: 'movie',
          release_date: '2024-01-01',
          title: 'Movie One Updated',
        },
      },
      {
        id: 'watchlist',
        name: 'Should Watch',
      },
      createDocSnapshotWithSet(
        'users/user-1/lists/watchlist',
        {
          id: 'watchlist',
          items: {
            'movie-101': {
              addedAt: new Date(addedAtMs).toISOString(),
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
          name: 'Should Watch',
        },
        listSet
      ),
      {
        preserveLocalItems: true,
        recencyField: 'addedAt',
      }
    );

    expect(result).toEqual({
      changedCount: 1,
      changedMediaTypes: ['movie'],
      didRemoteChange: true,
      didWrite: true,
      shouldEnrich: true,
    });
    expect(listSet).toHaveBeenCalledWith(
      expect.objectContaining({
        items: {
          'movie-101': expect.objectContaining({
            id: 101,
            media_type: 'movie',
            title: 'Movie One Updated',
          }),
        },
        metadata: expect.objectContaining({
          itemCount: 1,
          needsEnrichment: true,
        }),
      }),
      { merge: true }
    );
  });

  it('counts true remote managed list adds and updates as remote changes', async () => {
    const listSet = jest.fn().mockResolvedValue(undefined);
    const movieItem = {
      addedAt: MockTimestamp.fromMillis(new Date('2024-01-03T00:00:00.000Z').getTime()),
      id: 101,
      media_type: 'movie',
      release_date: '2024-01-01',
      title: 'Movie One',
    };

    const result = await (__test__ as any).reconcileManagedList(
      'user-1',
      'watchlist',
      {
        'movie-101': movieItem,
      },
      {
        id: 'watchlist',
        name: 'Should Watch',
      },
      createDocSnapshotWithSet(
        'users/user-1/lists/watchlist',
        {
          id: 'watchlist',
          items: {},
          metadata: {
            itemCount: 0,
            lastUpdated: MockTimestamp.now(),
            needsEnrichment: false,
          },
          name: 'Should Watch',
        },
        listSet
      ),
      {
        preserveLocalItems: true,
        recencyField: 'addedAt',
      }
    );

    expect(result).toEqual({
      changedCount: 1,
      changedMediaTypes: ['movie'],
      didRemoteChange: true,
      didWrite: true,
      shouldEnrich: true,
    });
    expect(listSet).toHaveBeenCalledWith(
      expect.objectContaining({
        items: {
          'movie-101': expect.objectContaining({
            id: 101,
            media_type: 'movie',
            title: 'Movie One',
          }),
        },
        metadata: expect.objectContaining({
          itemCount: 1,
          needsEnrichment: true,
        }),
      }),
      { merge: true }
    );
  });

  it('counts remote managed list deletions as remote changes', async () => {
    const listSet = jest.fn().mockResolvedValue(undefined);
    const movieItem = {
      addedAt: MockTimestamp.fromMillis(new Date('2024-01-03T00:00:00.000Z').getTime()),
      id: 101,
      media_type: 'movie',
      title: 'Custom Movie',
      traktId: 303,
    };

    const result = await (__test__ as any).reconcileManagedList(
      'user-1',
      'trakt_701',
      {},
      {
        createdAt: MockTimestamp.fromMillis(new Date('2024-01-01T00:00:00.000Z').getTime()),
        description: 'Custom list',
        isCustom: true,
        name: 'Custom List',
        privacy: 'private',
        traktId: 701,
        updatedAt: MockTimestamp.fromMillis(new Date('2024-01-07T00:00:00.000Z').getTime()),
      },
      createDocSnapshotWithSet(
        'users/user-1/lists/trakt_701',
        {
          createdAt: MockTimestamp.fromMillis(new Date('2024-01-01T00:00:00.000Z').getTime()),
          description: 'Custom list',
          id: 'trakt_701',
          isCustom: true,
          items: {
            'movie-101': movieItem,
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
      ),
      {
        countBaseDataChangesAsRemoteChange: true,
        preserveLocalItems: false,
        recencyField: 'addedAt',
      }
    );

    expect(result).toEqual({
      changedCount: 1,
      changedMediaTypes: ['movie'],
      didRemoteChange: true,
      didWrite: true,
      shouldEnrich: false,
    });
    expect(listSet).toHaveBeenCalledWith(
      expect.objectContaining({
        items: {
          'movie-101': 'FIELD_DELETE',
        },
        metadata: expect.objectContaining({
          itemCount: 0,
          needsEnrichment: false,
        }),
      }),
      { merge: true }
    );
  });
});

describe('reconcileManagedList with season entries', () => {
  const seasonItem = (seasonNumber: number) => ({
    addedAt: new Date('2026-01-02T00:00:00.000Z').getTime(),
    id: 1396,
    media_type: 'season',
    name: `Breaking Bad · Season ${seasonNumber}`,
    season_number: seasonNumber,
    show_name: 'Breaking Bad',
    title: `Breaking Bad · Season ${seasonNumber}`,
  });

  it('replaces a folded show with its seasons in a Trakt custom list', async () => {
    const listSet = jest.fn().mockResolvedValue(undefined);

    const result = await (__test__ as any).reconcileManagedList(
      'user-1',
      'trakt_77',
      { 'season-1396-2': seasonItem(2), 'season-1396-0': seasonItem(0) },
      { name: 'Faves' },
      createDocSnapshotWithSet(
        'users/user-1/lists/trakt_77',
        {
          items: {
            // What earlier syncs wrote for those seasons: the show itself.
            'tv-1396': {
              addedAt: new Date('2026-01-02T00:00:00.000Z').getTime(),
              id: 1396,
              media_type: 'tv',
              title: 'Breaking Bad',
            },
          },
          metadata: { itemCount: 1, needsEnrichment: false },
          name: 'Faves',
        },
        listSet
      ),
      { preserveLocalItems: false, recencyField: 'addedAt' }
    );

    expect(result).toMatchObject({
      changedMediaTypes: ['tv'],
      didRemoteChange: true,
      shouldEnrich: true,
    });
    const written = listSet.mock.calls[0][0].items;
    expect(written['tv-1396']).toBe('FIELD_DELETE');
    expect(written['season-1396-2']).toEqual(
      expect.objectContaining({ media_type: 'season', season_number: 2 })
    );
    expect(written['season-1396-0']).toEqual(
      expect.objectContaining({ media_type: 'season', season_number: 0 })
    );
  });

  it('never clears a numeric key for a season (it belongs to the show or a movie)', async () => {
    const listSet = jest.fn().mockResolvedValue(undefined);
    const legacyMovie = { addedAt: 1, id: 1396, media_type: 'movie', title: 'A Movie' };

    await (__test__ as any).reconcileManagedList(
      'user-1',
      'watchlist',
      { 'season-1396-1': seasonItem(1) },
      { id: 'watchlist', name: 'Should Watch' },
      createDocSnapshotWithSet(
        'users/user-1/lists/watchlist',
        {
          items: { '1396': legacyMovie },
          metadata: { itemCount: 1, needsEnrichment: false },
          name: 'Should Watch',
        },
        listSet
      ),
      { preserveLocalItems: true, recencyField: 'addedAt' }
    );

    const written = listSet.mock.calls[0][0].items;
    expect(written).toHaveProperty(['season-1396-1']);
    expect(written).not.toHaveProperty('1396');
  });

  it('leaves an unchanged season alone on the next sync', async () => {
    const listSet = jest.fn().mockResolvedValue(undefined);
    const enriched = {
      ...seasonItem(2),
      poster_path: '/s2.jpg',
      season_name: 'Season 2',
      vote_average: 8.2,
    };

    const result = await (__test__ as any).reconcileManagedList(
      'user-1',
      'trakt_77',
      { 'season-1396-2': seasonItem(2) },
      { name: 'Faves' },
      createDocSnapshotWithSet(
        'users/user-1/lists/trakt_77',
        {
          items: { 'season-1396-2': enriched },
          metadata: { itemCount: 1, needsEnrichment: false },
          name: 'Faves',
        },
        listSet
      ),
      { preserveLocalItems: false, recencyField: 'addedAt' }
    );

    expect(result).toMatchObject({ changedCount: 0, didRemoteChange: false, didWrite: false });
    expect(listSet).not.toHaveBeenCalled();
  });
});

describe('watchlist cleanup and old numeric keys', () => {
  const seasonListedAt = new Date('2025-01-26T07:45:16.000Z').getTime();
  const remoteSeason = {
    'season-1396-2': {
      addedAt: seasonListedAt,
      id: 1396,
      media_type: 'season',
      season_number: 2,
      title: 'Breaking Bad · Season 2',
    },
  };
  const foldedShow = { addedAt: seasonListedAt, id: 1396, media_type: 'tv', title: 'Breaking Bad' };

  const reconcileWatchlist = async (items: Record<string, unknown>) => {
    const listSet = jest.fn().mockResolvedValue(undefined);
    await (__test__ as any).reconcileManagedList(
      'user-1',
      'watchlist',
      remoteSeason,
      { id: 'watchlist', name: 'Should Watch' },
      createDocSnapshotWithSet(
        'users/user-1/lists/watchlist',
        { items, metadata: { itemCount: 2, needsEnrichment: false }, name: 'Should Watch' },
        listSet
      ),
      { preserveLocalItems: true, recencyField: 'addedAt', removeFoldedSeasonShows: true }
    );
    return listSet.mock.calls[0][0].items;
  };

  it('keeps a movie stored under the same number as the folded show', async () => {
    const written = await reconcileWatchlist({
      'tv-1396': foldedShow,
      // An old-format movie entry that happens to share the show's TMDB number.
      '1396': { addedAt: 5, id: 1396, media_type: 'movie', title: 'A Movie' },
    });

    expect(written['tv-1396']).toBe('FIELD_DELETE');
    expect(written).not.toHaveProperty('1396');
  });

  it('keeps a movie stored under the number of a show Trakt sends', async () => {
    const listSet = jest.fn().mockResolvedValue(undefined);
    await (__test__ as any).reconcileManagedList(
      'user-1',
      'watchlist',
      { 'tv-1396': { addedAt: 9, id: 1396, media_type: 'tv', title: 'Breaking Bad' } },
      { id: 'watchlist', name: 'Should Watch' },
      createDocSnapshotWithSet(
        'users/user-1/lists/watchlist',
        {
          items: { '1396': { addedAt: 5, id: 1396, media_type: 'movie', title: 'A Movie' } },
          metadata: { itemCount: 1, needsEnrichment: false },
          name: 'Should Watch',
        },
        listSet
      ),
      { preserveLocalItems: true, recencyField: 'addedAt' }
    );

    const written = listSet.mock.calls[0][0].items;
    expect(written['tv-1396']).toEqual(expect.objectContaining({ media_type: 'tv' }));
    expect(written).not.toHaveProperty('1396');
  });

  it('removes the folded show when it is stored under its old numeric key', async () => {
    const written = await reconcileWatchlist({ '1396': foldedShow });

    expect(written['1396']).toBe('FIELD_DELETE');
  });
});

describe('one-time re-read of the watchlist and lists', () => {
  const activities = {
    episodes: { watched_at: '2024-01-03T00:00:00.000Z' },
    favorites: { updated_at: '2024-01-04T00:00:00.000Z' },
    lists: { updated_at: '2024-01-05T00:00:00.000Z' },
    movies: { rated_at: '2024-01-02T00:00:00.000Z', watched_at: '2024-01-01T00:00:00.000Z' },
    shows: { rated_at: '2024-01-02T00:00:00.000Z', watched_at: '2024-01-03T00:00:00.000Z' },
    watchlist: { updated_at: '2024-01-04T00:00:00.000Z' },
  };

  it('re-reads only the watchlist and lists for a sync state from before seasons', () => {
    expect(
      getSyncSteps({
        bootstrap: false,
        lastActivities: activities,
        listsSchemaVersion: undefined,
        previousActivities: activities,
      })
    ).toEqual({
      forceListResync: true,
      shouldSyncCustomLists: true,
      shouldSyncFavorites: false,
      shouldSyncRatings: false,
      shouldSyncWatched: false,
      shouldSyncWatchlist: true,
    });
  });

  it('re-reads the watchlist and lists once more for a sync state from before episodes', () => {
    expect(
      getSyncSteps({
        bootstrap: false,
        lastActivities: activities,
        listsSchemaVersion: 1,
        previousActivities: activities,
      })
    ).toMatchObject({
      forceListResync: true,
      shouldSyncCustomLists: true,
      shouldSyncFavorites: false,
      shouldSyncRatings: false,
      shouldSyncWatched: false,
      shouldSyncWatchlist: true,
    });
    expect(TRAKT_LISTS_SCHEMA_VERSION).toBe(2);
  });

  it('stays incremental once the lists have been re-read', () => {
    expect(
      getSyncSteps({
        bootstrap: false,
        lastActivities: activities,
        listsSchemaVersion: TRAKT_LISTS_SCHEMA_VERSION,
        previousActivities: activities,
      })
    ).toMatchObject({
      forceListResync: false,
      shouldSyncCustomLists: false,
      shouldSyncWatchlist: false,
    });
  });

  it('still syncs a list group Trakt reports as changed', () => {
    expect(
      getSyncSteps({
        bootstrap: false,
        lastActivities: { ...activities, watchlist: { updated_at: '2024-02-01T00:00:00.000Z' } },
        listsSchemaVersion: TRAKT_LISTS_SCHEMA_VERSION,
        previousActivities: activities,
      })
    ).toMatchObject({ shouldSyncCustomLists: false, shouldSyncWatchlist: true });
  });
});

describe('watchlist cleanup of shows folded from seasons', () => {
  it('removes the folded show and keeps everything else', async () => {
    const listSet = jest.fn().mockResolvedValue(undefined);
    const seasonListedAt = new Date('2025-01-26T07:45:16.000Z').getTime();

    const result = await (__test__ as any).reconcileManagedList(
      'user-1',
      'watchlist',
      {
        'season-1396-2': {
          addedAt: seasonListedAt,
          id: 1396,
          media_type: 'season',
          season_number: 2,
          title: 'Breaking Bad · Season 2',
        },
      },
      { id: 'watchlist', name: 'Should Watch' },
      createDocSnapshotWithSet(
        'users/user-1/lists/watchlist',
        {
          items: {
            // Written by an earlier sync for Season 2: the show, at the season's time.
            'tv-1396': { addedAt: seasonListedAt, id: 1396, media_type: 'tv', title: 'Breaking Bad' },
            // Added in ShowSeek.
            'movie-27205': { addedAt: 5, id: 27205, media_type: 'movie', title: 'Inception' },
          },
          metadata: { itemCount: 2, needsEnrichment: false },
          name: 'Should Watch',
        },
        listSet
      ),
      { preserveLocalItems: true, recencyField: 'addedAt', removeFoldedSeasonShows: true }
    );

    const write = listSet.mock.calls[0][0];
    expect(write.items['tv-1396']).toBe('FIELD_DELETE');
    expect(write.items).not.toHaveProperty(['movie-27205']);
    expect(write.items['season-1396-2']).toEqual(expect.objectContaining({ media_type: 'season' }));
    expect(write.metadata.itemCount).toBe(2);
    expect(result.didRemoteChange).toBe(true);
  });
});
