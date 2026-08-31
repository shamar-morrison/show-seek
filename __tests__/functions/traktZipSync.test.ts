let store: Map<string, Record<string, unknown>>;
const firestoreFn: jest.Mock = jest.fn();
const mockDefineSecret = jest.fn(() => ({
  value: () => 'test-secret',
}));
const mockEnqueue = jest.fn();

jest.mock(
  'firebase-functions/params',
  () => ({
    defineSecret: mockDefineSecret,
  }),
  { virtual: true }
);

jest.mock(
  'firebase-admin/functions',
  () => ({
    getFunctions: jest.fn(() => ({
      taskQueue: jest.fn(() => ({
        enqueue: mockEnqueue,
      })),
    })),
  }),
  { virtual: true }
);

class MockTimestamp {
  constructor(readonly millis: number) {}

  static fromDate(date: Date): MockTimestamp {
    return new MockTimestamp(date.getTime());
  }

  static fromMillis(millis: number): MockTimestamp {
    return new MockTimestamp(millis);
  }

  static now(): MockTimestamp {
    return new MockTimestamp(Date.now());
  }

  toDate(): Date {
    return new Date(this.millis);
  }

  toMillis(): number {
    return this.millis;
  }
}

function cloneValue(val: unknown): unknown {
  if (val instanceof MockTimestamp) {
    return MockTimestamp.fromMillis(val.toMillis());
  }
  if (Array.isArray(val)) {
    return val.map(cloneValue);
  }
  if (val && typeof val === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      copy[k] = cloneValue(v);
    }
    return copy;
  }
  return val;
}

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
    return this.value ? (cloneValue(this.value) as Record<string, unknown>) : undefined;
  }
}

class MockDocRef {
  constructor(
    readonly path: string,
    private readonly backingStore: Map<string, Record<string, unknown>>
  ) {}

  get id() {
    return this.path.split('/').pop() ?? '';
  }

  collection(name: string) {
    return new MockCollectionRef(`${this.path}/${name}`, this.backingStore);
  }

  async get() {
    return new MockDocSnapshot(this, this.backingStore.get(this.path));
  }

  async set(value: Record<string, unknown>, options?: { merge?: boolean }) {
    const existing = this.backingStore.get(this.path);
    if (options?.merge && existing) {
      const merged = { ...existing };
      Object.entries(value).forEach(([k, v]) => {
        if (
          v === '__deleteField__' ||
          v === 'FIELD_DELETE' ||
          (typeof v === 'object' && v !== null && (v as { _methodName?: string })._methodName === 'FieldValue.delete')
        ) {
          delete merged[k];
        } else if (
          typeof v === 'object' &&
          v !== null &&
          !Array.isArray(v) &&
          !(v instanceof MockTimestamp) &&
          typeof existing[k] === 'object' &&
          existing[k] !== null
        ) {
          const nested = { ...(existing[k] as Record<string, unknown>) };
          Object.entries(v as Record<string, unknown>).forEach(([nk, nv]) => {
            if (
              nv === '__deleteField__' ||
              nv === 'FIELD_DELETE' ||
              (typeof nv === 'object' && nv !== null && (nv as { _methodName?: string })._methodName === 'FieldValue.delete')
            ) {
              delete nested[nk];
            } else {
              nested[nk] = cloneValue(nv);
            }
          });
          merged[k] = nested;
        } else {
          merged[k] = cloneValue(v);
        }
      });
      this.backingStore.set(this.path, merged);
    } else {
      this.backingStore.set(this.path, cloneValue(value) as Record<string, unknown>);
    }
  }
}

class MockCollectionRef {
  constructor(
    readonly path: string,
    private readonly backingStore: Map<string, Record<string, unknown>>
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
      size: docs.length,
    };
  }
}

class MockWriteBatch {
  static maxOperationsInBatch = 0;
  static totalBatchesCommitted = 0;

  private readonly operations: Array<() => Promise<void>> = [];

  static resetStats() {
    MockWriteBatch.maxOperationsInBatch = 0;
    MockWriteBatch.totalBatchesCommitted = 0;
  }

  set(docRef: MockDocRef, data: Record<string, unknown>, options?: { merge?: boolean }) {
    this.operations.push(async () => {
      await docRef.set(data, options);
    });
    return this;
  }

  delete(docRef: MockDocRef) {
    this.operations.push(async () => {
      store.delete(docRef.path);
    });
    return this;
  }

  async commit() {
    MockWriteBatch.totalBatchesCommitted += 1;
    MockWriteBatch.maxOperationsInBatch = Math.max(
      MockWriteBatch.maxOperationsInBatch,
      this.operations.length
    );

    // Hard fail if batch exceeds Firestore's 500 limit
    if (this.operations.length > 500) {
      throw new Error(`Firestore batch limit exceeded: ${this.operations.length} operations in a single batch`);
    }

    for (const op of this.operations) {
      await op();
    }
  }
}

function isDirectChildDocPath(collectionPath: string, docPath: string): boolean {
  if (!docPath.startsWith(`${collectionPath}/`)) {
    return false;
  }
  const relative = docPath.slice(collectionPath.length + 1);
  return !relative.includes('/');
}

const mockFirestore = {
  batch: () => new MockWriteBatch(),
  collection: (name: string) => new MockCollectionRef(name, store),
  doc: (path: string) => new MockDocRef(path, store),
};

firestoreFn.mockImplementation(() => mockFirestore);

jest.mock(
  'firebase-admin',
  () => ({
    auth: jest.fn(() => ({
      verifyIdToken: jest.fn(),
    })),
    firestore: firestoreFn,
    initializeApp: jest.fn(),
  }),
  { virtual: true }
);

jest.mock(
  'firebase-admin/firestore',
  () => ({
    FieldValue: {
      delete: jest.fn(() => 'FIELD_DELETE'),
    },
    Timestamp: MockTimestamp,
  }),
  { virtual: true }
);

import {
  reconcileCustomListsFromZip,
  syncTraktZipImport,
} from '../../functions/src/trakt/zipSync';
import type { AggregatedTraktData } from '../../functions/src/trakt/zipAggregator';

describe('Trakt Zip Sync Orchestrator (Stage 2)', () => {
  const userId = 'test-user-123';

  beforeEach(() => {
    store = new Map<string, Record<string, unknown>>();
    MockWriteBatch.resetStats();
    firestoreFn.mockImplementation(() => mockFirestore);
  });

  describe('reconcileCustomListsFromZip', () => {
    it('reconciles custom lists from local zip data with zero HTTP calls', async () => {
      const customListsData = [
        {
          items: [
            {
              id: 157336,
              listed_at: '2023-01-01T12:00:00.000Z',
              movie: {
                ids: { imdb: 'tt0816692', slug: 'interstellar-2014', tmdb: 157336, trakt: 100 },
                title: 'Interstellar',
                year: 2014,
              },
              rank: 1,
              type: 'movie' as const,
            },
          ],
          list: {
            created_at: '2023-01-01T00:00:00.000Z',
            description: 'Favorite space movies',
            ids: { slug: 'space-movies', trakt: 901 },
            name: 'Space Movies',
            privacy: 'public' as const,
            updated_at: '2023-01-02T00:00:00.000Z',
          },
        },
      ];

      const result = await reconcileCustomListsFromZip(userId, customListsData);

      expect(result.changedCount).toBe(1);
      expect(result.customLists).toEqual({
        '901': {
          slug: 'space-movies',
          updatedAt: '2023-01-02T00:00:00.000Z',
        },
      });
      expect(result.listsToEnrich).toContain('trakt_901');

      const savedDoc = store.get(`users/${userId}/lists/trakt_901`);
      expect(savedDoc).toBeDefined();
      expect(savedDoc?.name).toBe('Space Movies');
      expect(savedDoc?.isCustom).toBe(true);
      expect(savedDoc?.traktId).toBe(901);
      expect(savedDoc?.items).toBeDefined();
      const items = savedDoc?.items as Record<string, unknown>;
      expect(items['movie-157336']).toBeDefined();
    });
  });

  describe('syncTraktZipImport', () => {
    it('reconciles movies, shows, episodes, ratings, watchlist, favorites, and writes granular watch documents', async () => {
      const mockZipData: AggregatedTraktData = {
        customLists: [
          {
            items: [
              {
                id: 27205,
                listed_at: '2023-01-01T00:00:00.000Z',
                movie: { ids: { tmdb: 27205 }, title: 'Inception', year: 2010 },
                rank: 1,
                type: 'movie',
              },
            ],
            list: {
              created_at: '2023-01-01T00:00:00.000Z',
              description: 'Nolan List',
              ids: { slug: 'nolan-movies', trakt: 501 },
              name: 'Nolan Movies',
              privacy: 'public',
              updated_at: '2023-01-01T00:00:00.000Z',
            },
          },
        ],
        favorites: [
          {
            id: 278,
            listed_at: '2023-01-01T10:00:00.000Z',
            movie: { ids: { tmdb: 278 }, title: 'The Shawshank Redemption', year: 1994 },
            type: 'movie',
          },
        ],
        ratings: [
          {
            movie: { ids: { tmdb: 278 }, title: 'The Shawshank Redemption', year: 1994 },
            rated_at: '2023-01-01T12:00:00.000Z',
            rating: 10,
            type: 'movie',
          },
          {
            rated_at: '2023-01-02T12:00:00.000Z',
            rating: 9,
            show: { ids: { tmdb: 1396 }, title: 'Breaking Bad', year: 2008 },
            type: 'show',
          },
        ],
        stats: {
          customLists: 1,
          episodes: 2,
          favorites: 1,
          movieWatches: 2,
          movies: 1,
          ratings: 2,
          shows: 1,
          watchlistItems: 1,
        },
        watchedMovieEvents: [
          {
            docId: 'trakt-278-1672574400000',
            movieId: 278,
            title: 'The Shawshank Redemption',
            watchedAt: 1672574400000,
          },
          {
            docId: 'trakt-278-1688212800000',
            movieId: 278,
            title: 'The Shawshank Redemption',
            watchedAt: 1688212800000,
          },
        ],
        watchedMovies: [
          {
            last_updated_at: '2023-07-01T12:00:00.000Z',
            last_watched_at: '2023-07-01T12:00:00.000Z',
            movie: { ids: { tmdb: 278, slug: 'the-shawshank-redemption-1994', trakt: 1 }, title: 'The Shawshank Redemption', year: 1994 },
            plays: 2,
          },
        ],
        watchedShows: [
          {
            last_updated_at: '2023-02-01T12:00:00.000Z',
            last_watched_at: '2023-02-01T12:00:00.000Z',
            plays: 2,
            seasons: [
              {
                episodes: [
                  { last_watched_at: '2023-01-01T12:00:00.000Z', number: 1, plays: 1 },
                  { last_watched_at: '2023-02-01T12:00:00.000Z', number: 2, plays: 1 },
                ],
                number: 1,
              },
            ],
            show: { ids: { tmdb: 1396, slug: 'breaking-bad', trakt: 1388 }, title: 'Breaking Bad', year: 2008 },
          },
        ],
        watchlist: [
          {
            id: 872585,
            listed_at: '2023-08-01T10:00:00.000Z',
            movie: { ids: { tmdb: 872585 }, title: 'Oppenheimer', year: 2023 },
            type: 'movie',
          },
        ],
      };

      const result = await syncTraktZipImport(userId, mockZipData);

      // 1. Verify flat per-category counts returned in result
      expect(result).toEqual({
        customListsSynced: 1,
        episodesSynced: 2,
        favoritesSynced: 1,
        listsToEnrich: expect.arrayContaining(['already-watched', 'watchlist', 'favorites', 'trakt_501']),
        moviesSynced: 1,
        movieWatchesSynced: 2,
        ratingsSynced: 2,
        showsSynced: 1,
        watchlistSynced: 1,
      });

      // 2. Verify granular movie watch documents in users/{uid}/watched_movies/{movieId}/watches/
      const watchDoc1 = store.get(`users/${userId}/watched_movies/278/watches/trakt-278-1672574400000`);
      expect(watchDoc1).toBeDefined();
      expect(watchDoc1?.movieId).toBe(278);

      const watchDoc2 = store.get(`users/${userId}/watched_movies/278/watches/trakt-278-1688212800000`);
      expect(watchDoc2).toBeDefined();
      expect(watchDoc2?.movieId).toBe(278);

      // 3. Verify already-watched list
      const alreadyWatched = store.get(`users/${userId}/lists/already-watched`);
      expect(alreadyWatched).toBeDefined();
      const awItems = alreadyWatched?.items as Record<string, unknown>;
      expect(awItems['movie-278']).toBeDefined();
      expect(awItems['tv-1396']).toBeDefined();

      // 4. Verify episode tracking document
      const episodeDoc = store.get(`users/${userId}/episode_tracking/1396`);
      expect(episodeDoc).toBeDefined();
      const episodes = episodeDoc?.episodes as Record<string, unknown>;
      expect(episodes['1_1']).toBeDefined();
      expect(episodes['1_2']).toBeDefined();

      // 5. Verify ratings documents
      const movieRating = store.get(`users/${userId}/ratings/movie-278`);
      expect(movieRating).toBeDefined();
      expect(movieRating?.rating).toBe(10);

      const showRating = store.get(`users/${userId}/ratings/tv-1396`);
      expect(showRating).toBeDefined();
      expect(showRating?.rating).toBe(9);

      // 6. Verify watchlist and favorites
      const watchlist = store.get(`users/${userId}/lists/watchlist`);
      expect(watchlist).toBeDefined();
      const wlItems = watchlist?.items as Record<string, unknown>;
      expect(wlItems['movie-872585']).toBeDefined();

      const favorites = store.get(`users/${userId}/lists/favorites`);
      expect(favorites).toBeDefined();
      const favItems = favorites?.items as Record<string, unknown>;
      expect(favItems['movie-278']).toBeDefined();
    });

    it('chunks granular movie watch writes into sequential batches of 400 when more than 500 watch events exist', async () => {
      const TOTAL_WATCHES = 1050;
      const watchedMovieEvents = [];

      for (let i = 1; i <= TOTAL_WATCHES; i += 1) {
        const movieId = 1000 + (i % 50);
        const watchedAt = 1600000000000 + i * 1000;
        watchedMovieEvents.push({
          docId: `trakt-${movieId}-${watchedAt}`,
          movieId,
          title: `Movie ${movieId}`,
          watchedAt,
        });
      }

      const zipDataWithHeavyWatches: Partial<AggregatedTraktData> = {
        watchedMovieEvents,
      };

      const result = await syncTraktZipImport(userId, zipDataWithHeavyWatches);

      expect(result.movieWatchesSynced).toBe(TOTAL_WATCHES);

      // Verify that batching chunked properly without exceeding Firestore's 500 limit:
      // 1,050 items with BATCH_SIZE = 400 -> 3 batches (400, 400, 250)
      expect(MockWriteBatch.maxOperationsInBatch).toBeLessThanOrEqual(400);
      expect(MockWriteBatch.maxOperationsInBatch).toBe(400);

      // Check random sample of watch documents to confirm they were persisted
      const sample1 = store.get(`users/${userId}/watched_movies/${1000 + (1 % 50)}/watches/trakt-${1000 + (1 % 50)}-${1600000000000 + 1000}`);
      expect(sample1).toBeDefined();

      const sampleLast = store.get(`users/${userId}/watched_movies/${1000 + (TOTAL_WATCHES % 50)}/watches/trakt-${1000 + (TOTAL_WATCHES % 50)}-${1600000000000 + TOTAL_WATCHES * 1000}`);
      expect(sampleLast).toBeDefined();
    });

    it('applies recency-based conflict resolution when overlapping data exists', async () => {
      // Pre-seed a newer local rating for movie-278
      const newerLocalRatedAt = new MockTimestamp(Date.parse('2024-01-01T00:00:00.000Z'));
      store.set(`users/${userId}/ratings/movie-278`, {
        id: '278',
        mediaType: 'movie',
        ratedAt: newerLocalRatedAt,
        rating: 6,
        title: 'The Shawshank Redemption',
      });

      // Zip import contains an older rating (from 2022) with rating: 10
      const zipDataWithOlderRating: Partial<AggregatedTraktData> = {
        ratings: [
          {
            movie: { ids: { tmdb: 278 }, title: 'The Shawshank Redemption' },
            rated_at: '2022-01-01T00:00:00.000Z',
            rating: 10,
            type: 'movie',
          },
        ],
      };

      await syncTraktZipImport(userId, zipDataWithOlderRating);

      // Newer local rating (6) should NOT be overwritten by older zip rating (10)
      const movieRating = store.get(`users/${userId}/ratings/movie-278`);
      expect(movieRating?.rating).toBe(6);
    });

    it('overwrites older local rating when zip data contains a newer rating', async () => {
      // Pre-seed an older local rating for movie-278
      const olderLocalRatedAt = new MockTimestamp(Date.parse('2020-01-01T00:00:00.000Z'));
      store.set(`users/${userId}/ratings/movie-278`, {
        id: '278',
        mediaType: 'movie',
        ratedAt: olderLocalRatedAt,
        rating: 6,
        title: 'The Shawshank Redemption',
      });

      // Zip import contains a newer rating (from 2024) with rating: 10
      const zipDataWithNewerRating: Partial<AggregatedTraktData> = {
        ratings: [
          {
            movie: { ids: { tmdb: 278 }, title: 'The Shawshank Redemption' },
            rated_at: '2024-06-01T00:00:00.000Z',
            rating: 10,
            type: 'movie',
          },
        ],
      };

      await syncTraktZipImport(userId, zipDataWithNewerRating);

      // Older local rating (6) SHOULD be updated to newer zip rating (10)
      const movieRating = store.get(`users/${userId}/ratings/movie-278`);
      expect(movieRating?.rating).toBe(10);
    });

    it('handles empty or partial aggregated input gracefully without throwing', async () => {
      const emptyZipData: Partial<AggregatedTraktData> = {};

      const result = await syncTraktZipImport(userId, emptyZipData);

      expect(result).toEqual({
        customListsSynced: 0,
        episodesSynced: 0,
        favoritesSynced: 0,
        listsToEnrich: [],
        moviesSynced: 0,
        movieWatchesSynced: 0,
        ratingsSynced: 0,
        showsSynced: 0,
        watchlistSynced: 0,
      });
    });
  });
});
