let secretValue = 'tmdb-key';
const mockDefineSecret = jest.fn(() => ({
  value: () => secretValue,
}));
const firestoreFn: any = jest.fn();

jest.mock(
  'firebase-functions/params',
  () => ({
    defineSecret: mockDefineSecret,
  }),
  { virtual: true }
);

jest.mock(
  'firebase-admin',
  () => ({
    firestore: firestoreFn,
  }),
  { virtual: true }
);

jest.mock(
  'firebase-admin/firestore',
  () => ({
    FieldValue: {
      delete: jest.fn(() => '__deleteField__'),
    },
  }),
  { virtual: true }
);

import {
  TEST_TVTIME_IMPORT_COOLDOWN_MS,
  TVTIME_IMPORT_COOLDOWN_MS,
  TVTIME_IMPORT_MAX_CALLS_PER_MINUTE,
  TVTIME_IMPORT_MAX_PLAYS_PER_CHUNK,
  TVTIME_IMPORT_SESSION_STALE_MS,
} from '@/functions/src/shared/tvtimeImport';
import { createImportWriteContext, ensureCustomList } from '@/functions/src/importWrites';
import {
  claimTvTimeChunkSlot,
  markTvTimeImportFinished,
  importTvTimeChunk,
  isTvTimeCooldownBypassed,
  normalizeTitle,
  pickExactTitleMatch,
  splitTitleYear,
} from '@/functions/src/tvtimeImport';

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
    const pendingWrites: Array<() => Promise<void>> = [];
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

const BREAKING_BAD = {
  first_air_date: '2008-01-20',
  genre_ids: [18],
  id: 1396,
  name: 'Breaking Bad',
  poster_path: '/bb.jpg',
  vote_average: 8.9,
};

const ONGOING_SHOW = {
  first_air_date: '2020-01-01',
  genre_ids: [35],
  id: 500,
  name: 'Ongoing Show',
  poster_path: '/ongoing.jpg',
  vote_average: 7,
};

const INCEPTION = {
  genre_ids: [28],
  id: 27205,
  poster_path: '/inception.jpg',
  release_date: '2010-07-15',
  title: 'Inception',
  vote_average: 8.4,
};

function season(showId: number, seasonNumber: number, count: number) {
  return {
    episodes: Array.from({ length: count }, (_, index) => ({
      air_date: `2008-0${seasonNumber}-${String(index + 1).padStart(2, '0')}`,
      episode_number: index + 1,
      id: showId * 1000 + seasonNumber * 100 + index + 1,
      name: `S${seasonNumber}E${index + 1}`,
      runtime: 47,
      season_number: seasonNumber,
    })),
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

function tmdbCalls(pattern: RegExp): string[] {
  return mockFetch.mock.calls.map(([url]) => String(url)).filter((url) => pattern.test(url));
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(() => {
  Object.defineProperty(global, 'fetch', {
    configurable: true,
    value: mockFetch,
    writable: true,
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  store = new Map();
  secretValue = 'tmdb-key';
  process.env = { ...ORIGINAL_ENV };
  delete process.env.FUNCTIONS_EMULATOR;
  delete process.env.TRAKT_SYNC_BYPASS_UIDS;

  firestoreFn.mockImplementation(() => new MockFirestore(store));
  firestoreFn.Timestamp = {
    fromMillis: jest.fn((ms: number) => ({
      _ms: ms,
      toMillis: () => ms,
    })),
  };

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

describe('importTvTimeChunk — auth, gating and validation', () => {
  it('rejects unauthenticated and anonymous callers', async () => {
    await expect(callImport({ auth: undefined, data: chunk({}) })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    await expect(
      callImport({
        auth: { token: { firebase: { sign_in_provider: 'anonymous' } }, uid: 'user-1' },
        data: chunk({}),
      })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rejects non-premium users before contacting TMDB or touching the rate limiter', async () => {
    await expect(callImport(authed(chunk({ shows: [showEntity()] })))).rejects.toMatchObject({
      code: 'permission-denied',
      message: 'TV Time import requires Premium.',
    });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(getDoc('users/user-1/import_limits/tvtime')).toBeUndefined();
  });

  it.each([
    ['a malformed importId', { importId: 'bad id!' }, 'importId'],
    ['an unknown show status', { shows: [showEntity({ status: 'finished' })] }, 'status'],
    ['an invalid IMDb id', { movies: [movieEntity({ imdbId: '12345' })] }, 'imdbId'],
    [
      'an out-of-range rating',
      { shows: [showEntity({ rating: { ratedAt: 1, value: 11 } })] },
      'rating.value',
    ],
    [
      'an entity with no identifiers',
      { shows: [showEntity({ imdbId: null, title: '', tvdbId: null })] },
      'needs a tvdbId',
    ],
    [
      'a non-positive watch timestamp',
      { shows: [showEntity({ plays: [play(1, 1, 0)] })] },
      'watchedAt',
    ],
    ['a non-boolean final flag', { final: 'yes' }, 'final must be a boolean'],
    [
      'a timestamp past year 9999',
      { shows: [showEntity({ plays: [play(1, 1, 253_402_300_800_000)] })] },
      'no later than year 9999',
    ],
  ])('rejects %s', async (_name, overrides, messagePart) => {
    seedPremiumUser();
    await expect(
      callImport(authed(chunk(overrides as Record<string, unknown>)))
    ).rejects.toMatchObject({
      code: 'invalid-argument',
      message: expect.stringContaining(messagePart),
    });
  });

  it('rejects chunks above the play limit', async () => {
    seedPremiumUser();
    const plays = Array.from({ length: TVTIME_IMPORT_MAX_PLAYS_PER_CHUNK + 1 }, (_, index) =>
      play(1, index + 1, 1_700_000_000_000)
    );
    await expect(
      callImport(authed(chunk({ shows: [showEntity({ plays })] })))
    ).rejects.toMatchObject({
      code: 'invalid-argument',
      message: expect.stringContaining('episode plays'),
    });
  });
});

describe('importTvTimeChunk — shows', () => {
  it('resolves by TVDB id, fetches seasons in one request, and writes one tracking doc', async () => {
    seedPremiumUser();
    routeTmdb([
      [
        /\/find\/81189\?external_source=tvdb_id/,
        { tv_episode_results: [], tv_results: [BREAKING_BAD] },
      ],
      [
        /\/tv\/1396\?append_to_response=season\/1,season\/2/,
        {
          ...BREAKING_BAD,
          'season/1': season(1396, 1, 7),
          'season/2': season(1396, 2, 13),
          status: 'Ended',
        },
      ],
    ]);

    const result = await callImport(
      authed(
        chunk({
          shows: [
            showEntity({
              plays: [
                play(1, 1, 1_600_000_000_000),
                play(1, 2, 1_600_000_100_000),
                play(2, 1, 1_600_000_200_000),
                play(1, 1, 1_650_000_000_000), // rewatch → collapsed to latest
              ],
              status: 'up_to_date',
            }),
          ],
        })
      )
    );

    expect(result.imported).toMatchObject({ listItems: 1, shows: 1, watchedEpisodes: 3 });
    expect(result.ignored).toEqual({ rewatched_episodes: 1 });
    expect(tmdbCalls(/\/tv\/1396/)).toHaveLength(1);

    const tracking = getDoc('users/user-1/episode_tracking/1396')!;
    expect(tracking.episodes).toMatchObject({
      '1_1': {
        episodeAirDate: '2008-01-01',
        episodeId: 1396101,
        episodeName: 'S1E1',
        episodeNumber: 1,
        runtimeMinutes: 47,
        seasonNumber: 1,
        tvShowId: 1396,
        watchedAt: 1_650_000_000_000,
      },
      '1_2': expect.objectContaining({ watchedAt: 1_600_000_100_000 }),
      '2_1': expect.objectContaining({ episodeId: 1396201 }),
    });
    // lastUpdated is the latest real watch, not "now", so Watch Progress keeps viewing order.
    expect(tracking.metadata).toEqual({
      lastUpdated: 1_650_000_000_000,
      posterPath: '/bb.jpg',
      tvShowName: 'Breaking Bad',
    });
    // Ended + up_to_date → Already Watched
    expect(getDoc('users/user-1/lists/already-watched')).toMatchObject({
      items: { 'tv-1396': expect.objectContaining({ id: 1396, media_type: 'tv' }) },
      name: 'Already Watched',
    });
  });

  it('ignores TVDB episode hits when resolving a show id', async () => {
    seedPremiumUser();
    routeTmdb([
      [
        /\/find\/81189\?external_source=tvdb_id/,
        { tv_episode_results: [{ id: 1, show_id: 999 }], tv_results: [] },
      ],
      [/\/search\/tv\?query=Breaking%20Bad/, { results: [] }],
    ]);

    const result = await callImport(authed(chunk({ shows: [showEntity()] })));

    expect(result.imported.shows).toBe(0);
    expect(result.skipped).toEqual({ unresolved_show: 1 });
    expect(result.unresolvedTitles).toEqual(['Breaking Bad']);
  });

  it('maps up_to_date on an ongoing show to Currently Watching', async () => {
    seedPremiumUser();
    routeTmdb([
      [/\/find\/1\?external_source=tvdb_id/, { tv_results: [ONGOING_SHOW] }],
      [/\/tv\/500$|\/tv\/500\?api_key/, { ...ONGOING_SHOW, status: 'Returning Series' }],
    ]);

    await callImport(
      authed(
        chunk({
          shows: [
            showEntity({ plays: [], status: 'up_to_date', title: 'Ongoing Show', tvdbId: 1 }),
          ],
        })
      )
    );

    expect(getDoc('users/user-1/lists/currently-watching')).toMatchObject({
      items: { 'tv-500': expect.anything() },
      name: 'Watching',
    });
    expect(getDoc('users/user-1/lists/already-watched')).toBeUndefined();
  });

  it('repairs TVDB/TMDB numbering mismatches via the TVDB episode id', async () => {
    seedPremiumUser();
    routeTmdb([
      [/\/find\/81189\?external_source=tvdb_id/, { tv_results: [BREAKING_BAD] }],
      [
        /\/tv\/1396\?append_to_response=season\/1/,
        { ...BREAKING_BAD, 'season/1': season(1396, 1, 7) },
      ],
      // TV Time says S1E9, which TMDB doesn't have; TVDB id 555 is TMDB's S2E2.
      [
        /\/find\/555\?external_source=tvdb_id/,
        {
          tv_episode_results: [
            { episode_number: 2, id: 1396202, name: 'S2E2', season_number: 2, show_id: 1396 },
          ],
        },
      ],
      [/\/tv\/1396\/season\/2/, season(1396, 2, 13)],
      [/\/find\/556\?external_source=tvdb_id/, { tv_episode_results: [{ id: 1, show_id: 42 }] }],
    ]);

    const result = await callImport(
      authed(
        chunk({
          shows: [
            showEntity({
              plays: [
                { episode: 9, season: 1, tvdbEpisodeId: 555, watchedAt: 1_600_000_000_000 },
                { episode: 10, season: 1, tvdbEpisodeId: 556, watchedAt: 1_600_000_000_000 }, // other show → unmatched
                play(1, 11, 1_600_000_000_000), // no TVDB id → unmatched
              ],
            }),
          ],
        })
      )
    );

    expect(result.imported.watchedEpisodes).toBe(1);
    expect(result.skipped).toEqual({ unmatched_episode: 2 });
    expect(getDoc('users/user-1/episode_tracking/1396')?.episodes).toEqual({
      '2_2': expect.objectContaining({ episodeId: 1396202, runtimeMinutes: 47, seasonNumber: 2 }),
    });
  });

  it('never overwrites existing episodes or ratings', async () => {
    seedPremiumUser();
    seedDoc('users/user-1/episode_tracking/1396', {
      episodes: { '1_1': { episodeId: 1396101, watchedAt: 1_500_000_000_000 } },
      metadata: {
        hiddenFromProgress: true,
        lastUpdated: 1_700_000_000_000,
        posterPath: '/mine.jpg',
        tvShowName: 'Mine',
      },
    });
    seedDoc('users/user-1/ratings/tv-1396', { rating: 3, ratedAt: 1 });
    routeTmdb([
      [/\/find\/81189\?external_source=tvdb_id/, { tv_results: [BREAKING_BAD] }],
      [
        /\/tv\/1396\?append_to_response=season\/1/,
        { ...BREAKING_BAD, 'season/1': season(1396, 1, 7) },
      ],
    ]);

    const result = await callImport(
      authed(
        chunk({
          shows: [
            showEntity({
              plays: [play(1, 1, 1_650_000_000_000), play(1, 2, 1_650_000_000_000)],
              rating: { ratedAt: 1_650_000_000_000, value: 10 },
            }),
          ],
        })
      )
    );

    expect(result.imported).toMatchObject({ ratings: 0, watchedEpisodes: 1 });
    expect(result.skipped).toEqual({ already_tracked_episode: 1, existing_rating: 1 });

    const tracking = getDoc('users/user-1/episode_tracking/1396')!;
    expect((tracking.episodes as any)['1_1']).toEqual({
      episodeId: 1396101,
      watchedAt: 1_500_000_000_000,
    });
    expect((tracking.episodes as any)['1_2']).toEqual(
      expect.objectContaining({ watchedAt: 1_650_000_000_000 })
    );
    expect(tracking.metadata).toEqual({
      hiddenFromProgress: true,
      lastUpdated: 1_700_000_000_000,
      posterPath: '/mine.jpg',
      tvShowName: 'Mine',
    });
    expect(getDoc('users/user-1/ratings/tv-1396')).toEqual({ rating: 3, ratedAt: 1 });
  });

  it('writes lists, favorites and ratings only for the first part of a split show', async () => {
    seedPremiumUser();
    routeTmdb([
      [/\/find\/81189\?external_source=tvdb_id/, { tv_results: [BREAKING_BAD] }],
      [
        /\/tv\/1396\?append_to_response=season\/2/,
        { ...BREAKING_BAD, 'season/2': season(1396, 2, 13) },
      ],
    ]);

    const result = await callImport(
      authed(
        chunk({
          shows: [
            showEntity({
              favorite: true,
              lists: [{ addedAt: 1, name: 'Crime' }],
              part: { index: 1, total: 2 },
              plays: [play(2, 1, 1_600_000_000_000)],
              rating: { ratedAt: 1, value: 10 },
              status: 'watching',
            }),
          ],
        })
      )
    );

    expect(result.imported).toMatchObject({
      listItems: 0,
      ratings: 0,
      shows: 0,
      watchedEpisodes: 1,
    });
    expect(getDirectDocPaths('users/user-1/lists')).toEqual([]);
    expect(getDoc('users/user-1/ratings/tv-1396')).toBeUndefined();
  });

  it('falls back to exact title search and reports ambiguous titles', async () => {
    seedPremiumUser();
    routeTmdb([
      [
        /\/search\/tv\?query=The%20Office/,
        {
          results: [
            { first_air_date: '2005-03-24', id: 2316, name: 'The Office', poster_path: null },
            { first_air_date: '2001-07-09', id: 2996, name: 'The Office', poster_path: null },
            {
              first_air_date: '2010-01-01',
              id: 1,
              name: 'The Office Christmas',
              poster_path: null,
            },
          ],
        },
      ],
    ]);

    const ambiguous = await callImport(
      authed(chunk({ shows: [showEntity({ title: 'The Office', tvdbId: null })] }))
    );
    expect(ambiguous.skipped).toEqual({ ambiguous_title: 1 });
    expect(ambiguous.unresolvedTitles).toEqual(['The Office']);

    const byYear = await callImport(
      authed(
        chunk({
          shows: [showEntity({ status: 'watchlist', title: 'The Office (2005)', tvdbId: null })],
        })
      )
    );
    expect(byYear.skipped).toEqual({});
    expect(byYear.imported.shows).toBe(1);
  });
});

describe('importTvTimeChunk — movies', () => {
  it('resolves by IMDb id, writes deterministic watches, and is idempotent on re-run', async () => {
    seedPremiumUser();
    routeTmdb([[/\/find\/tt1375666\?external_source=imdb_id/, { movie_results: [INCEPTION] }]]);
    const request = authed(
      chunk({
        movies: [
          movieEntity({
            favorite: true,
            lists: [{ addedAt: 1_600_000_000_000, name: 'Nolan' }],
            rating: { ratedAt: 1_600_000_000_000, value: 8 },
            watches: [1_600_000_000_000, 1_650_000_000_000, 1_600_000_000_000],
          }),
        ],
      })
    );

    const first = await callImport(request);
    expect(first.imported).toEqual({
      customListsCreated: 1,
      listItems: 3, // already-watched, favorites, Nolan
      movies: 1,
      ratings: 1,
      shows: 0,
      watchedEpisodes: 0,
      watchedMovies: 2,
    });
    expect(getDirectDocPaths('users/user-1/watched_movies/27205/watches')).toEqual([
      'users/user-1/watched_movies/27205/watches/tvtime-27205-1600000000000',
      'users/user-1/watched_movies/27205/watches/tvtime-27205-1650000000000',
    ]);
    expect(getDoc('users/user-1/lists/already-watched')).toMatchObject({
      items: { 'movie-27205': expect.objectContaining({ addedAt: 1_650_000_000_000 }) },
    });

    const second = await callImport(request);
    expect(second.imported).toMatchObject({
      customListsCreated: 0,
      listItems: 0,
      movies: 0, // matched, but nothing new to add
      ratings: 0,
      watchedMovies: 0,
    });
    expect(second.skipped).toEqual({ existing_rating: 1 });
  });

  it('skips imported watches when ShowSeek already has its own watch for the movie', async () => {
    seedPremiumUser();
    seedDoc('users/user-1/watched_movies/27205/watches/manual-1', { movieId: 27205 });
    routeTmdb([[/\/find\/tt1375666\?external_source=imdb_id/, { movie_results: [INCEPTION] }]]);

    const result = await callImport(authed(chunk({ movies: [movieEntity()] })));

    expect(result.imported.watchedMovies).toBe(0);
    expect(result.skipped).toEqual({ already_tracked_movie: 1 });
    expect(getDirectDocPaths('users/user-1/watched_movies/27205/watches')).toEqual([
      'users/user-1/watched_movies/27205/watches/manual-1',
    ]);
  });

  it('resolves Data Extractor movies directly by TMDB id', async () => {
    seedPremiumUser();
    routeTmdb([
      [
        /\/movie\/27205\?api_key/,
        { ...INCEPTION, genre_ids: undefined, genres: [{ id: 28, name: 'Action' }] },
      ],
    ]);

    const result = await callImport(
      authed(chunk({ movies: [movieEntity({ imdbId: null, tmdbId: 27205 })] }))
    );

    expect(result.imported).toMatchObject({ movies: 1, watchedMovies: 1 });
    expect(tmdbCalls(/\/find\//)).toHaveLength(0);
    expect(getDoc('users/user-1/lists/already-watched')).toMatchObject({
      items: { 'movie-27205': expect.objectContaining({ genre_ids: [28], title: 'Inception' }) },
    });
  });

  it('matches GDPR movies (no ids) by title, then by the alternate title', async () => {
    seedPremiumUser();
    routeTmdb([
      [/\/search\/movie\?query=%EC%8A%B9%EB%A6%AC%ED%98%B8/, { results: [] }],
      [
        /\/search\/movie\?query=space%20sweepers/,
        {
          results: [
            { id: 581392, poster_path: null, release_date: '2021-02-05', title: 'Space Sweepers' },
          ],
        },
      ],
    ]);

    const result = await callImport(
      authed(
        chunk({
          movies: [
            movieEntity({ altTitle: 'space sweepers', imdbId: null, title: '승리호', year: 2021 }),
          ],
        })
      )
    );

    expect(result.imported.movies).toBe(1);
    expect(getDirectDocPaths('users/user-1/watched_movies/581392/watches')).toHaveLength(1);
  });
});

describe('ensureCustomList', () => {
  it('reuses a same-named list another call created meanwhile, and suffixes a different one', async () => {
    const db = new MockFirestore(store) as unknown as FirebaseFirestore.Firestore;
    // Both contexts load before either list exists, like two overlapping calls.
    const first = await createImportWriteContext(db, 'user-1');
    const second = await createImportWriteContext(db, 'user-1');

    expect(await ensureCustomList(first, 'Best of Korea')).toEqual({
      created: true,
      listId: 'best-of-korea',
    });
    expect(await ensureCustomList(second, 'best of korea')).toEqual({
      created: false,
      listId: 'best-of-korea',
    });

    // A different name that normalizes to the same id still gets its own list.
    seedDoc('users/user-1/lists/drama', { isCustom: true, items: {}, name: 'Drama!' });
    const third = { ...second, listCache: new Map(), listNameCache: new Map() };
    expect(await ensureCustomList(third, 'Drama')).toEqual({ created: true, listId: 'drama-1' });
    expect(getDirectDocPaths('users/user-1/lists')).toEqual([
      'users/user-1/lists/best-of-korea',
      'users/user-1/lists/drama',
      'users/user-1/lists/drama-1',
    ]);
  });
});

describe('claimTvTimeChunkSlot — rate limiting', () => {
  const T0 = 1_700_000_000_000;
  const db = () => new MockFirestore(store) as any;
  const limitDoc = () => getDoc('users/user-1/import_limits/tvtime') as any;

  it('lets the same import continue across chunks and counts them', async () => {
    await claimTvTimeChunkSlot(db(), 'user-1', 'import-A1', T0);
    await claimTvTimeChunkSlot(db(), 'user-1', 'import-A1', T0 + 5_000);

    expect(limitDoc().session).toEqual({
      chunks: 2,
      finishedAt: null,
      id: 'import-A1',
      lastChunkAt: T0 + 5_000,
      nextAllowedImportAt: T0 + TVTIME_IMPORT_COOLDOWN_MS,
      startedAt: T0,
    });
  });

  it('blocks a second import while the first is active, then applies the cooldown', async () => {
    await claimTvTimeChunkSlot(db(), 'user-1', 'import-A1', T0);

    await expect(
      claimTvTimeChunkSlot(db(), 'user-1', 'import-B1', T0 + 60_000)
    ).rejects.toMatchObject({
      code: 'already-exists',
      details: { reason: 'in_progress' },
    });

    const afterStale = T0 + TVTIME_IMPORT_SESSION_STALE_MS + 1;
    await expect(
      claimTvTimeChunkSlot(db(), 'user-1', 'import-B1', afterStale)
    ).rejects.toMatchObject({
      code: 'resource-exhausted',
      details: {
        nextAllowedImportAt: new Date(T0 + TVTIME_IMPORT_COOLDOWN_MS).toISOString(),
        reason: 'cooldown',
        retryAfterMs: TVTIME_IMPORT_COOLDOWN_MS - TVTIME_IMPORT_SESSION_STALE_MS - 1,
      },
    });

    // Resuming the original import is always allowed, even after it went stale.
    await expect(
      claimTvTimeChunkSlot(db(), 'user-1', 'import-A1', afterStale)
    ).resolves.toBeUndefined();

    await expect(
      claimTvTimeChunkSlot(
        db(),
        'user-1',
        'import-B1',
        T0 + TVTIME_IMPORT_COOLDOWN_MS + TVTIME_IMPORT_SESSION_STALE_MS
      )
    ).resolves.toBeUndefined();
    expect(limitDoc().session.id).toBe('import-B1');
  });

  it('lets a new import start once the previous one has finished, subject to the cooldown', async () => {
    const cooldown = 10_000;
    await claimTvTimeChunkSlot(db(), 'user-1', 'import-A1', T0, cooldown);
    await markTvTimeImportFinished(db(), 'user-1', 'import-A1', T0 + 1_000);
    expect(limitDoc().session.finishedAt).toBe(T0 + 1_000);

    // Not "already running" any more, but the cooldown from its start still applies.
    await expect(
      claimTvTimeChunkSlot(db(), 'user-1', 'import-B1', T0 + 2_000, cooldown)
    ).rejects.toMatchObject({ details: { reason: 'cooldown' } });
    await expect(
      claimTvTimeChunkSlot(db(), 'user-1', 'import-B1', T0 + cooldown, cooldown)
    ).resolves.toBeUndefined();
    expect(limitDoc().session).toMatchObject({ finishedAt: null, id: 'import-B1' });
  });

  it('treats a finished import as running again when its chunks are retried', async () => {
    await claimTvTimeChunkSlot(db(), 'user-1', 'import-A1', T0, 0);
    await markTvTimeImportFinished(db(), 'user-1', 'import-A1', T0 + 1_000);
    await claimTvTimeChunkSlot(db(), 'user-1', 'import-A1', T0 + 2_000, 0);

    await expect(
      claimTvTimeChunkSlot(db(), 'user-1', 'import-B1', T0 + 3_000, 0)
    ).rejects.toMatchObject({ details: { reason: 'in_progress' } });
  });

  it('only marks the current import finished', async () => {
    await claimTvTimeChunkSlot(db(), 'user-1', 'import-A1', T0);
    await markTvTimeImportFinished(db(), 'user-1', 'import-old1', T0 + 1_000);
    expect(limitDoc().session.finishedAt).toBeNull();
  });

  it('rejects bursts above the per-minute limit', async () => {
    for (let index = 0; index < TVTIME_IMPORT_MAX_CALLS_PER_MINUTE; index += 1) {
      await claimTvTimeChunkSlot(db(), 'user-1', 'import-A1', T0 + index);
    }

    await expect(
      claimTvTimeChunkSlot(db(), 'user-1', 'import-A1', T0 + TVTIME_IMPORT_MAX_CALLS_PER_MINUTE)
    ).rejects.toMatchObject({
      code: 'resource-exhausted',
      details: { reason: 'burst', retryAfterMs: 60_000 - TVTIME_IMPORT_MAX_CALLS_PER_MINUTE },
    });

    await expect(
      claimTvTimeChunkSlot(db(), 'user-1', 'import-A1', T0 + 60_000)
    ).resolves.toBeUndefined();
  });

  it('uses the short test cooldown for the emulator and allowlisted testers', () => {
    expect(isTvTimeCooldownBypassed('user-1')).toBe(false);

    process.env.TRAKT_SYNC_BYPASS_UIDS = 'tester-1, user-1';
    expect(isTvTimeCooldownBypassed('user-1')).toBe(true);

    process.env.TRAKT_SYNC_BYPASS_UIDS = '';
    process.env.FUNCTIONS_EMULATOR = 'true';
    expect(isTvTimeCooldownBypassed('user-1')).toBe(true);
    expect(TEST_TVTIME_IMPORT_COOLDOWN_MS).toBeLessThan(TVTIME_IMPORT_COOLDOWN_MS);
  });

  it('marks the import finished when the callable gets the final chunk', async () => {
    seedPremiumUser();
    await callImport(authed(chunk({})));
    expect(limitDoc().session.finishedAt).toBeNull();

    await callImport(authed(chunk({ final: true })));
    expect(limitDoc().session).toMatchObject({ chunks: 2, id: 'import-1234' });
    expect(limitDoc().session.finishedAt).toEqual(expect.any(Number));
  });

  it('is enforced by the callable before any TMDB request', async () => {
    seedPremiumUser();
    seedDoc('users/user-1/import_limits/tvtime', {
      recentCalls: [],
      session: {
        chunks: 3,
        id: 'import-old1',
        lastChunkAt: Date.now() - 1_000,
        nextAllowedImportAt: Date.now() + TVTIME_IMPORT_COOLDOWN_MS,
        startedAt: Date.now() - 60_000,
      },
      updatedAt: Date.now(),
    });

    await expect(callImport(authed(chunk({ shows: [showEntity()] })))).rejects.toMatchObject({
      code: 'already-exists',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('title helpers', () => {
  it('normalizes accents, punctuation and ampersands', () => {
    expect(normalizeTitle('Amélie')).toBe('amelie');
    expect(normalizeTitle('Law & Order: SVU')).toBe('law and order svu');
    expect(normalizeTitle('승리호')).toBe('승리호');
  });

  it('splits a trailing year', () => {
    expect(splitTitleYear('The Office (2005)')).toEqual({ title: 'The Office', year: 2005 });
    expect(splitTitleYear('1883')).toEqual({ title: '1883', year: null });
  });

  it('only accepts exact title matches', () => {
    const results = [{ name: 'Lost Girl' }, { name: 'Lost in Space' }];
    expect(
      pickExactTitleMatch(
        results,
        ['Lost'],
        (result) => [result.name],
        () => null,
        null,
        0
      )
    ).toEqual({ kind: 'unresolved' });
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
    title: 'Breaking Bad',
    tvdbId: 81189,
    ...overrides,
  };
}

function movieEntity(overrides: Record<string, unknown> = {}) {
  return {
    addedAt: 1_600_000_000_000,
    favorite: false,
    imdbId: 'tt1375666',
    lists: [],
    rating: null,
    title: 'Inception',
    tvdbId: null,
    watches: [1_600_000_000_000],
    watchlist: false,
    year: 2010,
    ...overrides,
  };
}

function play(seasonNumber: number, episode: number, watchedAt: number) {
  return { episode, season: seasonNumber, watchedAt };
}

function authed(data: unknown) {
  return {
    auth: { token: { firebase: { sign_in_provider: 'password' } }, uid: 'user-1' },
    data,
  };
}

function callImport(request: unknown): Promise<any> {
  return (importTvTimeChunk as any)(request);
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
  if (!docPath.startsWith(`${collectionPath}/`)) {
    return false;
  }
  const suffix = docPath.slice(collectionPath.length + 1);
  return suffix.length > 0 && !suffix.includes('/');
}

function clone<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function createFetchResponse(payload: unknown, status = 200, headers?: Record<string, string>) {
  return Promise.resolve({
    headers: {
      get: (name: string) => headers?.[name.toLowerCase()] ?? null,
    },
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
    if (isPlainObject(existingValue) && isPlainObject(value)) {
      result[key] = deepMerge(existingValue, value);
      return;
    }

    result[key] = clone(value);
  });

  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
