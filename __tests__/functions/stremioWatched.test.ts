const mockFirestore = jest.fn();
const mockFetch = jest.fn();
jest.mock('firebase-admin', () => ({ firestore: mockFirestore }), { virtual: true });
jest.mock('firebase-admin/firestore', () => ({
  Timestamp: require('./helpers/stremioFirestore').TestTimestamp,
  FieldValue: { delete: () => require('./helpers/stremioFirestore').DELETE_FIELD },
}), { virtual: true });

import { resolveStremioTitle, type MappedTitle } from '@/functions/src/stremio/tmdb';
import { writeStremioWatch } from '@/functions/src/stremio/watched';
import type { PlayerEvent } from '@/functions/src/stremio/parsing';
import { TestFirestore, TestTimestamp } from './helpers/stremioFirestore';

const HASH = 'a'.repeat(64);
const NOW = Date.UTC(2026, 9, 20, 12);
const USER = 'users/member';
const WATCH = `${USER}/watched_movies/42/watches/stremio-42-20261020`;
const TRACKING = `${USER}/episode_tracking/46298`;
const movie: MappedTitle = {
  kind: 'movie', movie: { id: 42, title: 'Movie', runtime: 120, poster_path: '/movie.jpg', release_date: '2020-01-01', vote_average: 8, genres: [{ id: 18 }] },
};
const episode: MappedTitle = {
  kind: 'episode',
  show: { id: 46298, name: 'Hunter x Hunter', poster_path: '/hxh.jpg', first_air_date: '2011-10-02', vote_average: 9, genres: [{ id: 16 }] },
  episode: { id: 777, season_number: 2, episode_number: 63, name: 'Season Two Premiere', air_date: '2012-12-15', runtime: 24 },
};
const movieEvent: PlayerEvent = { action: 'stop', type: 'movie', imdbId: 'tt1234567', currentTime: 900, duration: 1000 };
const episodeEvent: PlayerEvent = { ...movieEvent, type: 'series', season: 2, episode: 63 };
const UNMAPPED_CONTINUOUS = { kind: 'unmapped', reason: 'continuous_numbering_unsupported' };
const seasonEpisodes = (season: number, first: number, last: number) =>
  Array.from({ length: last - first + 1 }, (_, i) => ({
    id: 1000 + first + i, season_number: season, episode_number: first + i,
    name: `Episode ${first + i}`, air_date: '2011-10-02', runtime: 24,
  }));
const originalFetch = global.fetch;
let db: TestFirestore;

function seedUser(extra: Record<string, unknown> = {}) {
  db.seed(USER, { stremioAddon: { activeTokenHash: HASH }, ...extra });
}
const ok = (data: unknown) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => data });
function mappingResponses(type: 'movie' | 'episode') {
  mockFetch.mockResolvedValueOnce(ok(type === 'movie' ? { movie_results: [{ id: 42 }] } : { tv_results: [{ id: 46298 }] }));
  if (type === 'movie') mockFetch.mockResolvedValueOnce(ok(movie.movie));
  else {
    mockFetch.mockResolvedValueOnce(ok(episode.show));
    mockFetch.mockResolvedValueOnce(ok({ season_number: 2, episodes: [episode.episode] }));
  }
}

beforeEach(() => {
  db = new TestFirestore();
  seedUser();
  mockFirestore.mockReturnValue(db);
  mockFetch.mockReset();
  global.fetch = mockFetch;
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });
afterAll(() => { global.fetch = originalFetch; });

describe('mobile-shaped watched transactions', () => {
  it('writes a first movie watch, runtime-stamped list entry, and removes only its watchlist entries', async () => {
    db.seed(`${USER}/lists/watchlist`, {
      name: 'Should Watch', metadata: { untouched: true },
      items: { 'movie-42': { id: 42 }, '42': { id: 42 }, 'tv-17': { id: 17, media_type: 'tv' } },
    });
    const result = await writeStremioWatch('member', HASH, movie, NOW);
    expect(result).toEqual({ outcome: 'written', listOutcome: 'added' });
    expect(db.data(WATCH)).toEqual({ movieId: 42, watchedAt: TestTimestamp.fromMillis(NOW) });
    expect(db.data(`${USER}/lists/already-watched`)).toEqual({
      name: 'Already Watched', createdAt: NOW, updatedAt: NOW,
      items: { 'movie-42': {
        id: 42, title: 'Movie', poster_path: '/movie.jpg', media_type: 'movie', vote_average: 8,
        release_date: '2020-01-01', genre_ids: [18], addedAt: NOW, runtimeMinutes: 120,
      } },
    });
    expect(db.data(`${USER}/lists/watchlist`)).toEqual({
      name: 'Should Watch', metadata: { untouched: true }, updatedAt: NOW,
      items: { 'tv-17': { id: 17, media_type: 'tv' } },
    });
    expect([...db.store.keys()].some((key) => key.includes('collection_tracking'))).toBe(false);
  });

  it.each(['movie', 'episode'] as const)('preserves a renamed existing list when adding a watched %s', async (kind) => {
    const listId = kind === 'movie' ? 'already-watched' : 'currently-watching';
    const itemKey = kind === 'movie' ? 'movie-42' : 'tv-46298';
    const listPath = `${USER}/lists/${listId}`;
    const existingItem = { id: 100, media_type: 'movie', addedAt: 1 };
    db.seed(listPath, {
      name: 'My custom list name', items: { 'movie-100': existingItem }, createdAt: 1, updatedAt: 1,
    });

    expect(await writeStremioWatch('member', HASH, kind === 'movie' ? movie : episode, NOW))
      .toEqual({ outcome: 'written', listOutcome: 'added' });
    expect(db.data(listPath)).toMatchObject({
      name: 'My custom list name', createdAt: 1, updatedAt: NOW,
      items: { 'movie-100': existingItem, [itemKey]: { addedAt: NOW } },
    });
  });

  it('honors disabled movie preferences without suppressing the watch', async () => {
    seedUser({ preferences: { autoAddToAlreadyWatched: false, autoRemoveFromShouldWatch: false } });
    db.seed(`${USER}/lists/watchlist`, { items: { 'movie-42': { id: 42 } } });
    await writeStremioWatch('member', HASH, movie, NOW);
    expect(db.data(WATCH)).toBeDefined();
    expect(db.data(`${USER}/lists/already-watched`)).toBeUndefined();
    expect(db.data(`${USER}/lists/watchlist`)?.items['movie-42']).toBeDefined();
    expect(db.reads.some((path) => path.includes('/lists/'))).toBe(false);
  });

  it('only auto-adds a movie on its first-ever watch, even on a later UTC day', async () => {
    db.seed(`${USER}/watched_movies/42/watches/manual-watch`, { movieId: 42, watchedAt: TestTimestamp.fromMillis(NOW - 86400000) });
    await writeStremioWatch('member', HASH, movie, NOW);
    expect(db.data(WATCH)).toBeDefined();
    expect(db.data(`${USER}/lists/already-watched`)).toBeUndefined();
  });

  it('preserves existing legacy membership instead of resetting its timestamp or fields', async () => {
    db.seed(`${USER}/lists/already-watched`, { items: { '42': { id: 42, media_type: 'movie', addedAt: 1, custom: true } } });
    expect(await writeStremioWatch('member', HASH, movie, NOW)).toEqual({ outcome: 'written', listOutcome: 'already_present' });
    expect(db.data(`${USER}/lists/already-watched`)?.items).toEqual({ '42': { id: 42, media_type: 'movie', addedAt: 1, custom: true } });
  });

  it.each(['movie', 'episode'] as const)('at the free limit skips only the %s list addition', async (kind) => {
    const listId = kind === 'movie' ? 'already-watched' : 'currently-watching';
    const items = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`movie-${i + 100}`, { id: i + 100, media_type: 'movie' }]));
    db.seed(`${USER}/lists/${listId}`, { items, metadata: { keep: true } });
    const result = await writeStremioWatch('member', HASH, kind === 'movie' ? movie : episode, NOW);
    expect(result).toEqual({ outcome: 'written', listOutcome: 'skipped_limit' });
    expect(db.data(`${USER}/lists/${listId}`)?.items).toEqual(items);
    expect(kind === 'movie' ? db.data(WATCH) : db.data(TRACKING)?.episodes['2_63']).toBeDefined();
  });

  it('allows premium users past the list limit and preserves unrelated list metadata', async () => {
    seedUser({ premium: { isPremium: true } });
    db.seed(`${USER}/lists/already-watched`, {
      createdAt: 1, metadata: { keep: true },
      items: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`movie-${i + 100}`, { id: i + 100, media_type: 'movie' }])),
    });
    await writeStremioWatch('member', HASH, movie, NOW);
    const list = db.data(`${USER}/lists/already-watched`)!;
    expect(Object.keys(list.items)).toHaveLength(51);
    expect(list.createdAt).toBe(1);
    expect(list.metadata).toEqual({ keep: true });
  });

  it('writes full episode shape with numeric timestamps and preserves hidden/other episodes', async () => {
    db.seed(TRACKING, { episodes: { '1_1': { watchedAt: 1 } }, metadata: { hiddenFromProgress: true } });
    await writeStremioWatch('member', HASH, episode, NOW);
    expect(db.data(TRACKING)).toEqual({
      episodes: {
        '1_1': { watchedAt: 1 },
        '2_63': { episodeId: 777, tvShowId: 46298, seasonNumber: 2, episodeNumber: 63, watchedAt: NOW,
          episodeName: 'Season Two Premiere', episodeAirDate: '2012-12-15', runtimeMinutes: 24 },
      },
      metadata: { tvShowName: 'Hunter x Hunter', posterPath: '/hxh.jpg', lastUpdated: NOW, hiddenFromProgress: true },
    });
    expect(db.data(`${USER}/lists/currently-watching`)).toEqual({
      name: 'Watching', createdAt: NOW, updatedAt: NOW,
      items: { 'tv-46298': {
        id: 46298, title: 'Hunter x Hunter', name: 'Hunter x Hunter', poster_path: '/hxh.jpg', media_type: 'tv',
        vote_average: 9, release_date: '2011-10-02', first_air_date: '2011-10-02', genre_ids: [16], addedAt: NOW,
      } },
    });
    expect(db.data(TRACKING)?.episodes['2_62']).toBeUndefined(); // Never mark previous episodes.
  });

  it('honors disabled Watching auto-add and omits unknown runtime rather than inventing it', async () => {
    seedUser({ preferences: { autoAddToWatching: false, markPreviousEpisodesWatched: true } });
    await writeStremioWatch('member', HASH, { ...episode, episode: { ...episode.episode, runtime: null } }, NOW);
    expect(db.data(TRACKING)?.episodes['2_63']).not.toHaveProperty('runtimeMinutes');
    expect(Object.keys(db.data(TRACKING)?.episodes)).toEqual(['2_63']);
    expect(db.data(`${USER}/lists/currently-watching`)).toBeUndefined();
  });

  it('does not overwrite an existing episode or any metadata, even on another day', async () => {
    const original = { episodes: { '2_63': { watched: true, watchedAt: TestTimestamp.fromMillis(1), runtimeMinutes: 23 } }, metadata: { lastUpdated: 1, hiddenFromProgress: true } };
    db.seed(TRACKING, original);
    expect(await writeStremioWatch('member', HASH, episode, NOW + 86400000)).toEqual({ outcome: 'skipped_duplicate' });
    expect(db.data(TRACKING)).toEqual(original);
    expect(db.writes).toHaveLength(0);
  });

  it.each([movie, episode])('serializes concurrent duplicate stops for $kind', async (title) => {
    const results = await Promise.all([writeStremioWatch('member', HASH, title, NOW), writeStremioWatch('member', HASH, title, NOW)]);
    expect(results.map((result) => result.outcome).sort()).toEqual(['skipped_duplicate', 'written']);
    expect(db.writes.filter((path) => path === (title.kind === 'movie' ? WATCH : TRACKING))).toHaveLength(1);
  });

  it('uses UTC dates and permits one new movie watch on the next UTC day', async () => {
    const beforeMidnight = Date.UTC(2026, 9, 20, 23, 59, 59);
    await writeStremioWatch('member', HASH, movie, beforeMidnight);
    await writeStremioWatch('member', HASH, movie, beforeMidnight + 2000);
    expect([...db.store.keys()].filter((path) => path.includes('/watches/')).sort()).toEqual([
      WATCH, `${USER}/watched_movies/42/watches/stremio-42-20261021`,
    ]);
  });

  it.each([movie, episode])('rechecks revocation in the transaction on retry for $kind', async (title) => {
    db.beforeCommit = () => seedUser({ stremioAddon: { activeTokenHash: null } });
    expect(await writeStremioWatch('member', HASH, title, NOW)).toEqual({ outcome: 'bad_token' });
    expect(db.writes).toHaveLength(0);
  });

  it('does not recreate a user deleted during a transaction', async () => {
    db.beforeCommit = () => db.remove(USER);
    expect(await writeStremioWatch('member', HASH, movie, NOW)).toEqual({ outcome: 'bad_token' });
    expect(db.writes).toHaveLength(0);
  });
});

describe('IMDb-to-TMDB mapping and request budget', () => {
  it('resolves movies by IMDb ID and fetches details for runtime', async () => {
    mappingResponses('movie');
    expect(await resolveStremioTitle(movieEvent, ' api-key ')).toEqual(movie);
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.themoviedb.org/3/find/tt1234567?external_source=imdb_id&api_key=api-key');
    expect(mockFetch.mock.calls[1][0]).toContain('/movie/42?api_key=api-key');
  });

  it('skips a continuous-numbered season even when the incoming number coincides (S2E63)', async () => {
    mappingResponses('episode');
    expect(await resolveStremioTitle(episodeEvent, 'key')).toEqual(UNMAPPED_CONTINUOUS);
    expect(mockFetch.mock.calls[2][0]).toContain('/tv/46298/season/2?');
    expect(db.writes).toHaveLength(0);
  });

  it('never remaps incoming S2E1 to TMDB S2E63 for a continuous-numbered show', async () => {
    mappingResponses('episode');
    expect(await resolveStremioTitle({ ...episodeEvent, episode: 1 }, 'key')).toEqual(UNMAPPED_CONTINUOUS);
    expect(db.writes).toHaveLength(0);
  });

  it('skips a continuous-numbered season when the incoming number does not exist (S3E9)', async () => {
    mockFetch.mockResolvedValueOnce(ok({ tv_results: [{ id: 46298 }] }))
      .mockResolvedValueOnce(ok(episode.show))
      .mockResolvedValueOnce(ok({ season_number: 3, episodes: seasonEpisodes(3, 137, 148) }));
    expect(await resolveStremioTitle({ ...episodeEvent, season: 3, episode: 9 }, 'key')).toEqual(UNMAPPED_CONTINUOUS);
  });

  it('still maps a normal season that starts at episode 1', async () => {
    mockFetch.mockResolvedValueOnce(ok({ tv_results: [{ id: 46298 }] }))
      .mockResolvedValueOnce(ok(episode.show))
      .mockResolvedValueOnce(ok({ season_number: 1, episodes: seasonEpisodes(1, 1, 3) }));
    expect(await resolveStremioTitle({ ...episodeEvent, season: 1, episode: 2 }, 'key')).toEqual({
      kind: 'episode',
      show: episode.show,
      episode: { id: 1002, season_number: 1, episode_number: 2, name: 'Episode 2', air_date: '2011-10-02', runtime: 24 },
    });
  });

  it('keeps returning null for a season with no episodes', async () => {
    mockFetch.mockResolvedValueOnce(ok({ tv_results: [{ id: 46298 }] }))
      .mockResolvedValueOnce(ok(episode.show))
      .mockResolvedValueOnce(ok({ season_number: 2, episodes: [] }));
    expect(await resolveStremioTitle(episodeEvent, 'key')).toBeNull();
  });

  it.each([{ movie_results: [] }, { tv_results: [{ id: 42 }] }, { movie_results: [{ id: 42 }, { id: 43 }] }])('skips absent, wrong-type and ambiguous IMDb results: %j', async (result) => {
    mockFetch.mockResolvedValueOnce(ok(result));
    expect(await resolveStremioTitle(movieEvent, 'key')).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('skips nonexistent seasons and wrong-season episode payloads', async () => {
    mockFetch.mockResolvedValueOnce(ok({ tv_results: [{ id: 46298 }] }))
      .mockResolvedValueOnce(ok(episode.show))
      .mockResolvedValueOnce({ ok: false, status: 404 });
    expect(await resolveStremioTitle(episodeEvent, 'key')).toBeNull();
    mockFetch.mockResolvedValueOnce(ok({ tv_results: [{ id: 46298 }] }))
      .mockResolvedValueOnce(ok(episode.show))
      .mockResolvedValueOnce(ok({ season_number: 2, episodes: [{ ...episode.episode, season_number: 1, episode_number: 1 }] }));
    expect(await resolveStremioTitle({ ...episodeEvent, episode: 1 }, 'key')).toBeNull();
  });

  it('honors Retry-After on a 429 before a successful retry', async () => {
    jest.restoreAllMocks();
    jest.useFakeTimers({ now: NOW });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429, headers: { get: () => '2' } });
    mappingResponses('movie');
    const pending = resolveStremioTitle(movieEvent, 'key');
    await jest.advanceTimersByTimeAsync(1999);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual(movie);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('uses bounded exponential retries when Retry-After is absent', async () => {
    jest.restoreAllMocks();
    jest.useFakeTimers({ now: NOW });
    mockFetch.mockResolvedValue({ ok: false, status: 429, headers: { get: () => null } });
    const pending = expect(resolveStremioTitle(movieEvent, 'key')).rejects.toMatchObject({ reason: 'http_error', statusCode: 429 });
    await jest.advanceTimersByTimeAsync(3500);
    await pending;
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('does not sleep beyond the 45s overall budget for a long Retry-After', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429, headers: { get: () => '60' } });
    await expect(resolveStremioTitle(movieEvent, 'key')).rejects.toMatchObject({ reason: 'budget_exhausted' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('shares the overall deadline across multiple TMDB requests', async () => {
    jest.restoreAllMocks();
    jest.useFakeTimers({ now: NOW });
    mockFetch.mockImplementationOnce(async () => {
      jest.setSystemTime(NOW + 30_000);
      return ok({ movie_results: [{ id: 42 }] });
    }).mockImplementationOnce(async () => {
      jest.setSystemTime(NOW + 45_001);
      return ok(movie.movie);
    });
    await expect(resolveStremioTitle(movieEvent, 'key')).rejects.toMatchObject({ reason: 'budget_exhausted' });
  });

  it('aborts a stalled TMDB request at 15 seconds', async () => {
    jest.restoreAllMocks();
    jest.useFakeTimers({ now: NOW });
    mockFetch.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const pending = expect(resolveStremioTitle(movieEvent, 'key')).rejects.toMatchObject({ reason: 'timeout' });
    await jest.advanceTimersByTimeAsync(15_000);
    await pending;
  });
});
