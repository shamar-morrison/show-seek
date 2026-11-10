/**
 * importSimklChunk — the Simkl configuration of the shared file-import core, and the
 * core paths only Simkl turns on: TMDB-id resolution, "watched up to" expansion, anime
 * numbering, the TMDB episode-group fallback and unmatched-episode titles.
 * (TV Time's behaviour is pinned separately by __tests__/utils/tvtimeImportGolden.test.ts.)
 */
const mockDefineSecret = jest.fn(() => ({ value: () => 'tmdb-key' }));
const firestoreFn: any = jest.fn();

jest.mock('firebase-functions/params', () => ({ defineSecret: mockDefineSecret }), {
  virtual: true,
});
jest.mock('firebase-admin', () => ({ firestore: firestoreFn }), { virtual: true });
jest.mock(
  'firebase-admin/firestore',
  () => ({ FieldValue: { delete: jest.fn(() => '__deleteField__') } }),
  { virtual: true }
);

import { FILE_IMPORT_COOLDOWN_MS } from '@/functions/src/shared/fileImport';
import { SIMKL_IMPORT_SOURCE, importSimklChunk } from '@/functions/src/simklImport';

type Store = Map<string, Record<string, unknown>>;

let store: Store;

class MockDocSnapshot {
  constructor(
    readonly ref: MockDocRef,
    private readonly value: Record<string, unknown> | undefined
  ) {}
  get exists() {
    return this.value !== undefined;
  }
  get id() {
    return this.ref.id;
  }
  data() {
    return clone(this.value);
  }
}

class MockDocRef {
  constructor(
    readonly path: string,
    private readonly backingStore: Store
  ) {}
  get id() {
    return this.path.split('/').at(-1) ?? '';
  }
  collection(name: string) {
    return new MockCollectionRef(`${this.path}/${name}`, this.backingStore);
  }
  async get() {
    return new MockDocSnapshot(this, this.backingStore.get(this.path));
  }
  async create(value: Record<string, unknown>) {
    if (this.backingStore.has(this.path)) {
      throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
    }
    this.backingStore.set(this.path, clone(value));
  }
  async set(value: Record<string, unknown>, options?: { merge?: boolean }) {
    const nextValue = options?.merge
      ? deepMerge(this.backingStore.get(this.path) ?? {}, value)
      : clone(value);
    this.backingStore.set(this.path, nextValue);
  }
}

class MockCollectionRef {
  constructor(
    readonly path: string,
    private readonly backingStore: Store
  ) {}
  doc(id: string) {
    return new MockDocRef(`${this.path}/${id}`, this.backingStore);
  }
  async get() {
    const docs = [...this.backingStore.entries()]
      .filter(([path]) => isDirectChildDocPath(this.path, path))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, value]) => new MockDocSnapshot(new MockDocRef(path, this.backingStore), value));
    return {
      docs,
      empty: docs.length === 0,
      forEach: (callback: (snapshot: MockDocSnapshot) => void) => docs.forEach(callback),
      size: docs.length,
    };
  }
}

class MockFirestore {
  constructor(private readonly backingStore: Store) {}
  collection(name: string) {
    return new MockCollectionRef(name, this.backingStore);
  }
  async runTransaction<T>(callback: (transaction: unknown) => Promise<T>): Promise<T> {
    const pendingWrites: (() => Promise<void>)[] = [];
    const result = await callback({
      get: (ref: MockDocRef) => ref.get(),
      set: (ref: MockDocRef, value: Record<string, unknown>, options?: { merge?: boolean }) => {
        pendingWrites.push(() => ref.set(value, options));
      },
    });
    for (const write of pendingWrites) {
      await write();
    }
    return result;
  }
}

const mockFetch = jest.fn();
const ORIGINAL_ENV = process.env;

// ---------------------------------------------------------------------------
// TMDB fixtures
// ---------------------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;
const WATCHED_AT = Date.UTC(2024, 5, 1);

/** A season whose episode n airs on day n of `year` (2030 = not aired yet). */
function season(showId: number, seasonNumber: number, count: number, year = 2020) {
  return {
    episodes: Array.from({ length: count }, (_, index) => ({
      air_date: `${year}-01-${String(index + 1).padStart(2, '0')}`,
      episode_number: index + 1,
      id: showId * 1000 + seasonNumber * 100 + index + 1,
      name: `S${seasonNumber}E${index + 1}`,
      runtime: 30,
      season_number: seasonNumber,
    })),
  };
}

function tvDetails(
  id: number,
  name: string,
  seasons: { episode_count: number; season_number: number }[],
  status = 'Ended'
) {
  return {
    first_air_date: '2010-01-01',
    genres: [{ id: 16 }],
    id,
    name,
    poster_path: `/p${id}.jpg`,
    seasons,
    status,
    vote_average: 8,
  };
}

type Route = [RegExp, unknown | ((url: string) => unknown)];

function routeTmdb(routes: Route[]) {
  mockFetch.mockImplementation(async (url: string) => {
    for (const [pattern, payload] of routes) {
      if (pattern.test(url)) {
        const body =
          typeof payload === 'function' ? (payload as (u: string) => unknown)(url) : payload;
        return body === 404 ? createFetchResponse({}, 404) : createFetchResponse(body);
      }
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  });
}

/** Serves `/tv/{id}` (with any appended seasons) and `/tv/{id}/season/{n}` from one table. */
function tvRoutes(
  id: number,
  details: ReturnType<typeof tvDetails> | 404,
  seasons: Record<number, ReturnType<typeof season>>
): Route[] {
  return [
    [
      new RegExp(`/tv/${id}/season/(\\d+)\\?`),
      (url: string) => seasons[Number(url.match(/season\/(\d+)\?/)![1])] ?? 404,
    ],
    [
      new RegExp(`/tv/${id}\\?`),
      (url: string) => {
        if (details === 404) return 404;
        const appended: Record<string, unknown> = {};
        const append = new URL(url).searchParams.get('append_to_response') ?? '';
        append
          .split(',')
          .filter(Boolean)
          .forEach((part) => {
            const data = seasons[Number(part.replace('season/', ''))];
            if (data) appended[part] = data;
          });
        return { ...details, ...appended };
      },
    ],
  ];
}

function tmdbCalls(pattern: RegExp): string[] {
  return mockFetch.mock.calls.map(([url]) => String(url)).filter((url) => pattern.test(url));
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(() => {
  Object.defineProperty(global, 'fetch', { configurable: true, value: mockFetch, writable: true });
});

beforeEach(() => {
  jest.clearAllMocks();
  store = new Map();
  process.env = { ...ORIGINAL_ENV };
  delete process.env.FUNCTIONS_EMULATOR;
  delete process.env.TRAKT_SYNC_BYPASS_UIDS;
  firestoreFn.mockImplementation(() => new MockFirestore(store));
  firestoreFn.Timestamp = { fromMillis: jest.fn((ms: number) => ({ _ms: ms })) };
  mockFetch.mockReset();
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('importSimklChunk — source configuration', () => {
  it('pins the Simkl source configuration (stored ids and messages depend on it)', () => {
    expect(SIMKL_IMPORT_SOURCE).toEqual({
      displayName: 'Simkl',
      episodeGroupFallback: true,
      limitDocId: 'simkl',
      logTag: '[simklImport]',
      movieWatchDocPrefix: 'simkl-',
      reportUnmatchedEpisodeTitles: true,
    });
  });

  it('names Simkl in the premium message', async () => {
    await expect(callImport(authed(chunk({})))).rejects.toMatchObject({
      code: 'permission-denied',
      message: 'Simkl import requires Premium.',
    });
  });

  it('keeps its own rate-limit doc, so a recent TV Time import does not block it', async () => {
    seedPremiumUser();
    const now = Date.now();
    seedDoc('users/user-1/import_limits/tvtime', {
      recentCalls: [],
      session: {
        chunks: 1,
        finishedAt: null,
        id: 'tvtime-import-1',
        lastChunkAt: now,
        nextAllowedImportAt: now + FILE_IMPORT_COOLDOWN_MS,
        startedAt: now,
      },
      updatedAt: now,
    });

    await expect(callImport(authed(chunk({})))).resolves.toBeDefined();
    expect(getDoc('users/user-1/import_limits/simkl')).toMatchObject({
      session: { chunks: 1, id: 'import-1234' },
    });
  });

  it('names Simkl when another Simkl import is in progress', async () => {
    seedPremiumUser();
    await callImport(authed(chunk({})));
    await expect(callImport(authed(chunk({ importId: 'import-5678' })))).rejects.toMatchObject({
      code: 'already-exists',
      message: 'A Simkl import is already in progress.',
    });
  });

  it('writes movie watches with the simkl- prefix', async () => {
    seedPremiumUser();
    routeTmdb([
      [
        /\/movie\/27205\?/,
        {
          genres: [{ id: 28 }],
          id: 27205,
          poster_path: '/i.jpg',
          release_date: '2010-07-15',
          title: 'Inception',
        },
      ],
    ]);

    await callImport(authed(chunk({ movies: [movieEntity({ tmdbId: 27205 })] })));

    expect(getDirectDocPaths('users/user-1/watched_movies/27205/watches')).toEqual([
      `users/user-1/watched_movies/27205/watches/simkl-27205-${WATCHED_AT}`,
    ]);
  });
});

describe('importSimklChunk — show resolution', () => {
  it('resolves by TMDB id first, without any /find lookups', async () => {
    seedPremiumUser();
    routeTmdb(
      tvRoutes(1396, tvDetails(1396, 'Breaking Bad', [{ episode_count: 3, season_number: 1 }]), {
        1: season(1396, 1, 3),
      })
    );

    const stats = await callImport(
      authed(
        chunk({
          shows: [
            showEntity({ plays: [play(1, 2, WATCHED_AT)], status: 'watching', tmdbId: 1396 }),
          ],
        })
      )
    );

    expect(stats.imported).toMatchObject({ shows: 1, watchedEpisodes: 1 });
    expect(tmdbCalls(/\/find\//)).toEqual([]);
    expect(getDoc('users/user-1/episode_tracking/1396')?.episodes).toEqual({
      '1_2': expect.objectContaining({ episodeId: 1396102, watchedAt: WATCHED_AT }),
    });
    expect(getDoc('users/user-1/lists/currently-watching')).toMatchObject({
      items: { 'tv-1396': expect.objectContaining({ id: 1396, title: 'Breaking Bad' }) },
    });
  });

  it('falls back to the TVDB id when the TMDB id is gone', async () => {
    seedPremiumUser();
    routeTmdb([
      [/\/tv\/999\?/, 404],
      [
        /\/find\/81189\?external_source=tvdb_id/,
        {
          tv_results: [
            {
              first_air_date: '2008-01-20',
              id: 1396,
              name: 'Breaking Bad',
              poster_path: '/bb.jpg',
            },
          ],
        },
      ],
      ...tvRoutes(1396, tvDetails(1396, 'Breaking Bad', [{ episode_count: 3, season_number: 1 }]), {
        1: season(1396, 1, 3),
      }),
    ]);

    const stats = await callImport(
      authed(chunk({ shows: [showEntity({ plays: [play(1, 1, WATCHED_AT)], tmdbId: 999 })] }))
    );

    expect(stats.imported.watchedEpisodes).toBe(1);
    expect(getDoc('users/user-1/episode_tracking/1396')).toBeDefined();
  });

  it('uses the entity year (±1) to choose between exact title matches', async () => {
    seedPremiumUser();
    routeTmdb([
      [
        /\/search\/tv\?query=Shingeki%20no%20Kyojin/,
        {
          results: [
            {
              first_air_date: '2013-04-07',
              id: 1429,
              name: 'Shingeki no Kyojin',
              poster_path: null,
            },
            {
              first_air_date: '2020-01-01',
              id: 7777,
              name: 'Shingeki no Kyojin',
              poster_path: null,
            },
          ],
        },
      ],
    ]);

    const stats = await callImport(
      authed(
        chunk({
          shows: [
            showEntity({
              imdbId: null,
              status: 'watchlist',
              title: 'Shingeki no Kyojin',
              tvdbId: null,
              year: 2014,
            }),
          ],
        })
      )
    );

    expect(stats.unresolvedTitles).toEqual([]);
    expect(getDoc('users/user-1/lists/watchlist')).toMatchObject({
      items: { 'tv-1429': expect.anything() },
    });
  });
});

describe('importSimklChunk — "watched up to" expansion', () => {
  const details = tvDetails(500, 'Expanded Show', [
    { episode_count: 2, season_number: 0 },
    { episode_count: 3, season_number: 1 },
    { episode_count: 3, season_number: 2 },
  ]);
  const seasons = {
    0: season(500, 0, 2),
    1: season(500, 1, 3),
    // Season 2: episodes 1–2 aired in 2020, episode 3 airs in 2030.
    2: {
      episodes: [...season(500, 2, 2).episodes, { ...season(500, 2, 3, 2030).episodes[2] }],
    },
  };

  it('`all` marks every aired regular-season episode with the one date, skipping specials and unaired', async () => {
    seedPremiumUser();
    routeTmdb(tvRoutes(500, details, seasons));

    const stats = await callImport(
      authed(
        chunk({
          shows: [
            showEntity({
              status: 'up_to_date',
              tmdbId: 500,
              watchedThrough: { kind: 'all' },
              watchedThroughAt: WATCHED_AT,
            }),
          ],
        })
      )
    );

    const episodes = getDoc('users/user-1/episode_tracking/500')?.episodes as Record<string, any>;
    expect(Object.keys(episodes).sort()).toEqual(['1_1', '1_2', '1_3', '2_1', '2_2']);
    expect(Object.values(episodes).every((episode) => episode.watchedAt === WATCHED_AT)).toBe(true);
    expect(stats.imported.watchedEpisodes).toBe(5);
  });

  it('`through` stops at the given episode, and explicit plays keep their own dates', async () => {
    seedPremiumUser();
    routeTmdb(tvRoutes(500, details, seasons));
    const earlier = WATCHED_AT - 30 * DAY;

    await callImport(
      authed(
        chunk({
          shows: [
            showEntity({
              plays: [play(1, 2, earlier)],
              tmdbId: 500,
              watchedThrough: { episode: 1, kind: 'through', season: 2 },
              watchedThroughAt: WATCHED_AT,
            }),
          ],
        })
      )
    );

    const episodes = getDoc('users/user-1/episode_tracking/500')?.episodes as Record<string, any>;
    expect(Object.keys(episodes).sort()).toEqual(['1_1', '1_2', '1_3', '2_1']);
    expect(episodes['1_2'].watchedAt).toBe(earlier);
    expect(episodes['1_3'].watchedAt).toBe(WATCHED_AT);
  });

  it('without a date, only the status is imported', async () => {
    seedPremiumUser();
    routeTmdb(tvRoutes(500, details, seasons));

    const stats = await callImport(
      authed(
        chunk({
          shows: [showEntity({ status: 'watching', tmdbId: 500, watchedThrough: { kind: 'all' } })],
        })
      )
    );

    expect(stats.imported.watchedEpisodes).toBe(0);
    expect(getDoc('users/user-1/episode_tracking/500')).toBeUndefined();
    expect(getDoc('users/user-1/lists/currently-watching')).toBeDefined();
  });

  it('never overwrites episodes already tracked in ShowSeek', async () => {
    seedPremiumUser();
    seedDoc('users/user-1/episode_tracking/500', { episodes: { '1_1': { watchedAt: 123 } } });
    routeTmdb(tvRoutes(500, details, seasons));

    const stats = await callImport(
      authed(
        chunk({
          shows: [
            showEntity({
              tmdbId: 500,
              watchedThrough: { kind: 'all' },
              watchedThroughAt: WATCHED_AT,
            }),
          ],
        })
      )
    );

    expect((getDoc('users/user-1/episode_tracking/500')?.episodes as any)['1_1']).toEqual({
      watchedAt: 123,
    });
    expect(stats.skipped.already_tracked_episode).toBe(1);
    expect(stats.imported.watchedEpisodes).toBe(4);
  });

  it('caps expansion per call at 20,000 episodes, and stops fetching seasons past the cap', async () => {
    seedPremiumUser();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    // 25 seasons × 1,000 aired episodes: more than one call may expand.
    const bigSeason = (seasonNumber: number) => ({
      episodes: Array.from({ length: 1000 }, (_, index) => ({
        air_date: '2000-01-01',
        episode_number: index + 1,
        id: seasonNumber * 10_000 + index + 1,
        name: `S${seasonNumber}E${index + 1}`,
        runtime: 30,
        season_number: seasonNumber,
      })),
    });
    const numbers = Array.from({ length: 25 }, (_, index) => index + 1);
    routeTmdb(
      tvRoutes(
        800,
        tvDetails(
          800,
          'Endless Soap',
          numbers.map((n) => ({ episode_count: 1000, season_number: n }))
        ),
        Object.fromEntries(numbers.map((n) => [n, bigSeason(n)]))
      )
    );

    const stats = await callImport(
      authed(
        chunk({
          shows: [
            showEntity({
              tmdbId: 800,
              watchedThrough: { kind: 'all' },
              watchedThroughAt: WATCHED_AT,
            }),
          ],
        })
      )
    );

    expect(stats.imported.watchedEpisodes).toBe(20_000);
    expect(tmdbCalls(/season\/2[1-5]\b/)).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      '[simklImport] "watched up to" expansion budget spent',
      expect.objectContaining({ showId: 800 })
    );
  });

  it('counts anime "watched up to" against the same per-call cap', async () => {
    seedPremiumUser();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    // TMDB's total (3) never equals the entry total, so every expanded play is unmatched.
    routeTmdb(
      tvRoutes(900, tvDetails(900, 'Long Anime', [{ episode_count: 3, season_number: 1 }]), {
        1: season(900, 1, 3),
      })
    );
    const longEntry = showEntity({
      anime: { entryEpisodeTotal: 10_000, groupedEntries: 1 },
      tmdbId: 900,
      watchedThrough: { kind: 'all' },
      watchedThroughAt: WATCHED_AT,
    });

    const stats = await callImport(authed(chunk({ shows: [longEntry, longEntry, longEntry] })));

    expect(stats.skipped.unmatched_anime_episode).toBe(20_000);
  });
});

describe('importSimklChunk — episode-group fallback for TVDB numbering', () => {
  // TMDB splits TVDB's 4-episode season 1 into seasons 1 (2 eps) and 2 (2 eps).
  const details = tvDetails(600, 'Numbered Differently', [
    { episode_count: 2, season_number: 1 },
    { episode_count: 2, season_number: 2 },
  ]);
  const seasons = { 1: season(600, 1, 2), 2: season(600, 2, 2) };
  const tvdbOrderGroup = {
    groups: [
      {
        episodes: [
          { ...seasons[2].episodes[1], order: 3 },
          ...seasons[1].episodes.map((e, i) => ({ ...e, order: i })),
          { ...seasons[2].episodes[0], order: 2 },
        ],
        name: 'Season 1',
        order: 1,
      },
    ],
  };
  const plays = [play(1, 1, WATCHED_AT), play(1, 3, WATCHED_AT), play(1, 4, WATCHED_AT)];

  it('remaps every play through the "TVDB order" group when TMDB numbering leaves some unplaced', async () => {
    seedPremiumUser();
    routeTmdb([
      [
        /\/tv\/600\/episode_groups\?/,
        {
          results: [
            { id: 'g-air', name: 'Aired Order' },
            { id: 'g-tvdb', name: 'TVDB Order' },
          ],
        },
      ],
      [/\/tv\/episode_group\/g-tvdb\?/, tvdbOrderGroup],
      ...tvRoutes(600, details, seasons),
    ]);

    const stats = await callImport(authed(chunk({ shows: [showEntity({ plays, tmdbId: 600 })] })));

    expect(
      Object.keys(getDoc('users/user-1/episode_tracking/600')?.episodes as object).sort()
    ).toEqual(['1_1', '2_1', '2_2']);
    expect(stats.skipped.unmatched_episode).toBeUndefined();
    expect(stats.unmatchedEpisodeTitles).toBeUndefined();
  });

  it('reports what still cannot be placed, naming the show, when there is no such group', async () => {
    seedPremiumUser();
    routeTmdb([
      [/\/tv\/600\/episode_groups\?/, { results: [{ id: 'g-air', name: 'Aired Order' }] }],
      ...tvRoutes(600, details, seasons),
    ]);

    const stats = await callImport(authed(chunk({ shows: [showEntity({ plays, tmdbId: 600 })] })));

    expect(stats.skipped.unmatched_episode).toBe(2);
    expect(stats.unmatchedEpisodeTitles).toEqual(['Numbered Differently']);
    expect(Object.keys(getDoc('users/user-1/episode_tracking/600')?.episodes as object)).toEqual([
      '1_1',
    ]);
  });

  it('does not look for episode groups when every play fits TMDB', async () => {
    seedPremiumUser();
    routeTmdb(tvRoutes(600, details, seasons));

    await callImport(
      authed(chunk({ shows: [showEntity({ plays: [play(1, 2, WATCHED_AT)], tmdbId: 600 })] }))
    );

    expect(tmdbCalls(/episode_group/)).toEqual([]);
  });
});

describe('importSimklChunk — anime numbering', () => {
  const details = tvDetails(700, 'Absolute Anime', [
    { episode_count: 1, season_number: 0 },
    { episode_count: 3, season_number: 1 },
    { episode_count: 3, season_number: 2 },
  ]);
  const seasons = { 1: season(700, 1, 3), 2: season(700, 2, 3) };

  it('numbers a single entry straight through TMDB seasons when the totals match', async () => {
    seedPremiumUser();
    routeTmdb(tvRoutes(700, details, seasons));

    const stats = await callImport(
      authed(
        chunk({
          shows: [
            showEntity({
              anime: { entryEpisodeTotal: 6, groupedEntries: 1 },
              plays: [play(1, 2, WATCHED_AT), play(1, 5, WATCHED_AT)],
              tmdbId: 700,
            }),
          ],
        })
      )
    );

    expect(
      Object.keys(getDoc('users/user-1/episode_tracking/700')?.episodes as object).sort()
    ).toEqual(['1_2', '2_2']);
    expect(stats.skipped.unmatched_anime_episode).toBeUndefined();
  });

  it('expands a completed single entry in its own numbering', async () => {
    seedPremiumUser();
    routeTmdb(tvRoutes(700, details, seasons));

    const stats = await callImport(
      authed(
        chunk({
          shows: [
            showEntity({
              anime: { entryEpisodeTotal: 6, groupedEntries: 1 },
              tmdbId: 700,
              watchedThrough: { kind: 'all' },
              watchedThroughAt: WATCHED_AT,
            }),
          ],
        })
      )
    );

    expect(stats.imported.watchedEpisodes).toBe(6);
  });

  it('does not guess when the entry total differs from TMDB (e.g. one cour of a longer show)', async () => {
    seedPremiumUser();
    routeTmdb(tvRoutes(700, details, seasons));

    const stats = await callImport(
      authed(
        chunk({
          shows: [
            showEntity({
              anime: { entryEpisodeTotal: 4, groupedEntries: 1 },
              plays: [play(1, 1, WATCHED_AT), play(1, 2, WATCHED_AT)],
              status: 'watching',
              tmdbId: 700,
            }),
          ],
        })
      )
    );

    expect(getDoc('users/user-1/episode_tracking/700')).toBeUndefined();
    expect(stats.skipped.unmatched_anime_episode).toBe(2);
    expect(stats.unmatchedEpisodeTitles).toEqual(['Absolute Anime']);
    // Show-level data is still imported.
    expect(getDoc('users/user-1/lists/currently-watching')).toMatchObject({
      items: { 'tv-700': expect.anything() },
    });
  });

  it('keeps grouped cours at show level only', async () => {
    seedPremiumUser();
    routeTmdb(tvRoutes(700, details, seasons));

    const stats = await callImport(
      authed(
        chunk({
          shows: [
            showEntity({
              anime: { entryEpisodeTotal: 6, groupedEntries: 2 },
              plays: [play(1, 1, WATCHED_AT)],
              tmdbId: 700,
            }),
          ],
        })
      )
    );

    expect(getDoc('users/user-1/episode_tracking/700')).toBeUndefined();
    expect(stats.skipped.unmatched_anime_episode).toBe(1);
  });
});

describe('importSimklChunk — payload validation', () => {
  it('accepts a show identified only by a TMDB id', async () => {
    seedPremiumUser();
    routeTmdb(tvRoutes(1396, tvDetails(1396, 'Breaking Bad', []), {}));
    await expect(
      callImport(
        authed(
          chunk({ shows: [showEntity({ imdbId: null, title: '', tmdbId: 1396, tvdbId: null })] })
        )
      )
    ).resolves.toBeDefined();
  });

  it.each([
    [{ watchedThrough: { kind: 'some' } }, 'watchedThrough.kind'],
    [{ watchedThrough: { episode: 0, kind: 'through', season: 1 } }, 'watchedThrough.episode'],
    [{ watchedThroughAt: -1 }, 'watchedThroughAt'],
    [{ anime: { entryEpisodeTotal: 12, groupedEntries: 0 } }, 'anime.groupedEntries'],
    [{ tmdbId: 'x' }, 'tmdbId'],
    [{ year: 99999 }, 'year'],
  ])('rejects %j', async (overrides, field) => {
    await expect(
      callImport(authed(chunk({ shows: [showEntity(overrides)] })))
    ).rejects.toMatchObject({ code: 'invalid-argument', message: expect.stringContaining(field) });
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chunk(overrides: Record<string, unknown>) {
  return { importId: 'import-1234', movies: [], shows: [], ...overrides };
}

function showEntity(overrides: Record<string, unknown> = {}) {
  return {
    addedAt: 1_600_000_000_000,
    favorite: false,
    imdbId: null,
    lists: [],
    plays: [],
    rating: null,
    status: null,
    title: 'Some Show',
    tvdbId: 81189,
    ...overrides,
  };
}

function movieEntity(overrides: Record<string, unknown> = {}) {
  return {
    addedAt: 1_600_000_000_000,
    favorite: false,
    imdbId: null,
    lists: [],
    rating: null,
    title: 'Inception',
    tvdbId: null,
    watches: [WATCHED_AT],
    watchlist: false,
    year: 2010,
    ...overrides,
  };
}

function play(seasonNumber: number, episode: number, watchedAt: number) {
  return { episode, season: seasonNumber, watchedAt };
}

function authed(data: unknown) {
  return { auth: { token: { firebase: { sign_in_provider: 'password' } }, uid: 'user-1' }, data };
}

function callImport(request: unknown): Promise<any> {
  return (importSimklChunk as any)(request);
}

function seedPremiumUser() {
  seedDoc('users/user-1', { premium: { isPremium: true } });
}

function seedDoc(path: string, data: Record<string, unknown>) {
  store.set(path, clone(data));
}

function getDoc(path: string): Record<string, unknown> | undefined {
  return clone(store.get(path));
}

function getDirectDocPaths(collectionPath: string): string[] {
  return [...store.keys()].filter((path) => isDirectChildDocPath(collectionPath, path)).sort();
}

function isDirectChildDocPath(collectionPath: string, docPath: string): boolean {
  if (!docPath.startsWith(`${collectionPath}/`)) return false;
  const suffix = docPath.slice(collectionPath.length + 1);
  return suffix.length > 0 && !suffix.includes('/');
}

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function createFetchResponse(payload: unknown, status = 200) {
  return Promise.resolve({
    headers: { get: () => null },
    json: async () => clone(payload),
    ok: status >= 200 && status < 300,
    status,
  });
}

function deepMerge(
  base: Record<string, unknown>,
  incoming: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = clone(base);
  Object.entries(incoming).forEach(([key, value]) => {
    if (value === '__deleteField__') {
      delete result[key];
      return;
    }
    const existingValue = result[key];
    result[key] =
      isPlainObject(existingValue) && isPlainObject(value)
        ? deepMerge(existingValue, value)
        : clone(value);
  });
  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
