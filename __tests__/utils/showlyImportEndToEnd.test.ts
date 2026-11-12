/**
 * Showly import end to end: the real showly_export.json → on-device parser → chunker →
 * `importShowlyChunk`, against an in-memory Firestore and a deterministic fake TMDB.
 * Proves the client output and the server agree on real data.
 */
import type { FileImportStats } from '@/functions/src/shared/fileImport';
import { importShowlyChunk } from '@/functions/src/showlyImport';
import { prepareShowlyImport } from '@/src/utils/showlyImport/prepare';
import { readFileSync } from 'fs';
import { join } from 'path';

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

const NOW = Date.UTC(2026, 10, 12, 7);
const USER = 'user-1';
type Store = Map<string, Record<string, unknown>>;

// ---------------------------------------------------------------------------
// In-memory Firestore (same semantics as the TV Time tests)
// ---------------------------------------------------------------------------

class Snap {
  constructor(
    readonly ref: Ref,
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
class Ref {
  constructor(
    readonly path: string,
    private readonly store: Store
  ) {}
  get id() {
    return this.path.split('/').at(-1) ?? '';
  }
  collection(name: string) {
    return new Coll(`${this.path}/${name}`, this.store);
  }
  async get() {
    return new Snap(this, this.store.get(this.path));
  }
  async create(value: Record<string, unknown>) {
    if (this.store.has(this.path)) throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
    this.store.set(this.path, clone(value));
  }
  async set(value: Record<string, unknown>, options?: { merge?: boolean }) {
    this.store.set(
      this.path,
      options?.merge ? deepMerge(this.store.get(this.path) ?? {}, value) : clone(value)
    );
  }
}
class Coll {
  constructor(
    readonly path: string,
    private readonly store: Store
  ) {}
  doc(id: string) {
    return new Ref(`${this.path}/${id}`, this.store);
  }
  async get() {
    const docs = [...this.store.entries()]
      .filter(([path]) => {
        if (!path.startsWith(`${this.path}/`)) return false;
        const rest = path.slice(this.path.length + 1);
        return rest.length > 0 && !rest.includes('/');
      })
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, value]) => new Snap(new Ref(path, this.store), value));
    return {
      docs,
      empty: docs.length === 0,
      forEach: (fn: (s: Snap) => void) => docs.forEach(fn),
      size: docs.length,
    };
  }
}
class Db {
  constructor(private readonly store: Store) {}
  collection(name: string) {
    return new Coll(name, this.store);
  }
  async runTransaction<T>(callback: (transaction: unknown) => Promise<T>): Promise<T> {
    const writes: (() => Promise<void>)[] = [];
    const result = await callback({
      get: (ref: Ref) => ref.get(),
      set: (ref: Ref, value: Record<string, unknown>, options?: { merge?: boolean }) => {
        writes.push(() => ref.set(value, options));
      },
    });
    for (const write of writes) await write();
    return result;
  }
}

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}
function deepMerge(base: Record<string, unknown>, incoming: Record<string, unknown>) {
  const result: Record<string, unknown> = clone(base);
  Object.entries(incoming).forEach(([key, value]) => {
    if (value === '__deleteField__') {
      delete result[key];
      return;
    }
    const existing = result[key];
    result[key] = isObject(existing) && isObject(value) ? deepMerge(existing, value) : clone(value);
  });
  return result;
}
function isObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Fake TMDB: every show has 3 seasons of 10 episodes aired in 2000; movies exist.
// ---------------------------------------------------------------------------

const requests: string[] = [];
function tmdb(url: URL): unknown {
  const path = url.pathname.replace(/^\/3/, '');
  const q = url.searchParams;
  let m = path.match(/^\/tv\/(\d+)\/season\/(\d+)$/);
  if (m) return Number(m[2]) >= 1 && Number(m[2]) <= 3 ? seasonOf(Number(m[1]), Number(m[2])) : 404;
  m = path.match(/^\/tv\/(\d+)$/);
  if (m) {
    const id = Number(m[1]);
    const details: Record<string, unknown> = {
      first_air_date: '2000-01-01',
      genres: [{ id: 18 }],
      id,
      name: `Show ${id}`,
      poster_path: `/s${id}.jpg`,
      seasons: [1, 2, 3].map((n) => ({ episode_count: 10, season_number: n })),
      status: id % 2 ? 'Ended' : 'Returning Series',
    };
    for (const part of (q.get('append_to_response') ?? '').split(',').filter(Boolean)) {
      const n = Number(part.replace('season/', ''));
      if (n >= 1 && n <= 3) details[part] = seasonOf(id, n);
    }
    return details;
  }
  if (/^\/tv\/\d+\/episode_groups$/.test(path)) return { results: [] };
  m = path.match(/^\/movie\/(\d+)$/);
  if (m)
    return {
      genres: [{ id: 18 }],
      id: Number(m[1]),
      poster_path: null,
      release_date: '2001-01-01',
      title: `Movie ${m[1]}`,
    };
  if (path.startsWith('/find/'))
    return { movie_results: [], tv_episode_results: [], tv_results: [] };
  if (path === '/search/tv' || path === '/search/movie') return { results: [] };
  throw new Error(`Unexpected TMDB request ${url}`);
}
function seasonOf(showId: number, season: number) {
  return {
    episodes: Array.from({ length: 10 }, (_, i) => ({
      air_date: `2000-0${season}-${String(i + 1).padStart(2, '0')}`,
      episode_number: i + 1,
      id: showId * 1000 + season * 100 + i + 1,
      name: `S${season}E${i + 1}`,
      runtime: 30,
      season_number: season,
    })),
  };
}

beforeAll(() => {
  Object.defineProperty(global, 'fetch', {
    configurable: true,
    writable: true,
    value: jest.fn(async (input: string) => {
      const url = new URL(input);
      requests.push(url.pathname);
      const body = tmdb(url);
      return {
        headers: { get: () => null },
        json: async () => clone(body === 404 ? {} : body),
        ok: body !== 404,
        status: body === 404 ? 404 : 200,
      };
    }),
  });
});

it('imports the real export end to end', async () => {
  const store: Store = new Map([[`users/${USER}`, { premium: { isPremium: true } }]]);
  const firestore = (jest.requireMock('firebase-admin') as { firestore: any }).firestore;
  firestore.mockImplementation(() => new Db(store));
  firestore.Timestamp = { fromMillis: (ms: number) => ({ _ms: ms }) };
  jest.spyOn(console, 'info').mockImplementation(() => undefined);

  const bytes = new Uint8Array(
    readFileSync(join(__dirname, '../fixtures/showly/real-v2-small/showly_export.json'))
  );
  const prepared = prepareShowlyImport([{ bytes, name: 'showly_export.json' }], NOW);

  const results: FileImportStats[] = [];
  for (let index = 0; index < prepared.chunks.length; index += 1) {
    results.push(
      await (importShowlyChunk as any)({
        auth: { token: { firebase: { sign_in_provider: 'password' } }, uid: USER },
        data: {
          ...prepared.chunks[index],
          importId: 'showly-e2e-1',
          ...(index === prepared.chunks.length - 1 ? { final: true } : {}),
        },
      })
    );
  }
  const total = (key: keyof FileImportStats['imported']) =>
    results.reduce((sum, r) => sum + (r.imported[key] ?? 0), 0);
  const items = (listPath: string) =>
    Object.keys((store.get(`users/${USER}/lists/${listPath}`) as any)?.items ?? {}).sort();
  const customList = (name: string) =>
    [...store.entries()].find(
      ([path, value]) => path.startsWith(`users/${USER}/lists/`) && value.name === name
    )?.[1] as any;

  // VisionQuest (My Shows, nothing watched) → Watching; Stick → Should Watch.
  expect(items('currently-watching')).toEqual(['tv-213375']);
  expect(items('watchlist')).toEqual(['tv-248830']);
  // The three watched movies, with the showly- watch prefix and their dates.
  expect(items('already-watched')).toEqual(['movie-1368337', 'movie-1400837', 'movie-1423191']);
  expect(
    store.has(
      `users/${USER}/watched_movies/1368337/watches/showly-1368337-${Date.parse('2026-07-17T01:00:00Z')}`
    )
  ).toBe(true);
  // Other Mommy was dated after the export: stamped with the export time instead.
  expect(
    store.has(
      `users/${USER}/watched_movies/1400837/watches/showly-1400837-${Date.parse('2026-11-12T06:13:35.601Z')}`
    )
  ).toBe(true);
  // Both custom lists, with their list-only (title-less) movies resolved by TMDB id.
  expect(Object.keys(customList('showly 1').items).sort()).toEqual([
    'movie-1375441',
    'movie-969681',
  ]);
  expect(Object.keys(customList('showly list 2').items).sort()).toEqual([
    'movie-1003596',
    'movie-1375441',
    'movie-969681',
  ]);
  expect(customList('showly list 2').items['movie-969681']).toMatchObject({
    title: 'Movie 969681',
  });
  // The lists' Showly descriptions.
  expect(customList('showly 1').description).toBe('showlt 1 list description');
  expect(customList('showly list 2').description).toBe('description for showly list');

  expect(total('watchedMovies')).toBe(3);
  expect(total('customListsCreated')).toBe(2);
  expect(total('shows')).toBe(2);
  expect(total('movies')).toBe(6);
  expect(results.flatMap((r) => r.unresolvedTitles)).toEqual([]);
  // No title searches: everything carried a TMDB id.
  expect(requests.filter((path) => path.startsWith('/3/search/'))).toEqual([]);
  // Showly's own rate-limit doc, finished after the final chunk.
  expect((store.get(`users/${USER}/import_limits/showly`) as any).session).toMatchObject({
    finishedAt: expect.any(Number),
    id: 'showly-e2e-1',
  });
  expect(store.has(`users/${USER}/import_limits/simkl`)).toBe(false);
});
