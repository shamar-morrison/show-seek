/**
 * importShowlyChunk — the Showly configuration of the shared file-import core: its own
 * rate-limit doc (same rules as TV Time and Simkl), entities identified by a TMDB id
 * alone, and the `following` status that picks Already Watched or Watching.
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

import {
  FILE_IMPORT_COOLDOWN_MS,
  FILE_IMPORT_MAX_CALLS_PER_MINUTE,
  FILE_IMPORT_MAX_CHUNKS_PER_SESSION,
} from '@/functions/src/shared/fileImport';
import { SHOWLY_IMPORT_SOURCE, importShowlyChunk } from '@/functions/src/showlyImport';

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

describe('importShowlyChunk — source configuration', () => {
  it('pins the Showly source configuration (stored ids and messages depend on it)', () => {
    expect(SHOWLY_IMPORT_SOURCE).toEqual({
      displayName: 'Showly',
      episodeGroupFallback: true,
      limitDocId: 'showly',
      logTag: '[showlyImport]',
      movieWatchDocPrefix: 'showly-',
      reportUnmatchedEpisodeTitles: true,
    });
  });

  it('names Showly in the premium message', async () => {
    await expect(callImport(authed(chunk({})))).rejects.toMatchObject({
      code: 'permission-denied',
      message: 'Showly import requires Premium.',
    });
  });

  it('writes movie watches with the showly- prefix', async () => {
    seedPremiumUser();
    routeTmdb([[/\/movie\/1368337\?/, movieDetails(1368337, 'The Odyssey')]]);

    await callImport(authed(chunk({ movies: [movieEntity({ tmdbId: 1368337 })] })));

    expect(getDirectDocPaths('users/user-1/watched_movies/1368337/watches')).toEqual([
      `users/user-1/watched_movies/1368337/watches/showly-1368337-${WATCHED_AT}`,
    ]);
  });
});

describe('importShowlyChunk — rate limiting (same rules as the other file imports)', () => {
  const now = () => Date.now();

  function seedLimit(source: string, session: Record<string, unknown>, recentCalls: number[] = []) {
    seedDoc(`users/user-1/import_limits/${source}`, {
      recentCalls,
      session: {
        chunks: 1,
        finishedAt: null,
        id: 'other-import-1',
        lastChunkAt: now(),
        nextAllowedImportAt: now() + FILE_IMPORT_COOLDOWN_MS,
        startedAt: now(),
        ...session,
      },
      updatedAt: now(),
    });
  }

  it('keeps its own doc, so recent TV Time and Simkl imports do not block it', async () => {
    seedPremiumUser();
    seedLimit('tvtime', {});
    seedLimit('simkl', {});

    await expect(callImport(authed(chunk({})))).resolves.toBeDefined();
    expect(getDoc('users/user-1/import_limits/showly')).toMatchObject({
      session: { chunks: 1, id: 'import-1234' },
    });
  });

  it('refuses a second Showly import while one is in progress', async () => {
    seedPremiumUser();
    await callImport(authed(chunk({})));
    await expect(callImport(authed(chunk({ importId: 'import-5678' })))).rejects.toMatchObject({
      code: 'already-exists',
      details: expect.objectContaining({ reason: 'in_progress' }),
      message: 'A Showly import is already in progress.',
    });
  });

  it('applies the cooldown after a finished import', async () => {
    seedPremiumUser();
    seedLimit('showly', { finishedAt: now() });

    await expect(callImport(authed(chunk({})))).rejects.toMatchObject({
      code: 'resource-exhausted',
      details: expect.objectContaining({
        nextAllowedImportAt: expect.any(String),
        reason: 'cooldown',
      }),
      message: 'Please wait before starting another Showly import.',
    });
  });

  it('continues the same import during the cooldown', async () => {
    seedPremiumUser();
    seedLimit('showly', { id: 'import-1234' });

    await expect(callImport(authed(chunk({})))).resolves.toBeDefined();
    expect(getDoc('users/user-1/import_limits/showly')).toMatchObject({
      session: { chunks: 2, id: 'import-1234' },
    });
  });

  it('refuses bursts over the per-minute limit', async () => {
    seedPremiumUser();
    seedLimit(
      'showly',
      { id: 'import-1234' },
      Array.from({ length: FILE_IMPORT_MAX_CALLS_PER_MINUTE }, () => now())
    );

    await expect(callImport(authed(chunk({})))).rejects.toMatchObject({
      code: 'resource-exhausted',
      details: expect.objectContaining({ reason: 'burst', retryAfterMs: expect.any(Number) }),
    });
  });

  it('refuses an import over the per-run chunk cap', async () => {
    seedPremiumUser();
    seedLimit('showly', { chunks: FILE_IMPORT_MAX_CHUNKS_PER_SESSION, id: 'import-1234' });

    await expect(callImport(authed(chunk({})))).rejects.toMatchObject({
      code: 'resource-exhausted',
      details: expect.objectContaining({ reason: 'session_chunks' }),
    });
  });

  it('marks the run finished on the final chunk', async () => {
    seedPremiumUser();
    await callImport(authed(chunk({ final: true })));

    expect(getDoc('users/user-1/import_limits/showly')).toMatchObject({
      session: { finishedAt: expect.any(Number), id: 'import-1234' },
    });
  });
});

describe('importShowlyChunk — entities identified by a TMDB id alone', () => {
  it('accepts a movie with a TMDB id and no title (a Showly list item)', async () => {
    seedPremiumUser();
    routeTmdb([[/\/movie\/969681\?/, movieDetails(969681, 'Listed Movie')]]);

    const stats = await callImport(
      authed(
        chunk({
          movies: [
            movieEntity({
              lists: [{ addedAt: 1_700_000_000_000, name: 'showly 1' }],
              title: '',
              tmdbId: 969681,
              watches: [],
              year: null,
            }),
          ],
        })
      )
    );

    expect(stats.imported).toMatchObject({ customListsCreated: 1, listItems: 1, movies: 1 });
    expect(findList('showly 1')).toMatchObject({
      items: { 'movie-969681': expect.objectContaining({ id: 969681, title: 'Listed Movie' }) },
    });
  });

  it('accepts a show with a TMDB id and no title', async () => {
    seedPremiumUser();
    routeTmdb(
      tvRoutes(1399, tvDetails(1399, 'Game of Thrones', [{ episode_count: 2, season_number: 1 }]), {
        1: season(1399, 1, 2),
      })
    );

    const stats = await callImport(
      authed(
        chunk({
          shows: [
            showEntity({
              rating: { ratedAt: WATCHED_AT, value: 9 },
              title: '',
              tmdbId: 1399,
              tvdbId: null,
            }),
          ],
        })
      )
    );

    expect(stats.imported).toMatchObject({ ratings: 1, shows: 1 });
  });

  it('still rejects a movie with no identifier at all', async () => {
    seedPremiumUser();
    await expect(
      callImport(authed(chunk({ movies: [movieEntity({ title: '', year: null })] })))
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('reports a TMDB id that no longer exists as unresolved, without a title search', async () => {
    seedPremiumUser();
    routeTmdb([[/\/movie\/424242\?/, 404]]);

    const stats = await callImport(
      authed(chunk({ movies: [movieEntity({ title: '', tmdbId: 424242, year: null })] }))
    );

    expect(stats.skipped).toEqual({ unresolved_movie: 1 });
    expect(tmdbCalls(/\/search\//)).toEqual([]);
  });
});

describe('importShowlyChunk — list descriptions', () => {
  const listed = (lists: Record<string, unknown>[]) =>
    movieEntity({ lists, title: '', tmdbId: 969681, watches: [], year: null });

  beforeEach(() => {
    seedPremiumUser();
    routeTmdb([[/\/movie\/969681\?/, movieDetails(969681, 'Listed Movie')]]);
  });

  it('writes the description on a list the import creates', async () => {
    await callImport(
      authed(
        chunk({ movies: [listed([{ addedAt: 1, description: 'Crime picks', name: 'Crime' }])] })
      )
    );

    expect(findList('Crime')).toMatchObject({ description: 'Crime picks', isCustom: true });
  });

  it('leaves an existing list without a description as it is', async () => {
    seedDoc('users/user-1/lists/crime', { createdAt: 1, isCustom: true, items: {}, name: 'Crime' });

    await callImport(
      authed(
        chunk({ movies: [listed([{ addedAt: 1, description: 'Crime picks', name: 'crime' }])] })
      )
    );

    const list = getDoc('users/user-1/lists/crime');
    expect(list).not.toHaveProperty('description');
    // The item still goes in.
    expect(list).toMatchObject({ items: { 'movie-969681': expect.anything() } });
  });

  it("never replaces a list's existing description", async () => {
    seedDoc('users/user-1/lists/crime', {
      createdAt: 1,
      description: 'Mine',
      isCustom: true,
      items: {},
      name: 'Crime',
    });

    await callImport(
      authed(
        chunk({ movies: [listed([{ addedAt: 1, description: 'Crime picks', name: 'Crime' }])] })
      )
    );

    expect(getDoc('users/user-1/lists/crime')).toMatchObject({ description: 'Mine' });
  });

  it('creates a list without a description when none is sent', async () => {
    await callImport(authed(chunk({ movies: [listed([{ addedAt: 1, name: 'Plain' }])] })));

    expect(findList('Plain')).not.toHaveProperty('description');
  });

  it('rejects a description over 120 characters', async () => {
    await expect(
      callImport(
        authed(
          chunk({ movies: [listed([{ addedAt: 1, description: 'x'.repeat(121), name: 'Long' }])] })
        )
      )
    ).rejects.toMatchObject({
      code: 'invalid-argument',
      message: expect.stringContaining('description'),
    });
  });
});

describe('importShowlyChunk — following (Showly "My Shows")', () => {
  const ended = (count = 2) =>
    tvRoutes(
      1396,
      tvDetails(1396, 'Breaking Bad', [
        { episode_count: 0, season_number: 0 },
        { episode_count: count, season_number: 1 },
        { episode_count: count, season_number: 2 },
      ]),
      { 1: season(1396, 1, count), 2: season(1396, 2, count) }
    );

  const allPlays = (count = 2) =>
    [1, 2].flatMap((seasonNumber) =>
      Array.from({ length: count }, (_, index) => play(seasonNumber, index + 1, WATCHED_AT))
    );

  it('puts an ended show with every episode watched in Already Watched', async () => {
    seedPremiumUser();
    routeTmdb(ended());

    await callImport(authed(chunk({ shows: [following({ plays: allPlays() })] })));

    expect(getDoc('users/user-1/lists/already-watched')).toMatchObject({
      items: { 'tv-1396': expect.anything() },
    });
    expect(getDoc('users/user-1/lists/currently-watching')).toBeUndefined();
  });

  it('puts an ended show with episodes missing in Watching', async () => {
    seedPremiumUser();
    routeTmdb(ended());

    await callImport(authed(chunk({ shows: [following({ plays: allPlays().slice(1) })] })));

    expect(getDoc('users/user-1/lists/currently-watching')).toMatchObject({
      items: { 'tv-1396': expect.anything() },
    });
    expect(getDoc('users/user-1/lists/already-watched')).toBeUndefined();
  });

  it('counts episodes already tracked in ShowSeek', async () => {
    seedPremiumUser();
    routeTmdb(ended());
    seedDoc('users/user-1/episode_tracking/1396', {
      episodes: { '1_1': { episodeNumber: 1, seasonNumber: 1, tvShowId: 1396, watchedAt: 1 } },
      metadata: { lastUpdated: 1, posterPath: null, tvShowName: 'Breaking Bad' },
    });

    await callImport(authed(chunk({ shows: [following({ plays: allPlays().slice(1) })] })));

    expect(getDoc('users/user-1/lists/already-watched')).toMatchObject({
      items: { 'tv-1396': expect.anything() },
    });
  });

  it('keeps a fully watched show that is still running in Watching', async () => {
    seedPremiumUser();
    routeTmdb(
      tvRoutes(
        1396,
        tvDetails(
          1396,
          'Breaking Bad',
          [{ episode_count: 2, season_number: 1 }],
          'Returning Series'
        ),
        { 1: season(1396, 1, 2) }
      )
    );

    await callImport(
      authed(
        chunk({
          shows: [following({ plays: [play(1, 1, WATCHED_AT), play(1, 2, WATCHED_AT)] })],
        })
      )
    );

    expect(getDoc('users/user-1/lists/currently-watching')).toMatchObject({
      items: { 'tv-1396': expect.anything() },
    });
  });

  it('puts a followed show with nothing watched in Watching', async () => {
    seedPremiumUser();
    routeTmdb(ended());

    const stats = await callImport(authed(chunk({ shows: [following({ plays: [] })] })));

    expect(stats.imported).toMatchObject({ listItems: 1, shows: 1 });
    expect(getDoc('users/user-1/lists/currently-watching')).toMatchObject({
      items: { 'tv-1396': expect.anything() },
    });
  });

  it('decides a split show on its last part, after every part is written', async () => {
    seedPremiumUser();
    routeTmdb(ended());
    const plays = allPlays();

    await callImport(
      authed(
        chunk({
          shows: [following({ part: { index: 0, total: 2 }, plays: plays.slice(0, 2) })],
        })
      )
    );
    expect(getDoc('users/user-1/lists/already-watched')).toBeUndefined();
    expect(getDoc('users/user-1/lists/currently-watching')).toBeUndefined();

    await callImport(
      authed(
        chunk({
          shows: [following({ part: { index: 1, total: 2 }, plays: plays.slice(2) })],
        })
      )
    );
    expect(getDoc('users/user-1/lists/already-watched')).toMatchObject({
      items: { 'tv-1396': expect.anything() },
    });
    expect(getDoc('users/user-1/lists/currently-watching')).toBeUndefined();
  });

  it('writes the rating and custom lists on the first part only', async () => {
    seedPremiumUser();
    routeTmdb(ended());
    const extras = {
      lists: [{ addedAt: 1_700_000_000_000, name: 'Crime' }],
      rating: { ratedAt: WATCHED_AT, value: 10 },
    };

    const first = await callImport(
      authed(chunk({ shows: [following({ ...extras, part: { index: 0, total: 2 }, plays: [] })] }))
    );
    const last = await callImport(
      authed(chunk({ shows: [following({ ...extras, part: { index: 1, total: 2 }, plays: [] })] }))
    );

    expect(first.imported).toMatchObject({ customListsCreated: 1, ratings: 1 });
    expect(last.imported).toMatchObject({ customListsCreated: 0, listItems: 1, ratings: 0 });
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

function following(overrides: Record<string, unknown> = {}) {
  return showEntity({
    status: 'following',
    title: 'Breaking Bad',
    tmdbId: 1396,
    tvdbId: null,
    ...overrides,
  });
}

function movieDetails(id: number, title: string) {
  return {
    genres: [{ id: 18 }],
    id,
    poster_path: `/m${id}.jpg`,
    release_date: '2026-07-17',
    title,
  };
}

/** A custom list by its name (its doc id is derived from the name). */
function findList(name: string): Record<string, unknown> | undefined {
  const entry = [...store.entries()].find(
    ([path, value]) => isDirectChildDocPath('users/user-1/lists', path) && value.name === name
  );
  return entry ? clone(entry[1]) : undefined;
}

function authed(data: unknown) {
  return { auth: { token: { firebase: { sign_in_provider: 'password' } }, uid: 'user-1' }, data };
}

function callImport(request: unknown): Promise<any> {
  return (importShowlyChunk as any)(request);
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
