/**
 * Trakt episode entries: episode refs, TMDB number alignment and episode enrichment.
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
  __test__,
  enrichMediaItems,
  needsMediaEnrichment,
  TraktSyncError,
} from '@/functions/src/trakt';
import { createDocSnapshotWithSet, resetTraktMocks } from './helpers/traktHarness';

beforeEach(resetTraktMocks);

describe('Trakt episode entries', () => {
  const {
    buildWatchlistItemsMap,
    getTraktEpisodeRef,
    transformListItem,
  } = require('@/functions/src/trakt') as typeof import('@/functions/src/trakt');
  const { alignTraktEpisodeNumbers } =
    require('@/functions/src/trakt/episodeNumbers') as typeof import('@/functions/src/trakt/episodeNumbers');

  const show = { ids: { slug: 'breaking-bad', tmdb: 1396, trakt: 1 }, title: 'Breaking Bad', year: 2008 };
  const episodeEntry = (
    season: number,
    number: number,
    ids: Record<string, unknown> = { slug: 'e', trakt: 5 },
    listedAt = '2025-12-22T16:33:54.000Z'
  ) => ({
    episode: { ids, number, season, title: 'Phoenix' },
    id: 9,
    listed_at: listedAt,
    rank: 8,
    show,
    type: 'episode' as const,
  });

  describe('getTraktEpisodeRef', () => {
    it('reads the numbers of an episode entry, including zeros', () => {
      expect(getTraktEpisodeRef(episodeEntry(2, 12))).toEqual({ seasonNumber: 2, episodeNumber: 12 });
      expect(getTraktEpisodeRef(episodeEntry(0, 0))).toEqual({ seasonNumber: 0, episodeNumber: 0 });
    });

    it('ignores other entry types and episodes without usable numbers', () => {
      expect(getTraktEpisodeRef({ show, type: 'show' } as any)).toBeUndefined();
      expect(getTraktEpisodeRef({ ...episodeEntry(2, 12), type: 'show' })).toBeUndefined();
      expect(
        getTraktEpisodeRef({ episode: { number: 1.5, season: 2 }, type: 'episode' })
      ).toBeUndefined();
      expect(getTraktEpisodeRef({ episode: { season: 2 } })).toBeUndefined();
    });
  });

  it('keeps a watchlist episode as an episode entry, without an episode name', () => {
    const items = buildWatchlistItemsMap([
      episodeEntry(2, 12) as any,
      { id: 1, listed_at: '2025-01-01T00:00:00.000Z', rank: 1, show, type: 'show' },
    ]);

    expect(Object.keys(items).sort()).toEqual(['episode-1396-2-12', 'tv-1396']);
    expect(items['episode-1396-2-12']).toEqual({
      addedAt: new Date('2025-12-22T16:33:54.000Z').getTime(),
      episode_number: 12,
      id: 1396,
      media_type: 'episode',
      name: 'Breaking Bad · S2E12 · Phoenix',
      season_number: 2,
      show_name: 'Breaking Bad',
      title: 'Breaking Bad · S2E12 · Phoenix',
    });
  });

  it('transforms a custom list episode into an episode entry', () => {
    expect(transformListItem(episodeEntry(2, 12) as any)).toEqual({
      addedAt: new Date('2025-12-22T16:33:54.000Z').getTime(),
      episodeNumber: 12,
      mediaType: 'episode',
      seasonNumber: 2,
      showName: 'Breaking Bad',
      title: 'Breaking Bad · S2E12 · Phoenix',
      tmdbId: 1396,
    });
  });

  it('removes a watchlist show an earlier sync folded from an episode', async () => {
    const listSet = jest.fn().mockResolvedValue(undefined);
    const listedAt = new Date('2025-12-22T16:33:54.000Z').getTime();

    await (__test__ as any).reconcileManagedList(
      'user-1',
      'watchlist',
      buildWatchlistItemsMap([episodeEntry(2, 12) as any]),
      { id: 'watchlist', name: 'Should Watch' },
      createDocSnapshotWithSet(
        'users/user-1/lists/watchlist',
        {
          items: {
            // Written by an earlier sync for S2E12: the show, at the episode's time.
            'tv-1396': { addedAt: listedAt, id: 1396, media_type: 'tv', title: 'Breaking Bad' },
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
    expect(write.items['episode-1396-2-12']).toEqual(
      expect.objectContaining({ media_type: 'episode', episode_number: 12 })
    );
    expect(write.metadata.needsEnrichment).toBe(true);
  });

  describe('alignTraktEpisodeNumbers', () => {
    const lookup = (
      seasons: Record<string, { episodes: { id?: number; episode_number?: number; season_number?: number }[] } | null>,
      finds: Record<string, unknown> = {}
    ) => ({
      getSeason: jest.fn(async (tvId: number, s: number) => seasons[`${tvId}:${s}`] ?? null),
      findEpisode: jest.fn(async (id: string) => (finds[id] as any) ?? null),
    });

    it('makes no request without episode entries', async () => {
      const deps = lookup({});
      const items = [{ id: 1, listed_at: 'x', rank: 1, show, type: 'show' as const }];
      expect(await alignTraktEpisodeNumbers(items, { lookup: deps })).toBe(items);
      expect(deps.getSeason).not.toHaveBeenCalled();
    });

    it("keeps numbers TMDB confirms, with one season request per show and season", async () => {
      const deps = lookup({
        '1396:2': { episodes: [{ id: 62103, episode_number: 12 }, { id: 62104, episode_number: 13 }] },
      });
      const items = [episodeEntry(2, 12, { tmdb: 62103 }), episodeEntry(2, 13)];

      const aligned = await alignTraktEpisodeNumbers(items, { lookup: deps });

      expect(aligned).toEqual(items);
      expect(deps.getSeason).toHaveBeenCalledTimes(1);
      expect(deps.findEpisode).not.toHaveBeenCalled();
    });

    it("takes TMDB's numbers for Trakt's TMDB episode ID within the season", async () => {
      const deps = lookup({ '1396:1': { episodes: [{ id: 777, episode_number: 3, season_number: 1 }] } });

      const [aligned] = await alignTraktEpisodeNumbers([episodeEntry(1, 26, { tmdb: 777 })], { lookup: deps });

      expect(aligned.episode).toMatchObject({ number: 3, season: 1, title: 'Phoenix' });
    });

    it('finds an episode TMDB numbers differently by its TVDB, then IMDb, ID', async () => {
      const deps = lookup(
        { '1396:1': { episodes: [{ id: 1, episode_number: 1 }] } },
        {
          '4242': { tv_episode_results: [{ show_id: 999, season_number: 5, episode_number: 5 }] },
          tt42: { tv_episode_results: [{ show_id: 1396, season_number: 3, episode_number: 2 }] },
        }
      );

      const [aligned] = await alignTraktEpisodeNumbers(
        [episodeEntry(1, 64, { imdb: 'tt42', tvdb: 4242 })],
        { lookup: deps }
      );

      // The TVDB match belongs to another show, so the IMDb one is used.
      expect(deps.findEpisode.mock.calls).toEqual([
        ['4242', 'tvdb_id'],
        ['tt42', 'imdb_id'],
      ]);
      expect(aligned.episode).toMatchObject({ number: 2, season: 3 });
    });

    const asShow = (item: ReturnType<typeof episodeEntry>) => {
      const { episode: _episode, ...rest } = item;
      return { ...rest, type: 'show' };
    };

    it('saves an episode TMDB has nowhere as its show, so it always opens', async () => {
      const deps = lookup({ '1396:9': { episodes: [{ id: 5, episode_number: 2 }] } });
      const item = episodeEntry(9, 1, { tvdb: 1 });

      expect(await alignTraktEpisodeNumbers([item], { lookup: deps })).toEqual([asShow(item)]);
    });

    it("keeps Trakt's numbers when TMDB has an episode there and nothing says otherwise", async () => {
      const deps = lookup({ '1396:2': { episodes: [{ id: 999, episode_number: 12 }] } });
      // Trakt's TMDB ID isn't in the season and /find knows nothing better.
      const item = episodeEntry(2, 12, { tmdb: 62103, tvdb: 7 });

      expect(await alignTraktEpisodeNumbers([item], { lookup: deps })).toEqual([item]);
      expect(deps.findEpisode).toHaveBeenCalledWith('7', 'tvdb_id');
    });

    it('drops the show entry when Trakt lists the show itself, or another episode became it', async () => {
      const deps = lookup({});
      const showItem = { id: 1, listed_at: 'x', rank: 1, show, type: 'show' as const };
      const missingA = episodeEntry(9, 1);
      const missingB = episodeEntry(9, 2);

      expect(await alignTraktEpisodeNumbers([missingA, missingB], { lookup: deps })).toEqual([asShow(missingA)]);
      expect(await alignTraktEpisodeNumbers([missingA, showItem], { lookup: deps })).toEqual([showItem]);
    });

    it('retries a rate-limited lookup before giving up', async () => {
      const { TraktSyncError: SyncError } = require('@/functions/src/trakt/types');
      const getSeason = jest
        .fn()
        .mockRejectedValueOnce(
          new SyncError('rate limited', 'rate_limited', true, { retryAfterSeconds: 0 })
        )
        .mockResolvedValueOnce({ episodes: [{ id: 62103, episode_number: 12 }] });
      const item = episodeEntry(2, 12, { tmdb: 62103 });

      expect(
        await alignTraktEpisodeNumbers([item], { lookup: { getSeason, findEpisode: jest.fn() } })
      ).toEqual([item]);
      expect(getSeason).toHaveBeenCalledTimes(2);
    });

    it('fails instead of guessing when a lookup fails, so confirmed episodes are never replaced', async () => {
      const failing = {
        getSeason: jest.fn(async () => {
          throw new TraktSyncError('TMDB is temporarily unavailable.', 'upstream_unavailable', true);
        }),
        findEpisode: jest.fn(async () => null),
      };
      const items = [episodeEntry(1, 64, { tvdb: 1 }), episodeEntry(2, 5, { tvdb: 2 })];

      await expect(alignTraktEpisodeNumbers(items, { lookup: failing })).rejects.toMatchObject({
        category: 'tmdb_unavailable',
        retryable: true,
      });
      expect(failing.findEpisode).not.toHaveBeenCalled();
    });

    it('saves episodes past the request budget as their show', async () => {
      const items = [episodeEntry(1, 64, { tvdb: 1 }), episodeEntry(2, 5, { tvdb: 2 })];
      // The first episode is confirmed; the budget then runs out, so the second is the show.
      const budgeted = lookup({ '1396:1': { episodes: [{ id: 1, episode_number: 64 }] } });
      expect(await alignTraktEpisodeNumbers(items, { lookup: budgeted, maxLookups: 1 })).toEqual([
        items[0],
        asShow(items[1]),
      ]);
      expect(budgeted.getSeason).toHaveBeenCalledTimes(1);
    });

    it('shares one season cache and budget across the watchlist and every list in a run', async () => {
      const { createEpisodeNumberSession } =
        require('@/functions/src/trakt/episodeNumbers') as typeof import('@/functions/src/trakt/episodeNumbers');
      const deps = lookup({ '1396:2': { episodes: [{ id: 62103, episode_number: 12 }] } });
      const session = createEpisodeNumberSession({ lookup: deps, maxLookups: 1 });
      const item = episodeEntry(2, 12, { tmdb: 62103 });

      expect(await alignTraktEpisodeNumbers([item], { session })).toEqual([item]);
      expect(await alignTraktEpisodeNumbers([item], { session })).toEqual([item]);
      expect(deps.getSeason).toHaveBeenCalledTimes(1);

      // The run's single request is spent, so a new season can't be checked.
      const other = episodeEntry(3, 1, { tmdb: 1 });
      expect(await alignTraktEpisodeNumbers([other], { session })).toEqual([asShow(other)]);
    });

    it('turns a show entry folded from an unconfirmed episode into the episode once confirmed', async () => {
      const listSet = jest.fn().mockResolvedValue(undefined);
      const item = episodeEntry(2, 12, { tmdb: 62103 });
      const listedAt = new Date(item.listed_at).getTime();
      const confirmed = await alignTraktEpisodeNumbers([item], {
        lookup: lookup({ '1396:2': { episodes: [{ id: 62103, episode_number: 12 }] } }),
      });

      await (__test__ as any).reconcileManagedList(
        'user-1',
        'watchlist',
        buildWatchlistItemsMap(confirmed as any),
        { id: 'watchlist', name: 'Should Watch' },
        createDocSnapshotWithSet(
          'users/user-1/lists/watchlist',
          {
            // Saved as the show by an earlier sync that couldn't confirm the episode.
            items: { 'tv-1396': { addedAt: listedAt, id: 1396, media_type: 'tv' } },
            metadata: { itemCount: 1, needsEnrichment: false },
            name: 'Should Watch',
          },
          listSet
        ),
        { preserveLocalItems: true, recencyField: 'addedAt', removeFoldedSeasonShows: true }
      );

      const write = listSet.mock.calls[0][0];
      expect(write.items['tv-1396']).toBe('FIELD_DELETE');
      expect(write.items['episode-1396-2-12']).toEqual(
        expect.objectContaining({ media_type: 'episode' })
      );
    });
  });

  describe('enriching episode entries', () => {
    const tmdbResponse = (body: unknown, status = 200) => ({
      headers: { get: () => null },
      json: jest.fn().mockResolvedValue(body),
      ok: status < 400,
      status,
    });
    const syncedEpisode = (s: number, e: number) => ({
      addedAt: 1,
      episode_number: e,
      id: 1396,
      media_type: 'episode',
      name: `Breaking Bad · S${s}E${e}`,
      season_number: s,
      show_name: 'Breaking Bad',
      title: `Breaking Bad · S${s}E${e}`,
    });
    const tmdbShow = {
      first_air_date: '2008-01-20',
      genres: [{ id: 18 }],
      name: 'Breaking Bad',
      poster_path: '/show.jpg',
      vote_average: 8.9,
    };

    it('flags synced episodes, but not episodes the app saved complete', () => {
      expect(needsMediaEnrichment(syncedEpisode(2, 12))).toBe(true);
      expect(
        needsMediaEnrichment({ ...syncedEpisode(2, 12), poster_path: null, episode_name: 'Phoenix' })
      ).toBe(false);
      expect(needsMediaEnrichment({ id: 1396, media_type: 'episode', season_number: 2 })).toBe(false);
    });

    it("fills in a show's episodes and seasons from one TMDB call", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        tmdbResponse({
          ...tmdbShow,
          'season/2': {
            air_date: '2009-03-08',
            episodes: [
              {
                air_date: '2009-05-24',
                episode_number: 12,
                name: 'Phoenix',
                runtime: 47,
                still_path: '/phoenix.jpg',
                vote_average: 9.1,
              },
            ],
            name: 'Season 2',
            poster_path: '/s2.jpg',
          },
        })
      );

      const enriched = await enrichMediaItems({
        'episode-1396-2-12': syncedEpisode(2, 12),
        'episode-1396-2-99': syncedEpisode(2, 99),
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain(
        '/tv/1396?append_to_response=season/2'
      );
      expect(enriched['episode-1396-2-12']).toMatchObject({
        episode_name: 'Phoenix',
        episodeRuntimeMinutes: 47,
        first_air_date: '2009-05-24',
        genre_ids: [18],
        poster_path: '/s2.jpg',
        release_date: '2009-05-24',
        runtimeMinutes: 47,
        still_path: '/phoenix.jpg',
        // The synced title stays, so the next sync doesn't see a change.
        title: 'Breaking Bad · S2E12',
        vote_average: 9.1,
      });
      // An episode TMDB doesn't have gets the show's details, so it isn't looked up again.
      expect(enriched['episode-1396-2-99']).toMatchObject({
        episode_name: 'Episode 99',
        poster_path: '/s2.jpg',
        still_path: null,
        vote_average: 8.9,
      });
      expect(needsMediaEnrichment(enriched['episode-1396-2-99'])).toBe(false);
    });
  });
});
