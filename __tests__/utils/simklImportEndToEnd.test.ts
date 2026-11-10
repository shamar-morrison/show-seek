/**
 * Simkl import end to end: the real SimklBackup.zip → on-device parser → chunker →
 * `importSimklChunk`, against an in-memory Firestore and a deterministic fake TMDB.
 * Proves the client output and the server agree on real data.
 */
import type { FileImportStats } from '@/functions/src/shared/fileImport';
import { importSimklChunk } from '@/functions/src/simklImport';
import { prepareSimklImport } from '@/src/utils/simklImport/prepare';
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

const NOW = Date.UTC(2026, 10, 11);
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

it('imports the real backup end to end', async () => {
  const store: Store = new Map([[`users/${USER}`, { premium: { isPremium: true } }]]);
  const firestore = (jest.requireMock('firebase-admin') as { firestore: any }).firestore;
  firestore.mockImplementation(() => new Db(store));
  firestore.Timestamp = { fromMillis: (ms: number) => ({ _ms: ms }) };
  jest.spyOn(console, 'info').mockImplementation(() => undefined);

  const bytes = new Uint8Array(
    readFileSync(join(__dirname, '../fixtures/simkl/real-backup-2026/SimklBackup.zip'))
  );
  const prepared = prepareSimklImport([{ bytes, name: 'SimklBackup.zip' }], NOW);

  const results: FileImportStats[] = [];
  for (let index = 0; index < prepared.chunks.length; index += 1) {
    results.push(
      await (importSimklChunk as any)({
        auth: { token: { firebase: { sign_in_provider: 'password' } }, uid: USER },
        data: {
          ...prepared.chunks[index],
          importId: 'simkl-e2e-1',
          ...(index === prepared.chunks.length - 1 ? { final: true } : {}),
        },
      })
    );
  }

  const total = (key: keyof FileImportStats['imported']) =>
    results.reduce((sum, r) => sum + (r.imported[key] ?? 0), 0);
  const skipped = (key: keyof FileImportStats['skipped']) =>
    results.reduce((sum, r) => sum + (r.skipped[key] ?? 0), 0);

  // Breaking Bad (TMDB 1396, completed without an episode list) is expanded to every aired episode.
  const breakingBad = store.get(`users/${USER}/episode_tracking/1396`) as any;
  expect(Object.keys(breakingBad.episodes)).toHaveLength(30);
  // Futurama (TMDB 615): its 8 listed episodes fit the fake's 10-episode season 1.
  expect(
    Object.keys((store.get(`users/${USER}/episode_tracking/615`) as any).episodes)
  ).toHaveLength(8);
  // One Piece's entry total (1184) doesn't match the fake TMDB's 30 episodes: nothing guessed.
  expect(store.get(`users/${USER}/episode_tracking/37854`)).toBeUndefined();
  expect(skipped('unmatched_anime_episode')).toBeGreaterThanOrEqual(120);
  // Movies use the simkl- watch prefix (The Godfather, TMDB 238, watched 1985-06-01).
  expect(
    store.has(`users/${USER}/watched_movies/238/watches/simkl-238-${Date.UTC(1985, 5, 1)}`)
  ).toBe(true);
  // Simkl's own rate-limit doc, finished after the final chunk.
  expect((store.get(`users/${USER}/import_limits/simkl`) as any).session).toMatchObject({
    finishedAt: expect.any(Number),
    id: 'simkl-e2e-1',
  });
  expect(store.has(`users/${USER}/import_limits/tvtime`)).toBe(false);

  // Breaking Bad 30 + Futurama 8 + The Walking Dead 6 + The Office 1 + Game of Thrones 2
  // + Doctor Who 13 (its 16 listed episodes overflow the fake's 10-episode season 1).
  expect(total('watchedEpisodes')).toBe(60);
  expect(skipped('unmatched_episode')).toBe(3);
  expect(results.flatMap((r) => r.unmatchedEpisodeTitles ?? [])).toContain('Show 57243');
  expect(total('watchedMovies')).toBe(6);
  expect(total('ratings')).toBeGreaterThan(0);
  // Ids-less anime entries go to title search, which finds nothing in the fake TMDB.
  expect(results.flatMap((r) => r.unresolvedTitles)).toEqual(
    expect.arrayContaining(['Shingeki no Kyojin Season 3'])
  );
  // No TVDB movie id ever reached TMDB's /find.
  expect(requests.filter((path) => path === '/3/find/275')).toEqual([]);
});
