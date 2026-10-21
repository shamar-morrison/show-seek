const mockFirestore = jest.fn();
const mockFetch = jest.fn();
jest.mock('firebase-admin', () => ({ firestore: mockFirestore }), { virtual: true });
jest.mock('firebase-admin/firestore', () => ({
  Timestamp: require('./helpers/stremioFirestore').TestTimestamp,
  FieldValue: { delete: () => require('./helpers/stremioFirestore').DELETE_FIELD },
}), { virtual: true });
jest.mock('firebase-functions/params', () => ({ defineSecret: () => ({ value: () => 'tmdb-secret' }) }), { virtual: true });

import { stremioAddon } from '@/functions/src/stremioAddon';
import { STREMIO_STOP_RATE_LIMIT_MAX, STREMIO_STOP_RATE_LIMIT_WINDOW_MS } from '@/functions/src/stremio/constants';
import { parseAddonRoute, parsePlayerEvent } from '@/functions/src/stremio/parsing';
import { clearStremioTmdbCache, resolveStremioTitle } from '@/functions/src/stremio/tmdb';
import * as tokens from '@/functions/src/stremio/tokens';
import { TestFirestore, TestTimestamp } from './helpers/stremioFirestore';

const { clearStremioTokenCache, clearStremioStopRateLimit, consumeStremioStopAllowance, hashAddonToken, lookupAddonUid } = tokens;
const TOKEN = '1'.repeat(64);
const HASH = hashAddonToken(TOKEN);
const NOW = Date.UTC(2026, 9, 20, 12);
const originalFetch = global.fetch;
let db: TestFirestore;
let log: jest.SpyInstance;

function response() {
  const res = { setHeader: jest.fn(), status: jest.fn(), json: jest.fn(), send: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}
async function request(path: string, method = 'GET') {
  const res = response();
  await (stremioAddon as any)({ path, method }, res);
  return res;
}
const playerPath = (action = 'stop', time = 900, duration = 1000) =>
  `/${TOKEN}/player/movie/tt1234567/action=${action}&currentTime=${time}&duration=${duration}.json`;
const ok = (data: unknown) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => data });
const seriesPath = (season: number, episode: number) =>
  `/${TOKEN}/player/series/tt1234567%3A${season}%3A${episode}/action=stop&currentTime=1400000&duration=1440000.json`;
const seriesResponses = (season: number, episodes: unknown[]) =>
  mockFetch.mockResolvedValueOnce(ok({ tv_results: [{ id: 46298 }] }))
    .mockResolvedValueOnce(ok({ id: 46298, name: 'Hunter x Hunter', poster_path: '/hxh.jpg' }))
    .mockResolvedValueOnce(ok({ season_number: season, episodes }));

beforeEach(() => {
  db = new TestFirestore();
  db.seed(`stremioAddonTokens/${HASH}`, { uid: 'member', createdAt: TestTimestamp.fromMillis(NOW) });
  db.seed('users/member', { stremioAddon: { activeTokenHash: HASH } });
  mockFirestore.mockReset().mockReturnValue(db);
  mockFetch.mockReset().mockImplementation(async (url: string) => url.includes('/find/')
    ? ok({ movie_results: [{ id: 42 }] })
    : ok({ id: 42, title: 'A Movie', runtime: 120, poster_path: '/movie.jpg', release_date: '2020-01-01', genres: [{ id: 18 }], vote_average: 8 }));
  global.fetch = mockFetch;
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  log = jest.spyOn(console, 'info').mockImplementation(() => {});
  clearStremioTokenCache();
  clearStremioStopRateLimit();
  clearStremioTmdbCache();
});
afterEach(() => { jest.restoreAllMocks(); });
afterAll(() => { global.fetch = originalFetch; });

describe('path and path-extra parsing', () => {
  it('decodes episode IDs once and parses millisecond extras from the path', () => {
    expect(parseAddonRoute(`/${TOKEN}/player/series/tt1234567%3A2%3A63/action=stop&currentTime=600000&duration=650000.json`)).toEqual({
      kind: 'player', token: TOKEN,
      event: { type: 'series', action: 'stop', imdbId: 'tt1234567', season: 2, episode: 63, currentTime: 600000, duration: 650000 },
    });
    expect(parsePlayerEvent('movie', 'tt1234567', 'action=start&currentTime=0&duration=0&future=extra')).toMatchObject({ action: 'start', currentTime: 0 });
  });

  it.each([
    ['movie', 'tt1234567', 'action=stop&currentTime=-1&duration=1000'],
    ['movie', 'tt1234567', 'action=stop&currentTime=1e3&duration=1000'],
    ['movie', 'tt1234567', 'action=stop&currentTime=1.5&duration=1000'],
    ['movie', 'tt1234567', 'action=stop&currentTime=NaN&duration=1000'],
    ['movie', 'tt1234567', 'action=stop&currentTime=9007199254740992&duration=1000'],
    ['movie', 'tt1234567', 'action=stop&currentTime=900'],
    ['movie', 'tt1234567', 'action=stop&action=start&currentTime=900&duration=1000'],
    ['movie', 'tt1234567', 'action=stop&currentTime=900&duration=1000&duration=1000'],
    ['movie', 'tt1234567', 'action=resume&currentTime=900&duration=1000'],
    ['movie', 'tt1234567', 'action=stop&currentTime=%ZZ&duration=1000'],
    ['movie', 'tt1234567:1:1', 'action=stop&currentTime=900&duration=1000'],
    ['series', 'tt1234567%253A1%253A1', 'action=stop&currentTime=900&duration=1000'],
    ['series', 'tt1234567%3A1%3A0', 'action=stop&currentTime=900&duration=1000'],
    ['series', 'tt1234567%3A-1%3A1', 'action=stop&currentTime=900&duration=1000'],
    ['series', '%E0%A4%A', 'action=stop&currentTime=900&duration=1000'],
    ['series', 'tt1234567%2F1%2F1', 'action=stop&currentTime=900&duration=1000'],
    ['tv', 'tt1234567', 'action=stop&currentTime=900&duration=1000'],
  ])('fails soft on malformed event %s / %s / %s', (type, id, extra) => {
    expect(parsePlayerEvent(type, id, extra)).toBeNull();
  });

  it('allows season zero specials and bounds route segments', () => {
    expect(parsePlayerEvent('series', 'tt1:0:1', 'action=stop&currentTime=90&duration=100')).toMatchObject({ season: 0, episode: 1 });
    expect(parseAddonRoute(`/${TOKEN}/player/movie/${'t'.repeat(257)}/action=stop.json`)).toMatchObject({ kind: 'player', event: null });
    expect(parseAddonRoute('/' + 'a'.repeat(5000))).toEqual({ kind: 'not_found' });
  });
});

describe('stremioAddon HTTP endpoint', () => {
  it('serves the opted-in manifest only for an active token', async () => {
    const res = await request(`/${TOKEN}/manifest.json`);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      id: 'app.showseek.stremio', version: '1.0.0', name: 'ShowSeek',
      description: expect.any(String), resources: ['player'], types: ['movie', 'series'], idPrefixes: ['tt'], catalogs: [],
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each(['x', 'A'.repeat(64), 'a'.repeat(63), 'g'.repeat(64), '%31'.repeat(64)])('rejects malformed tokens without reads: %s', async (token) => {
    const res = await request(`/${token}/manifest.json`);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.reads).toHaveLength(0);
    expect(db.writes).toHaveLength(0);
    expect(mockFirestore).not.toHaveBeenCalled();
  });

  it('rejects unknown and revoked manifests, including warm cache state', async () => {
    const unknown = await request(`/${'a'.repeat(64)}/manifest.json`);
    expect(unknown.status).toHaveBeenCalledWith(404);
    await lookupAddonUid(HASH);
    db.seed(`stremioAddonTokens/${HASH}`, { uid: 'member', revokedAt: TestTimestamp.now() });
    const revoked = await request(`/${TOKEN}/manifest.json`);
    expect(revoked.status).toHaveBeenCalledWith(404);
  });

  it.each(['start', 'pause'])('acknowledges %s with zero reads, writes or TMDB calls', async (action) => {
    const res = await request(playerPath(action, 0, 0));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true });
    expect(db.reads).toHaveLength(0);
    expect(db.writes).toHaveLength(0);
    expect(mockFirestore).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('[StremioAddon]', expect.objectContaining({ action, outcome: 'ignored_non_stop' }));
  });

  it('does not look up an unknown token for non-stop events', async () => {
    const res = await request(playerPath('start').replace(TOKEN, 'a'.repeat(64)));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(db.reads).toHaveLength(0);
  });

  it.each([[899, 1000], [0, 0]])('skips below threshold / unknown duration (%i/%i) without reads', async (time, duration) => {
    const res = await request(playerPath('stop', time, duration));
    expect(res.json).toHaveBeenCalledWith({ success: true });
    expect(db.reads).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('[StremioAddon]', expect.objectContaining({ outcome: 'skipped_below_threshold' }));
  });

  it.each([900, 1000, 1001])('writes a movie at or above the exact threshold (%i/1000)', async (time) => {
    const res = await request(playerPath('stop', time));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(db.data('users/member/watched_movies/42/watches/stremio-42-20261020')).toEqual({ movieId: 42, watchedAt: TestTimestamp.fromMillis(NOW) });
    expect(db.data('users/member/lists/already-watched')?.items['movie-42'].runtimeMinutes).toBe(120);
    expect(mockFetch.mock.calls[0][0]).toContain('/find/tt1234567?external_source=imdb_id');
    expect(log).toHaveBeenCalledWith('[StremioAddon]', expect.objectContaining({ action: 'stop', type: 'movie', ratio: time / 1000, currentTime: time, duration: 1000, outcome: 'written' }));
  });

  it('makes repeated stops idempotent while saving token-doc reads on cache hits', async () => {
    await request(playerPath());
    expect(db.reads).toHaveLength(7);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const writes = db.writes.length;
    await request(playerPath());
    expect(db.reads).toHaveLength(10);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(db.writes).toHaveLength(writes);
    expect(db.reads.filter((path) => path === `stremioAddonTokens/${HASH}`)).toHaveLength(1);
    expect(log).toHaveBeenLastCalledWith('[StremioAddon]', expect.objectContaining({ outcome: 'skipped_duplicate' }));
  });

  it.each([[false, false], [false, true], [true, false], [true, true]])(
    'preserves first-movie read costs (token warm=%s, mapping warm=%s)', async (tokenWarm, mappingWarm) => {
      if (tokenWarm) await lookupAddonUid(HASH);
      if (mappingWarm) await resolveStremioTitle({ action: 'stop', type: 'movie', imdbId: 'tt1234567', currentTime: 900, duration: 1000 }, 'key');
      db.reads.length = 0;
      mockFetch.mockClear();
      await request(playerPath());
      expect(db.reads).toHaveLength(tokenWarm ? 6 : 7);
      expect(mockFetch).toHaveBeenCalledTimes(mappingWarm ? 0 : 2);
      expect(log).toHaveBeenLastCalledWith('[StremioAddon]', expect.objectContaining({ outcome: 'written' }));
    }
  );

  it.each([[false, false], [false, true], [true, false], [true, true]])(
    'preserves same-day repeat read costs (token warm=%s, mapping warm=%s)', async (tokenWarm, mappingWarm) => {
      await request(playerPath());
      if (!tokenWarm) clearStremioTokenCache();
      if (!mappingWarm) clearStremioTmdbCache();
      db.reads.length = 0;
      db.writes.length = 0;
      mockFetch.mockClear();
      await request(playerPath());
      expect(db.reads).toHaveLength(tokenWarm ? 3 : 4);
      expect(mockFetch).toHaveBeenCalledTimes(mappingWarm ? 0 : 2);
      expect(db.writes).toHaveLength(0);
      expect(log).toHaveBeenLastCalledWith('[StremioAddon]', expect.objectContaining({ outcome: 'skipped_duplicate' }));
    }
  );

  it.each([false, true])('drops stops 31 and 32 without user reads and logs only stop 31 (token warm=%s)', async (tokenWarm) => {
    for (let i = 0; i < STREMIO_STOP_RATE_LIMIT_MAX; i++) await request(playerPath());
    if (!tokenWarm) clearStremioTokenCache();
    db.reads.length = 0;
    db.writes.length = 0;
    mockFetch.mockClear();
    log.mockClear();

    const first = await request(playerPath());
    expect(first.status).toHaveBeenCalledWith(200);
    expect(first.json).toHaveBeenCalledWith({ success: true });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenLastCalledWith('[StremioAddon]', expect.objectContaining({ outcome: 'rate_limited' }));
    const second = await request(playerPath());
    expect(second.status).toHaveBeenCalledWith(200);
    expect(second.json).toHaveBeenCalledWith({ success: true });
    expect(log).toHaveBeenCalledTimes(1);
    expect(db.reads).toEqual(tokenWarm ? [] : [`stremioAddonTokens/${HASH}`]);
    expect(db.writes).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain(TOKEN);
  });

  it('admits stops at the window boundary without extending the window on denial', async () => {
    for (let i = 0; i < STREMIO_STOP_RATE_LIMIT_MAX; i++) consumeStremioStopAllowance(HASH);
    await request(playerPath());
    jest.spyOn(Date, 'now').mockReturnValue(NOW + STREMIO_STOP_RATE_LIMIT_WINDOW_MS - 1);
    await request(playerPath());
    expect(mockFetch).not.toHaveBeenCalled();
    jest.spyOn(Date, 'now').mockReturnValue(NOW + STREMIO_STOP_RATE_LIMIT_WINDOW_MS);
    await request(playerPath());
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenLastCalledWith('[StremioAddon]', expect.objectContaining({ outcome: 'written' }));
  });

  it.each([
    playerPath('start'), playerPath('pause'), playerPath('stop', 899), playerPath('stop', 0, 0),
    playerPath().replace('action=stop', 'action=unknown'),
  ])('does not count an ineligible event toward the stop limit', async (path) => {
    for (let i = 1; i < STREMIO_STOP_RATE_LIMIT_MAX; i++) consumeStremioStopAllowance(HASH);
    await request(path);
    expect(db.reads).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
    await request(playerPath());
    expect(log).toHaveBeenLastCalledWith('[StremioAddon]', expect.objectContaining({ outcome: 'written' }));
    await request(playerPath());
    expect(log).toHaveBeenLastCalledWith('[StremioAddon]', expect.objectContaining({ outcome: 'rate_limited' }));
  });

  it('never enters the limiter for unknown tokens', async () => {
    const consume = jest.spyOn(tokens, 'consumeStremioStopAllowance');
    for (let i = 0; i < 32; i++) await request(playerPath().replace(TOKEN, 'a'.repeat(64)));
    expect(consume).not.toHaveBeenCalled();
    expect(db.reads).toHaveLength(32);
    expect(db.reads.every((path) => path.startsWith('stremioAddonTokens/'))).toBe(true);
    expect(db.writes).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not count or limit manifests, even when the stop allowance is exhausted', async () => {
    for (let i = 1; i < STREMIO_STOP_RATE_LIMIT_MAX; i++) consumeStremioStopAllowance(HASH);
    expect((await request(`/${TOKEN}/manifest.json`)).status).toHaveBeenCalledWith(200);
    await request(playerPath());
    expect(log).toHaveBeenLastCalledWith('[StremioAddon]', expect.objectContaining({ outcome: 'written' }));
    expect((await request(`/${TOKEN}/manifest.json`)).status).toHaveBeenCalledWith(200);
    await request(playerPath());
    expect(log).toHaveBeenLastCalledWith('[StremioAddon]', expect.objectContaining({ outcome: 'rate_limited' }));
  });

  it.each(['preflight', 'transaction'])('retains the %s revocation check with a warm TMDB mapping', async (stage) => {
    await resolveStremioTitle({ action: 'stop', type: 'movie', imdbId: 'tt1234567', currentTime: 900, duration: 1000 }, 'key');
    mockFetch.mockClear();
    const revoke = () => db.seed('users/member', { stremioAddon: { activeTokenHash: null } });
    if (stage === 'preflight') revoke();
    else db.beforeCommit = revoke;
    await request(playerPath());
    expect(mockFetch).not.toHaveBeenCalled();
    expect(db.writes).toHaveLength(0);
    expect(log).toHaveBeenLastCalledWith('[StremioAddon]', expect.objectContaining({ outcome: 'bad_token' }));
  });

  it('handles an encoded episode stop end-to-end, using TMDB numbering and numeric timestamps', async () => {
    seriesResponses(1, [
      { id: 701, season_number: 1, episode_number: 1, name: 'Pilot', air_date: '1999-10-20', runtime: 24 },
      { id: 702, season_number: 1, episode_number: 2, name: 'Second', air_date: '1999-11-17', runtime: 24 },
    ]);
    const res = await request(seriesPath(1, 2));
    expect(res.json).toHaveBeenCalledWith({ success: true });
    expect(db.data('users/member/episode_tracking/46298')?.episodes['1_2']).toEqual({
      episodeId: 702, tvShowId: 46298, seasonNumber: 1, episodeNumber: 2, watchedAt: NOW,
      episodeName: 'Second', episodeAirDate: '1999-11-17', runtimeMinutes: 24,
    });
    expect(log).toHaveBeenLastCalledWith('[StremioAddon]', expect.objectContaining({ type: 'series', outcome: 'written' }));
  });

  it('acknowledges and logs a continuous-numbering mismatch without writing anything', async () => {
    seriesResponses(2, [{ id: 777, season_number: 2, episode_number: 63, name: 'Premiere', runtime: 24 }]);
    const res = await request(seriesPath(2, 1));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(db.writes).toHaveLength(0);
    expect(log).toHaveBeenLastCalledWith('[StremioAddon]', expect.objectContaining({
      type: 'series', outcome: 'skipped_unmapped', reason: 'continuous_numbering_unsupported',
    }));
  });

  it('never writes a coincident number from a continuous season (S2E63 on a season starting at 63)', async () => {
    seriesResponses(2, [{ id: 777, season_number: 2, episode_number: 63, name: 'Premiere', air_date: '2013-01-20', runtime: 24 }]);
    const res = await request(seriesPath(2, 63));
    expect(res.json).toHaveBeenCalledWith({ success: true });
    expect(db.writes).toHaveLength(0);
    expect(db.data('users/member/episode_tracking/46298')).toBeUndefined();
    expect(log).toHaveBeenLastCalledWith('[StremioAddon]', expect.objectContaining({
      type: 'series', outcome: 'skipped_unmapped', reason: 'continuous_numbering_unsupported',
    }));
  });

  it('skips a missing number in a continuous season (S3E9 on a season starting at 137) without leaking tokens', async () => {
    seriesResponses(3, Array.from({ length: 12 }, (_, i) => ({
      id: 900 + i, season_number: 3, episode_number: 137 + i, name: `Episode ${137 + i}`, runtime: 24,
    })));
    const res = await request(seriesPath(3, 9));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(db.writes).toHaveLength(0);
    expect(log).toHaveBeenLastCalledWith('[StremioAddon]', expect.objectContaining({
      type: 'series', outcome: 'skipped_unmapped', reason: 'continuous_numbering_unsupported',
    }));
    const logs = JSON.stringify(log.mock.calls);
    expect(logs).toContain('continuous_numbering_unsupported');
    expect(logs).not.toContain(TOKEN);
    expect(logs).not.toContain('https://');
    expect(logs).not.toContain('tmdb-secret');
  });

  it('blocks a cached token revoked by a different instance before spending TMDB calls', async () => {
    await lookupAddonUid(HASH);
    db.seed('users/member', { stremioAddon: { activeTokenHash: null } });
    const res = await request(playerPath());
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(db.writes).toHaveLength(0);
    expect(log).toHaveBeenLastCalledWith('[StremioAddon]', expect.objectContaining({ outcome: 'bad_token' }));
  });

  it('does not recreate a deleted user from a cached mapping', async () => {
    await lookupAddonUid(HASH);
    db.remove('users/member');
    await request(playerPath());
    expect(db.writes).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fails soft on malformed extras and never reads extras from the query string', async () => {
    const malformed = await request(`/${TOKEN}/player/movie/tt1234567/action=unknown&currentTime=900&duration=1000.json`);
    expect(malformed.status).toHaveBeenCalledWith(200);
    const queryOnly = await request(`/${TOKEN}/player/movie/tt1234567.json`);
    expect(queryOnly.status).toHaveBeenCalledWith(404);
    expect(db.reads).toHaveLength(0);
  });

  it('sets CORS on success, errors and preflight, with no work for OPTIONS', async () => {
    for (const [path, method, status] of [['/anything', 'OPTIONS', 204], ['/anything', 'POST', 405], ['/anything', 'GET', 404]] as const) {
      const res = await request(path, method);
      expect(res.status).toHaveBeenCalledWith(status);
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'GET, OPTIONS');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    }
    expect(db.reads).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('logs unmapped titles and sanitized failures without tokens, URLs or API keys', async () => {
    mockFetch.mockResolvedValueOnce(ok({ movie_results: [] }));
    await request(playerPath());
    expect(log).toHaveBeenLastCalledWith('[StremioAddon]', expect.objectContaining({
      outcome: 'skipped_unmapped', reason: 'no_matching_tmdb_title_or_episode',
    }));
    mockFetch.mockRejectedValueOnce(new Error(`https://example/${TOKEN}?api_key=tmdb-secret`));
    await request(playerPath());
    expect(log).toHaveBeenLastCalledWith('[StremioAddon]', expect.objectContaining({ outcome: 'error', reason: 'request_failed' }));
    await request(`/${TOKEN}/player/movie/tt123/action=${TOKEN}&currentTime=900&duration=1000.json`);
    const logs = JSON.stringify(log.mock.calls);
    expect(logs).not.toContain(TOKEN);
    expect(logs).not.toContain('https://');
    expect(logs).not.toContain('tmdb-secret');
    expect(db.writes).toHaveLength(0);
  });
});
