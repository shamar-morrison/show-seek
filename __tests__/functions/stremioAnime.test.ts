const mockFirestore = jest.fn();
const mockFetch = jest.fn();
jest.mock('firebase-admin', () => ({ firestore: mockFirestore }), { virtual: true });
jest.mock('firebase-admin/firestore', () => ({
  Timestamp: require('./helpers/stremioFirestore').TestTimestamp,
  FieldValue: { delete: () => require('./helpers/stremioFirestore').DELETE_FIELD },
}), { virtual: true });
jest.mock('firebase-functions/params', () => ({ defineSecret: () => ({ value: () => 'tmdb-secret' }) }), { virtual: true });

import { stremioAddon } from '@/functions/src/stremioAddon';
import { buildAnimeIndex, clearAnimeListCache, loadAnimeIndex } from '@/functions/src/stremio/animeLists';
import { ANIME_LIST_RETRY_AFTER_MS, ANIME_LIST_TTL_MS } from '@/functions/src/stremio/constants';
import { parsePlayerEvent } from '@/functions/src/stremio/parsing';
import { clearStremioTmdbCache } from '@/functions/src/stremio/tmdb';
import { clearStremioStopRateLimit, clearStremioTokenCache, hashAddonToken } from '@/functions/src/stremio/tokens';
import { TestFirestore, TestTimestamp } from './helpers/stremioFirestore';

const TOKEN = '1'.repeat(64);
const HASH = hashAddonToken(TOKEN);
const NOW = Date.UTC(2026, 9, 20, 12);
const originalFetch = global.fetch;
let db: TestFirestore;
let log: jest.SpyInstance;

const EXTRAS = 'action=stop&currentTime=1400000&duration=1440000';
async function request(type: string, id: string) {
  const res = { setHeader: jest.fn(), status: jest.fn(), json: jest.fn(), send: jest.fn() };
  res.status.mockReturnValue(res);
  await (stremioAddon as any)({ path: `/${TOKEN}/player/${type}/${encodeURIComponent(id)}/${EXTRAS}.json`, method: 'GET' }, res);
  return res;
}

const ok = (data: unknown) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => data });
const notFound = { ok: false, status: 404, headers: { get: () => null }, json: async () => ({}) };

// Routes on the request URL without its query string, so assertions never depend on the API key.
type Route = unknown | (() => unknown);
let routes: Record<string, Route>;
const requested = () => mockFetch.mock.calls.map(([url]: [string]) => url.split('?')[0]);
function route(url: string) {
  const { origin, pathname, searchParams } = new URL(url);
  const source = searchParams.get('external_source');
  const key = `${origin}${pathname}${source ? `?${source}` : ''}`;
  if (!(key in routes)) return notFound;
  const value = routes[key];
  return typeof value === 'function' ? value() : ok(value);
}

const TMDB = 'https://api.themoviedb.org/3';
const CINEMETA = 'https://v3-cinemeta.strem.io/meta/series';
const KITSU = 'https://anime-kitsu.strem.fun/meta';
const LIST = 'https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-full.json';

const anime = (id: number, name: string, seasons: [number, number][]) => ({
  id, name, poster_path: `/${id}.jpg`, first_air_date: '1999-10-20', vote_average: 8,
  genres: [{ id: 16 }, { id: 10759 }], origin_country: ['JP'], original_language: 'ja',
  seasons: seasons.map(([season_number, episode_count]) => ({ season_number, episode_count })),
});
const episode = (id: number, season: number, number: number) => ({
  id, season_number: season, episode_number: number, name: `Episode ${number}`, air_date: '2022-10-11', runtime: 24,
});
const season = (number: number, first: number, count: number, idBase = number * 1000) => ({
  season_number: number,
  episodes: Array.from({ length: count }, (_, i) => episode(idBase + first + i, number, first + i)),
});
// The list loader rejects anything shorter than a full list; padding entries have no TMDB IDs.
const animeList = (entries: Record<string, unknown>[]) =>
  [...entries, ...Array.from({ length: 1000 }, (_, i) => ({ kitsu_id: 900000 + i }))];
const tracked = (showId: number) => db.data(`users/member/episode_tracking/${showId}`)?.episodes;
const lastLog = () => log.mock.calls.at(-1)?.[1];

beforeEach(() => {
  db = new TestFirestore();
  db.seed(`stremioAddonTokens/${HASH}`, { uid: 'member', createdAt: TestTimestamp.fromMillis(NOW) });
  db.seed('users/member', { stremioAddon: { activeTokenHash: HASH } });
  mockFirestore.mockReset().mockReturnValue(db);
  routes = {};
  mockFetch.mockReset().mockImplementation(async (url: string) => route(url));
  global.fetch = mockFetch;
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  log = jest.spyOn(console, 'info').mockImplementation(() => {});
  clearStremioTokenCache();
  clearStremioStopRateLimit();
  clearStremioTmdbCache();
  clearAnimeListCache();
});
afterEach(() => { jest.restoreAllMocks(); });
afterAll(() => { global.fetch = originalFetch; });

describe('Kitsu ID parsing', () => {
  it('parses Anime Kitsu episode and movie IDs', () => {
    expect(parsePlayerEvent('series', 'kitsu%3A49444%3A1', EXTRAS)).toEqual({
      action: 'stop', type: 'series', kitsuId: 49444, episode: 1, currentTime: 1400000, duration: 1440000,
    });
    expect(parsePlayerEvent('movie', 'kitsu:11614', EXTRAS)).toEqual({
      action: 'stop', type: 'movie', kitsuId: 11614, currentTime: 1400000, duration: 1440000,
    });
  });

  it.each([
    ['series', 'kitsu:49444'], ['series', 'kitsu:49444:0'], ['series', 'kitsu:0:1'], ['series', 'kitsu:1:2:3'],
    ['series', 'kitsu:abc:1'], ['series', 'kitsu%253A1%253A1'], ['series', 'KITSU:1:1'], ['movie', 'kitsu:1:1'],
    ['movie', 'kitsu:'], ['series', 'mal:1:1'],
  ])('fails soft on malformed %s ID %s', (type, id) => {
    expect(parsePlayerEvent(type, id, EXTRAS)).toBeNull();
  });
});

describe('anime list index', () => {
  it('rejects a truncated list and keeps only TMDB-mapped Kitsu entries', () => {
    expect(buildAnimeIndex([{ kitsu_id: 1, themoviedb_id: { tv: 2 } }])).toBeNull();
    expect(buildAnimeIndex({ items: [] })).toBeNull();
    const index = buildAnimeIndex(animeList([
      { kitsu_id: 1, themoviedb_id: { tv: 10 }, season: { tmdb: 2 }, episode_offset: { tmdb: 13 } },
      { kitsu_id: 2, themoviedb_id: { movie: [20, 20] } },
      { kitsu_id: 3, themoviedb_id: { tv: -1 } },
      { kitsu_id: 4 },
    ]))!;
    expect(index.get(1)).toEqual({ tmdbTvId: 10, tmdbMovieIds: [], tmdbSeason: 2, episodeOffset: 13, ambiguous: false });
    expect(index.get(2)).toEqual({ tmdbTvId: undefined, tmdbMovieIds: [20], tmdbSeason: undefined, episodeOffset: 0, ambiguous: false });
    expect(index.has(3)).toBe(false);
    expect(index.has(4)).toBe(false);
  });

  it('flags Kitsu entries that claim the same TMDB episodes', () => {
    const index = buildAnimeIndex(animeList([
      // Two cours in one TMDB season, told apart by their offsets.
      { kitsu_id: 1, themoviedb_id: { tv: 10 }, season: { tmdb: 1 } },
      { kitsu_id: 2, themoviedb_id: { tv: 10 }, season: { tmdb: 1 }, episode_offset: { tmdb: 12 } },
      // Two specials in season 0 without offsets.
      { kitsu_id: 3, themoviedb_id: { tv: 10 }, season: { tmdb: 0 } },
      { kitsu_id: 4, themoviedb_id: { tv: 10 }, season: { tmdb: 0 } },
      // A seasonless long runner beside season 0 specials only.
      { kitsu_id: 5, themoviedb_id: { tv: 50 } },
      { kitsu_id: 6, themoviedb_id: { tv: 50 }, season: { tmdb: 0 } },
      // A seasonless entry beside a regular season cannot be walked safely.
      { kitsu_id: 7, themoviedb_id: { tv: 70 } },
      { kitsu_id: 8, themoviedb_id: { tv: 70 }, season: { tmdb: 2 } },
      // A Kitsu ID listed twice with conflicting targets, and one listed twice identically.
      { kitsu_id: 9, themoviedb_id: { tv: 90 }, season: { tmdb: 1 } },
      { kitsu_id: 9, themoviedb_id: { tv: 91 }, season: { tmdb: 1 } },
      { kitsu_id: 11, themoviedb_id: { tv: 110 }, season: { tmdb: 1 } },
      { kitsu_id: 11, themoviedb_id: { tv: 110 }, season: { tmdb: 1 } },
    ]))!;
    const ambiguous = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11].filter((id) => index.get(id)?.ambiguous);
    expect(ambiguous).toEqual([3, 4, 7, 9]);
  });

  it('caches for a day, serves a stale copy when a refresh fails, and backs off after failures', async () => {
    const list = animeList([{ kitsu_id: 1, themoviedb_id: { tv: 10 }, season: { tmdb: 1 } }]);
    const download = jest.fn().mockResolvedValue(list);
    const first = await loadAnimeIndex(download);
    expect(first?.get(1)?.tmdbTvId).toBe(10);
    await loadAnimeIndex(download);
    expect(download).toHaveBeenCalledTimes(1);

    jest.spyOn(Date, 'now').mockReturnValue(NOW + ANIME_LIST_TTL_MS);
    download.mockRejectedValueOnce(new Error('offline'));
    expect(await loadAnimeIndex(download)).toBe(first);
    expect(await loadAnimeIndex(download)).toBe(first);
    expect(download).toHaveBeenCalledTimes(2);

    jest.spyOn(Date, 'now').mockReturnValue(NOW + ANIME_LIST_TTL_MS + ANIME_LIST_RETRY_AFTER_MS);
    expect(await loadAnimeIndex(download)).not.toBe(first);
    expect(download).toHaveBeenCalledTimes(3);
  });

  it('shares one download between concurrent loads and returns null when nothing ever loaded', async () => {
    const download = jest.fn().mockResolvedValue([]);
    expect(await Promise.all([loadAnimeIndex(download), loadAnimeIndex(download)])).toEqual([null, null]);
    expect(download).toHaveBeenCalledTimes(1);
  });
});

describe('Cinemeta anime episodes', () => {
  it('maps a Cinemeta season split onto a continuously numbered TMDB season by TVDB episode ID', async () => {
    routes = {
      [`${TMDB}/find/tt0388629?imdb_id`]: { tv_results: [{ id: 37854 }] },
      [`${TMDB}/tv/37854`]: anime(37854, 'One Piece', [[1, 61], [2, 16]]),
      [`${CINEMETA}/tt0388629.json`]: { meta: { videos: [{ season: 2, episode: 1, tvdb_id: 361897 }, { season: 2, episode: 2, tvdb_id: 361898 }] } },
      [`${TMDB}/find/361897?tvdb_id`]: { tv_episode_results: [{ ...episode(1152978, 1, 9), show_id: 37854 }] },
    };
    await request('series', 'tt0388629:2:1');
    expect(tracked(37854)).toEqual({
      '1_9': expect.objectContaining({ episodeId: 1152978, tvShowId: 37854, seasonNumber: 1, episodeNumber: 9 }),
    });
    expect(lastLog()).toMatchObject({ outcome: 'written' });
  });

  it('never records an earlier Cinemeta season as a same-numbered later TMDB season', async () => {
    // Bleach: Cinemeta S2E1 is TMDB S1E21, while TMDB S2 is Thousand-Year Blood War.
    routes = {
      [`${TMDB}/find/tt0434665?imdb_id`]: { tv_results: [{ id: 30984 }] },
      [`${TMDB}/tv/30984`]: anime(30984, 'Bleach', [[1, 366], [2, 50]]),
      [`${TMDB}/tv/30984/season/2`]: season(2, 1, 50),
      [`${CINEMETA}/tt0434665.json`]: { meta: { videos: [{ season: 2, episode: 1, tvdb_id: 155091 }] } },
      [`${TMDB}/find/155091?tvdb_id`]: { tv_episode_results: [{ ...episode(5021, 1, 21), show_id: 30984 }] },
    };
    await request('series', 'tt0434665:2:1');
    expect(Object.keys(tracked(30984))).toEqual(['1_21']);
    expect(requested()).not.toContain(`${TMDB}/tv/30984/season/2`);
  });

  // Bleach: Thousand-Year Blood War's IMDb ID now finds a stray one-episode, non-anime TMDB
  // show (340620). Its episodes live in TMDB Bleach (30984) season 2.
  const strayTybw = {
    id: 340620, name: 'Bleach: Thousand-Year Blood War', poster_path: null, first_air_date: '2022-10-10',
    vote_average: 0, genres: [], origin_country: ['US'], original_language: 'en',
    seasons: [{ season_number: 1, episode_count: 1 }],
  };
  const tybwRoutes = (tvResults: unknown[]) => ({
    [`${TMDB}/find/tt14986406?imdb_id`]: { tv_results: tvResults },
    [`${TMDB}/tv/340620`]: strayTybw,
    [`${TMDB}/tv/340620/season/1`]: { season_number: 1, episodes: [episode(8041224, 1, 1)] },
    [`${CINEMETA}/tt14986406.json`]: {
      meta: {
        videos: [
          { season: 1, episode: 1, imdb_id: 'tt17073864' },
          { season: 4, episode: 1, imdb_id: 'tt39128668' },
          { season: 4, episode: 5, imdb_id: 'tt43711315' },
        ],
      },
    },
    [`${TMDB}/find/tt17073864?imdb_id`]: { tv_episode_results: [{ ...episode(9001, 2, 1), show_id: 30984 }] },
    [`${TMDB}/find/tt39128668?imdb_id`]: { tv_episode_results: [{ ...episode(9041, 2, 41), show_id: 30984 }] },
    [`${TMDB}/find/tt43711315?imdb_id`]: { tv_episode_results: [{ ...episode(9045, 2, 45), show_id: 30984 }] },
    [`${TMDB}/tv/30984`]: anime(30984, 'Bleach', [[1, 366], [2, 50]]),
  });

  describe.each([
    ['a stray non-anime TMDB show', [{ id: 340620 }]],
    ['no TMDB show', []],
  ])('when the series IMDb ID finds %s', (_label, tvResults) => {
    it.each([
      ['tt14986406:4:5', '2_45', 9045],
      ['tt14986406:4:1', '2_41', 9041],
      ['tt14986406:1:1', '2_1', 9001],
    ])('maps %s to Bleach (30984) by the episode IMDb ID', async (id, key, episodeId) => {
      routes = tybwRoutes(tvResults);
      await request('series', id);
      expect(Object.keys(tracked(30984))).toEqual([key]);
      expect(tracked(30984)?.[key]).toMatchObject({ episodeId, tvShowId: 30984 });
      expect(db.data('users/member/episode_tracking/30984')?.metadata.tvShowName).toBe('Bleach');
      expect(db.data('users/member/episode_tracking/340620')).toBeUndefined();
      expect(requested().some((url) => url.startsWith(`${TMDB}/tv/340620`))).toBe(false);
      expect(lastLog()).toMatchObject({ outcome: 'written', videoId: id, tmdb: `tv:30984:S${key.replace('_', 'E')}` });
    });
  });

  it('skips rather than guesses when Cinemeta has no episode ID and the stray show lacks the season', async () => {
    routes = tybwRoutes([{ id: 340620 }]);
    routes[`${CINEMETA}/tt14986406.json`] = { meta: { videos: [{ season: 4, episode: 5 }] } };
    await request('series', 'tt14986406:4:5');
    expect(db.writes).toHaveLength(0);
    expect(lastLog()).toMatchObject({ outcome: 'skipped_unmapped', videoId: 'tt14986406:4:5' });
  });

  it('tries the IMDb episode ID when the TVDB one is unknown to TMDB', async () => {
    routes = {
      [`${TMDB}/find/tt1?imdb_id`]: { tv_results: [{ id: 5 }] },
      [`${TMDB}/tv/5`]: anime(5, 'Anime', [[1, 24]]),
      [`${CINEMETA}/tt1.json`]: { meta: { videos: [{ season: 1, episode: 3, tvdb_id: 77, imdb_id: 'tt99' }] } },
      [`${TMDB}/find/77?tvdb_id`]: { tv_episode_results: [] },
      [`${TMDB}/find/tt99?imdb_id`]: { tv_episode_results: [{ ...episode(503, 1, 3), show_id: 5 }] },
    };
    await request('series', 'tt1:1:3');
    expect(Object.keys(tracked(5))).toEqual(['1_3']);
    // The episode's show matches the IMDb show, so its details are not fetched twice.
    expect(requested().filter((url) => url === `${TMDB}/tv/5`)).toHaveLength(1);
  });

  it('falls back to matching numbers, with the continuous-numbering guard, when Cinemeta has no episode IDs', async () => {
    routes = {
      [`${TMDB}/find/tt1?imdb_id`]: { tv_results: [{ id: 5 }] },
      [`${TMDB}/tv/5`]: anime(5, 'Anime', [[1, 12], [2, 12]]),
      [`${CINEMETA}/tt1.json`]: { meta: { videos: [{ season: 2, episode: 1 }] } },
      [`${TMDB}/tv/5/season/2`]: season(2, 13, 12),
    };
    await request('series', 'tt1:2:1');
    expect(db.writes).toHaveLength(0);
    expect(lastLog()).toMatchObject({ outcome: 'skipped_unmapped', reason: 'continuous_numbering_unsupported' });

    routes[`${TMDB}/tv/5/season/2`] = season(2, 1, 12);
    await request('series', 'tt1:2:4');
    expect(Object.keys(tracked(5))).toEqual(['2_4']);
  });

  it('writes nothing when Cinemeta fails for an anime', async () => {
    routes = {
      [`${TMDB}/find/tt1?imdb_id`]: { tv_results: [{ id: 5 }] },
      [`${TMDB}/tv/5`]: anime(5, 'Anime', [[1, 12], [2, 12]]),
      [`${TMDB}/tv/5/season/2`]: season(2, 1, 12),
      [`${CINEMETA}/tt1.json`]: () => ({ ok: false, status: 503, headers: { get: () => null }, json: async () => ({}) }),
    };
    const res = await request('series', 'tt1:2:1');
    expect(res.json).toHaveBeenCalledWith({ success: true });
    expect(db.writes).toHaveLength(0);
    expect(lastLog()).toMatchObject({ outcome: 'error', reason: 'http_error', statusCode: 503 });
  });

});

describe('regular Cinemeta shows', () => {
  const regularShow = { ...anime(6, 'Animated, not Japanese', [[1, 10]]), origin_country: ['US'], original_language: 'en' };
  const regularRoutes = () => ({
    [`${TMDB}/find/tt2?imdb_id`]: { tv_results: [{ id: 6 }] },
    [`${TMDB}/tv/6`]: regularShow,
    [`${TMDB}/tv/6/season/1`]: season(1, 1, 10),
  });

  it('resolves the same episode through its TVDB ID, with no extra TMDB requests', async () => {
    routes = {
      ...regularRoutes(),
      [`${CINEMETA}/tt2.json`]: { meta: { videos: [{ season: 1, episode: 2, tvdb_id: 602 }] } },
      [`${TMDB}/find/602?tvdb_id`]: { tv_episode_results: [{ ...episode(1002, 1, 2), show_id: 6 }] },
    };
    await request('series', 'tt2:1:2');
    expect(tracked(6)).toEqual({ '1_2': expect.objectContaining({ episodeId: 1002, seasonNumber: 1, episodeNumber: 2 }) });
    // Three TMDB requests, as matching numbers took: the episode lookup replaces the season fetch.
    expect(requested().filter((url) => url.startsWith(TMDB))).toEqual([
      `${TMDB}/find/tt2`, `${TMDB}/find/602`, `${TMDB}/tv/6`,
    ]);
  });

  it('falls back to matching numbers when Cinemeta lists no episode IDs', async () => {
    routes = { ...regularRoutes(), [`${CINEMETA}/tt2.json`]: { meta: { videos: [{ season: 1, episode: 2 }] } } };
    await request('series', 'tt2:1:2');
    expect(tracked(6)).toEqual({ '1_2': expect.objectContaining({ episodeId: 1002, seasonNumber: 1, episodeNumber: 2 }) });
  });

  it('keeps matching numbers through a Cinemeta outage', async () => {
    routes = {
      ...regularRoutes(),
      [`${CINEMETA}/tt2.json`]: () => ({ ok: false, status: 503, headers: { get: () => null }, json: async () => ({}) }),
    };
    await request('series', 'tt2:1:2');
    expect(Object.keys(tracked(6))).toEqual(['1_2']);
    expect(lastLog()).toMatchObject({ outcome: 'written', videoId: 'tt2:1:2', tmdb: 'tv:6:S1E2' });
  });
});

describe('Anime Kitsu episodes', () => {
  const bleachList = animeList([
    { kitsu_id: 244, themoviedb_id: { tv: 30984 }, season: { tmdb: 1 } },
    { kitsu_id: 43078, themoviedb_id: { tv: 30984 }, season: { tmdb: 2 } },
    { kitsu_id: 49444, themoviedb_id: { tv: 30984 }, season: { tmdb: 2 }, episode_offset: { tmdb: 40 } },
    { kitsu_id: 12, themoviedb_id: { tv: 37854 } },
    { kitsu_id: 1200, themoviedb_id: { tv: 37854 }, season: { tmdb: 0 } },
    { kitsu_id: 11614, themoviedb_id: { movie: [372058] } },
  ]);

  it('maps a later cour by its TMDB season offset', async () => {
    routes = {
      [LIST]: bleachList,
      [`${TMDB}/tv/30984`]: anime(30984, 'Bleach', [[1, 366], [2, 50]]),
      [`${TMDB}/tv/30984/season/2`]: season(2, 1, 50),
    };
    await request('series', 'kitsu:49444:1');
    expect(tracked(30984)).toEqual({
      '2_41': expect.objectContaining({ episodeId: 2041, tvShowId: 30984, seasonNumber: 2, episodeNumber: 41 }),
    });
    expect(requested().some((url) => url.startsWith(KITSU))).toBe(false);
  });

  it('walks a seasonless long-running entry across continuously numbered TMDB seasons', async () => {
    routes = {
      [LIST]: bleachList,
      [`${TMDB}/tv/37854`]: anime(37854, 'One Piece', [[0, 5], [1, 61], [2, 16]]),
      [`${TMDB}/tv/37854/season/2`]: season(2, 62, 16),
    };
    await request('series', 'kitsu:12:70');
    expect(Object.keys(tracked(37854))).toEqual(['2_70']);
    expect(requested()).not.toContain(`${TMDB}/tv/37854/season/1`);
  });

  it('refuses a walked episode whose continuous number disagrees with stale season counts', async () => {
    routes = {
      [LIST]: bleachList,
      [`${TMDB}/tv/37854`]: anime(37854, 'One Piece', [[1, 60], [2, 16]]),
      [`${TMDB}/tv/37854/season/2`]: season(2, 62, 16),
    };
    await request('series', 'kitsu:12:70');
    expect(db.writes).toHaveLength(0);
    expect(lastLog()).toMatchObject({ outcome: 'skipped_unmapped', reason: 'no_matching_tmdb_title_or_episode' });
  });

  it('falls back to the Anime Kitsu IMDb mapping when the list points past a TMDB season', async () => {
    routes = {
      [LIST]: animeList([{ kitsu_id: 45857, themoviedb_id: { tv: 95479 }, season: { tmdb: 2 } }]),
      [`${TMDB}/tv/95479`]: anime(95479, 'JUJUTSU KAISEN', [[1, 59]]),
      [`${KITSU}/series/kitsu:45857.json`]: {
        meta: { id: 'kitsu:45857', videos: [{ id: 'kitsu:45857:1', imdb_id: 'tt12343534', imdbSeason: 2, imdbEpisode: 1 }] },
      },
      [`${CINEMETA}/tt12343534.json`]: { meta: { videos: [{ season: 2, episode: 1, tvdb_id: 9 }] } },
      [`${TMDB}/find/9?tvdb_id`]: { tv_episode_results: [{ ...episode(1025, 1, 25), show_id: 95479 }] },
    };
    await request('series', 'kitsu:45857:1');
    expect(Object.keys(tracked(95479))).toEqual(['1_25']);
  });

  it('logs why an ambiguous or unknown Kitsu entry was skipped', async () => {
    routes = {
      [LIST]: animeList([
        { kitsu_id: 1, themoviedb_id: { tv: 10 }, season: { tmdb: 1 } },
        { kitsu_id: 2, themoviedb_id: { tv: 10 }, season: { tmdb: 1 } },
      ]),
    };
    await request('series', 'kitsu:1:1');
    expect(lastLog()).toMatchObject({ outcome: 'skipped_unmapped', reason: 'kitsu_mapping_ambiguous' });
    await request('series', 'kitsu:3:1');
    expect(lastLog()).toMatchObject({ outcome: 'skipped_unmapped', reason: 'kitsu_mapping_missing' });
    expect(db.writes).toHaveLength(0);
    expect(requested().filter((url) => url === LIST)).toHaveLength(1);
  });

  it('records a Kitsu movie', async () => {
    routes = {
      [LIST]: bleachList,
      [`${TMDB}/movie/372058`]: { id: 372058, title: 'Your Name.', runtime: 106, release_date: '2016-08-26', genres: [{ id: 16 }] },
    };
    await request('movie', 'kitsu:11614');
    expect(db.data('users/member/watched_movies/372058/watches/stremio-372058-20261020')).toBeDefined();
    expect(db.data('users/member/lists/already-watched')?.items['movie-372058']).toMatchObject({ title: 'Your Name.', runtimeMinutes: 106 });
  });

  it('still maps through Anime Kitsu while the list is down, and reports the outage otherwise', async () => {
    routes = {
      [`${KITSU}/movie/kitsu:11614.json`]: { meta: { id: 'kitsu:11614', imdb_id: 'tt5311514' } },
      [`${TMDB}/find/tt5311514?imdb_id`]: { movie_results: [{ id: 372058 }] },
      [`${TMDB}/movie/372058`]: { id: 372058, title: 'Your Name.', runtime: 106 },
    };
    await request('movie', 'kitsu:11614');
    expect(lastLog()).toMatchObject({ outcome: 'written' });

    await request('series', 'kitsu:49444:1');
    expect(lastLog()).toMatchObject({ outcome: 'error', reason: 'anime_list_unavailable' });
    // The failed download is not retried on every event.
    expect(requested().filter((url) => url === LIST)).toHaveLength(1);
    const logs = JSON.stringify(log.mock.calls);
    expect(logs).not.toContain(TOKEN);
    expect(logs).not.toContain('https://');
    expect(logs).not.toContain('tmdb-secret');
  });

  it('caches mapped Kitsu episodes like Cinemeta ones', async () => {
    routes = {
      [LIST]: bleachList,
      [`${TMDB}/tv/30984`]: anime(30984, 'Bleach', [[1, 366], [2, 50]]),
      [`${TMDB}/tv/30984/season/2`]: season(2, 1, 50),
    };
    await request('series', 'kitsu:49444:1');
    const calls = mockFetch.mock.calls.length;
    await request('series', 'kitsu:49444:1');
    expect(mockFetch.mock.calls.length).toBe(calls);
    expect(lastLog()).toMatchObject({ outcome: 'skipped_duplicate' });
  });
});
