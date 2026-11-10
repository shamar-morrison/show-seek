/**
 * TV Time import — golden comparison test.
 *
 * Runs every TV Time fixture format end to end (on-device parser → chunker →
 * `importTvTimeChunk`) against an in-memory Firestore and a deterministic fake TMDB,
 * twice per format (the second run exercises the never-overwrite paths). It records
 * every Firestore document, every chunk's returned stats and every TMDB request, and
 * compares them with golden files in `__tests__/fixtures/tvtime/golden/`.
 *
 * The golden files were recorded from the TV Time import as it was before the shared
 * file-import refactor (main @ 5106f747). A failure means TV Time's behaviour changed.
 * Regenerate them ONLY when a TV Time change is intended:
 *
 *   UPDATE_TVTIME_GOLDEN=1 pnpm exec jest __tests__/utils/tvtimeImportGolden.test.ts
 */
import { importTvTimeChunk } from '@/functions/src/tvtimeImport';
import type { TvTimeShowEntity } from '@/functions/src/shared/tvtimeImport';
import type { PickedTvTimeFile } from '@/src/utils/tvtimeImport/files';
import { buildTvTimeChunks, prepareTvTimeImport } from '@/src/utils/tvtimeImport/prepare';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

// (babel-jest hoists these mocks above the imports, so they can't reference outer variables;
// the Firestore fake is wired up per test through jest.requireMock below.)
jest.mock('firebase-admin', () => ({ firestore: jest.fn() }), { virtual: true });
jest.mock(
  'firebase-admin/firestore',
  () => ({ FieldValue: { delete: jest.fn(() => '__deleteField__') } }),
  { virtual: true }
);
jest.mock(
  'firebase-functions/params',
  () => ({ defineSecret: () => ({ value: () => 'tmdb-key' }) }),
  { virtual: true }
);
jest.mock(
  'firebase-functions/v2/https',
  () => jest.requireActual('../../__mocks__/firebase-functions-v2-https.js'),
  { virtual: true }
);

const FIXTURES = join(__dirname, '../fixtures/tvtime');
const GOLDEN_DIR = join(FIXTURES, 'golden');
const UPDATE = process.env.UPDATE_TVTIME_GOLDEN === '1';
/** The fixtures were exported 2026-07-01 (same "now" as the parser tests). */
const PARSE_NOW = Date.UTC(2026, 6, 2);
/** Server clock for the first run; the second run is past the 6h cooldown. */
const RUN1_AT = Date.UTC(2026, 6, 3, 12);
const RUN2_AT = RUN1_AT + 7 * 60 * 60 * 1000;
const USER = 'user-1';
const AUTH = { token: { firebase: { sign_in_provider: 'password' } }, uid: USER };

// ---------------------------------------------------------------------------
// In-memory Firestore (same semantics as __tests__/functions/tvtimeImport.test.ts)
// ---------------------------------------------------------------------------

type Store = Map<string, Record<string, unknown>>;

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

function isDirectChildDocPath(collectionPath: string, docPath: string): boolean {
  if (!docPath.startsWith(`${collectionPath}/`)) return false;
  const suffix = docPath.slice(collectionPath.length + 1);
  return suffix.length > 0 && !suffix.includes('/');
}

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
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

// ---------------------------------------------------------------------------
// Deterministic fake TMDB. Answers are derived from the request alone, and are
// chosen to exercise every branch: missed lookups, IMDb/title fallbacks, ambiguous
// titles, 404s, missing seasons, gaps in episode numbering (→ TVDB episode-id
// repair), Ended/Canceled vs ongoing shows.
// ---------------------------------------------------------------------------

/** TVDB episode id → the show and episode it belongs to (built from the parsed plays). */
let episodeIndex = new Map<number, { showTvdb: number; season: number; episode: number }>();
let tmdbRequests: string[] = [];

function fnv(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

const tvIdFor = (key: string) => 10_000 + (fnv(`tv:${key}`) % 90_000);
const movieIdFor = (key: string) => 100_000 + (fnv(`movie:${key}`) % 90_000);
const yearFor = (key: string) => 1990 + (fnv(`year:${key}`) % 35);

function tvResult(id: number, name: string, year: number) {
  return {
    first_air_date: `${year}-03-01`,
    genre_ids: [18],
    id,
    name,
    original_name: name,
    poster_path: `/tv${id}.jpg`,
    vote_average: 7.5,
  };
}

function movieResult(id: number, title: string, year: number) {
  return {
    genre_ids: [28],
    id,
    original_title: title,
    poster_path: `/movie${id}.jpg`,
    release_date: `${year}-06-01`,
    title,
    vote_average: 6.5,
  };
}

function seasonData(showId: number, seasonNumber: number) {
  if (seasonNumber > 12 || (seasonNumber === 0 && showId % 2 === 1)) return null;
  const count = 8 + (fnv(`${showId}:${seasonNumber}`) % 20);
  const gap = fnv(`gap:${showId}:${seasonNumber}`) % 4 === 0 ? 3 : -1; // episode 3 missing
  const episodes = [];
  for (let episode = 1; episode <= count; episode += 1) {
    if (episode === gap) continue;
    episodes.push({
      air_date:
        episode % 9 === 0
          ? null
          : `${2000 + (seasonNumber % 20)}-01-${String((episode % 28) + 1).padStart(2, '0')}`,
      episode_number: episode,
      id: showId * 10_000 + seasonNumber * 100 + episode,
      name: `Episode ${seasonNumber}x${episode}`,
      runtime: episode % 4 === 0 ? null : 40 + (episode % 15),
      season_number: seasonNumber,
    });
  }
  return { episodes };
}

function showDetails(showId: number) {
  const statuses = ['Ended', 'Canceled', 'Returning Series', 'In Production'];
  return {
    ...tvResult(showId, `Show ${showId}`, 2000 + (showId % 20)),
    status: statuses[showId % statuses.length],
  };
}

function tmdbAnswer(url: URL): unknown {
  const path = url.pathname.replace(/^\/3/, '');
  const query = url.searchParams;

  let match = path.match(/^\/find\/(.+)$/);
  if (match) {
    const id = decodeURIComponent(match[1]);
    const source = query.get('external_source');
    const empty = { movie_results: [], person_results: [], tv_episode_results: [], tv_results: [] };

    if (source === 'tvdb_id' && episodeIndex.has(Number(id))) {
      const hit = episodeIndex.get(Number(id))!;
      if (fnv(`ep:${id}`) % 4 === 0) return empty;
      return {
        ...empty,
        tv_episode_results: [
          {
            air_date: '2011-11-11',
            episode_number: hit.episode,
            id: Number(id),
            name: `Repaired ${hit.season}x${hit.episode}`,
            // Off by one season, so the repair path maps to a different TMDB coordinate.
            season_number: hit.season + 1,
            // Same id the show lookup below hands out for this TVDB show.
            show_id: tvIdFor(`tvdb_id:${hit.showTvdb}`),
          },
        ],
      };
    }
    if (fnv(`${source}:${id}`) % 5 === 0) return empty;
    return {
      ...empty,
      movie_results: [movieResult(movieIdFor(`${source}:${id}`), `Movie ${id}`, yearFor(id))],
      tv_results: [tvResult(tvIdFor(`${source}:${id}`), `Show ${id}`, yearFor(id))],
    };
  }

  if (path === '/search/tv' || path === '/search/movie') {
    const title = query.get('query') ?? '';
    const isTv = path === '/search/tv';
    const make = isTv ? tvResult : movieResult;
    const idFor = isTv ? tvIdFor : movieIdFor;
    const bucket = fnv(`${path}:${title}`) % 6;
    if (bucket === 0) return { results: [] };
    if (bucket === 1) {
      // Two exact matches, different years: ambiguous unless the entity's year decides.
      return {
        results: [make(idFor(`a:${title}`), title, 1999), make(idFor(`b:${title}`), title, 2016)],
      };
    }
    return {
      results: [
        make(idFor(`t:${title}`), title, yearFor(title)),
        make(idFor(`x:${title}`), `${title} Extra`, yearFor(title)),
      ],
    };
  }

  match = path.match(/^\/movie\/(\d+)$/);
  if (match) {
    const id = Number(match[1]);
    if (id % 7 === 0) return 404;
    return { ...movieResult(id, `Movie ${id}`, yearFor(String(id))), genres: [{ id: 18 }] };
  }

  match = path.match(/^\/tv\/(\d+)\/season\/(\d+)$/);
  if (match) {
    return seasonData(Number(match[1]), Number(match[2])) ?? 404;
  }

  match = path.match(/^\/tv\/(\d+)$/);
  if (match) {
    const showId = Number(match[1]);
    const details: Record<string, unknown> = showDetails(showId);
    for (const part of (query.get('append_to_response') ?? '').split(',').filter(Boolean)) {
      const season = seasonData(showId, Number(part.replace('season/', '')));
      if (season) details[part] = season;
    }
    return details;
  }

  throw new Error(`Unexpected TMDB request: ${url.pathname}?${query}`);
}

const mockFetch = jest.fn(async (input: string) => {
  const url = new URL(input);
  tmdbRequests.push(
    `${url.pathname}?${[...url.searchParams]
      .filter(([k]) => k !== 'api_key')
      .map(([k, v]) => `${k}=${v}`)
      .join('&')}`
  );
  const body = tmdbAnswer(url);
  const status = body === 404 ? 404 : 200;
  return {
    headers: { get: () => null },
    json: async () => clone(body === 404 ? {} : body),
    ok: status === 200,
    status,
  };
});

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

function looseFiles(format: string): PickedTvTimeFile[] {
  return readdirSync(join(FIXTURES, format))
    .sort()
    .map((name) => ({ bytes: new Uint8Array(readFileSync(join(FIXTURES, format, name))), name }));
}

/** A 1,600-play show: the chunker splits it into parts, and only part 0 writes lists/rating. */
function splitShowChunks() {
  const plays = [];
  for (let season = 1; season <= 20; season += 1) {
    for (let episode = 1; episode <= 80; episode += 1) {
      plays.push({
        episode,
        season,
        watchedAt: Date.UTC(2020, 0, 1) + (season * 100 + episode) * 60_000,
      });
    }
  }
  const show: TvTimeShowEntity = {
    addedAt: Date.UTC(2019, 0, 1),
    favorite: true,
    imdbId: 'tt0388629',
    lists: [{ addedAt: Date.UTC(2019, 0, 2), name: 'Anime' }],
    plays,
    rating: { ratedAt: Date.UTC(2021, 0, 1), value: 9 },
    status: 'up_to_date',
    title: 'One Piece',
    tvdbId: 81797,
  };
  return buildTvTimeChunks([show], []);
}

const SCENARIOS: Record<string, () => ReturnType<typeof buildTvTimeChunks>> = {
  extractor: () => prepareTvTimeImport(looseFiles('extractor'), PARSE_NOW).chunks,
  gdpr: () => prepareTvTimeImport(looseFiles('gdpr'), PARSE_NOW).chunks,
  'gdpr-minimal': () => prepareTvTimeImport(looseFiles('gdpr-minimal'), PARSE_NOW).chunks,
  liberator: () => prepareTvTimeImport(looseFiles('liberator'), PARSE_NOW).chunks,
  refract: () => prepareTvTimeImport(looseFiles('refract'), PARSE_NOW).chunks,
  'split-show': splitShowChunks,
};

async function runImport(
  chunks: ReturnType<typeof buildTvTimeChunks>,
  importId: string,
  now: number
): Promise<unknown[]> {
  jest.spyOn(Date, 'now').mockReturnValue(now);
  const results: unknown[] = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const data = {
      ...chunks[index],
      importId,
      ...(index === chunks.length - 1 ? { final: true } : {}),
    };
    try {
      results.push({ ok: await (importTvTimeChunk as any)({ auth: AUTH, data: clone(data) }) });
    } catch (error: any) {
      results.push({ error: { code: error.code, details: error.details, message: error.message } });
    }
  }
  return results;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key])])
    );
  }
  return value;
}

function countRequests(requests: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const request of [...requests].sort()) counts[request] = (counts[request] ?? 0) + 1;
  return counts;
}

beforeAll(() => {
  Object.defineProperty(global, 'fetch', { configurable: true, value: mockFetch, writable: true });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('TV Time import — golden comparison (behaviour must not change)', () => {
  it.each(Object.keys(SCENARIOS))('%s', async (scenario) => {
    const store: Store = new Map();
    store.set(`users/${USER}`, { premium: { isPremium: true } });
    const firestore = (jest.requireMock('firebase-admin') as { firestore: any }).firestore;
    firestore.mockImplementation(() => new MockFirestore(store));
    firestore.Timestamp = { fromMillis: (ms: number) => ({ _ms: ms }) };
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    delete process.env.FUNCTIONS_EMULATOR;
    delete process.env.TRAKT_SYNC_BYPASS_UIDS;

    const chunks = SCENARIOS[scenario]();
    episodeIndex = new Map();
    for (const chunk of chunks) {
      for (const show of chunk.shows) {
        for (const play of show.plays) {
          if (play.tvdbEpisodeId !== undefined && show.tvdbId !== null) {
            episodeIndex.set(play.tvdbEpisodeId, {
              episode: play.episode,
              season: play.season,
              showTvdb: show.tvdbId,
            });
          }
        }
      }
    }

    tmdbRequests = [];
    const run1 = await runImport(chunks, 'golden-run-1', RUN1_AT);
    const run1Requests = countRequests(tmdbRequests);

    tmdbRequests = [];
    const run2 = await runImport(chunks, 'golden-run-2', RUN2_AT);
    const run2Requests = countRequests(tmdbRequests);

    const actual = sortKeys(
      clone({
        chunks: chunks.length,
        run1: { results: run1, tmdbRequests: run1Requests },
        run2: { results: run2, tmdbRequests: run2Requests },
        store: Object.fromEntries([...store.entries()].sort(([a], [b]) => a.localeCompare(b))),
      })
    );

    // Guard against a vacuous recording (checked before writing or comparing): every chunk
    // must succeed, and the first run must actually import episodes or movies and call TMDB.
    const results = [...run1, ...run2] as { error?: unknown; ok?: any }[];
    expect(results.filter((result) => result.error)).toEqual([]);
    const imported = run1.reduce(
      (total: number, result: any) =>
        total + result.ok.imported.watchedEpisodes + result.ok.imported.watchedMovies,
      0
    );
    expect(imported).toBeGreaterThan(0);
    expect(Object.keys(run1Requests).length).toBeGreaterThan(0);
    expect(store.size).toBeGreaterThan(5);

    const goldenPath = join(GOLDEN_DIR, `${scenario}.json`);
    if (UPDATE) {
      mkdirSync(GOLDEN_DIR, { recursive: true });
      writeFileSync(goldenPath, `${JSON.stringify(actual, null, 2)}\n`);
      return;
    }

    expect(existsSync(goldenPath)).toBe(true);
    expect(actual).toEqual(JSON.parse(readFileSync(goldenPath, 'utf8')));
  });
});
