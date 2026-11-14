/**
 * Fixtures for tests that run the Trakt sync worker (runTraktSync) end to end: a Firestore fake
 * for one user, a Trakt fetch router and common Trakt payloads.
 *
 * Import this after the module mocks are registered (it loads the code under test). It is kept
 * apart from traktHarness.ts, which the mock factories load.
 */
import { runTraktSync, TRAKT_LISTS_SCHEMA_VERSION } from '@/functions/src/trakt';
import {
  assertNoUndefined,
  cloneData,
  createCollectionSnapshot,
  createDocSnapshot,
  createDocSnapshotWithSet,
  firestoreFn,
  MockTimestamp,
} from './traktHarness';

type Data = Record<string, unknown>;

export const timestampAt = (iso: string) => MockTimestamp.fromMillis(new Date(iso).getTime());

// ── Users ──

/** A connected user whose sync run `run-1` is about to start. */
export const connectedSyncUser = (extra: Data = {}): Data => ({
  traktAccessToken: 'token',
  traktConnected: true,
  traktSyncStatus: {
    runId: 'run-1',
  },
  traktTokenExpiresAt: MockTimestamp.fromMillis(Date.now() + 2 * 60 * 60 * 1000),
  ...extra,
});

/** Trakt activity timestamps saved by the last completed sync. */
export const LAST_ACTIVITIES = {
  episodes: {
    watched_at: '2024-01-03T00:00:00.000Z',
  },
  favorites: {
    updated_at: '2024-01-04T00:00:00.000Z',
  },
  lists: {
    updated_at: '2024-01-05T00:00:00.000Z',
  },
  movies: {
    rated_at: '2024-01-02T00:00:00.000Z',
    watched_at: '2024-01-01T00:00:00.000Z',
  },
  shows: {
    rated_at: '2024-01-02T00:00:00.000Z',
    watched_at: '2024-01-03T00:00:00.000Z',
  },
  watchlist: {
    updated_at: '2024-01-04T00:00:00.000Z',
  },
};

/** A connected user that completed a sync before, so the next sync is incremental. */
export const incrementalSyncUser = ({
  customLists = {},
  lastActivities = LAST_ACTIVITIES,
}: { customLists?: Data; lastActivities?: Data } = {}) =>
  connectedSyncUser({
    traktIncrementalState: {
      bootstrapCompletedAt: timestampAt('2024-01-06T00:00:00.000Z'),
      customLists,
      lastActivities,
      listsSchemaVersion: TRAKT_LISTS_SCHEMA_VERSION,
      schemaVersion: 1,
      updatedAt: timestampAt('2024-01-06T00:00:00.000Z'),
    },
  });

// ── Firestore ──

/** What the post-sync enrichment transaction returns when a run is already in progress. */
export const ACTIVE_ENRICHMENT_RUN = {
  kind: 'active',
  status: {
    runId: 'enrich-1',
    status: 'in_progress',
  },
  userData: {
    traktEnrichmentStatus: {
      runId: 'enrich-1',
      status: 'in_progress',
    },
  },
};

interface SyncFirestoreOptions {
  /** The user document. */
  user: Data;
  /** List documents by id. Enables the `lists` subcollection. */
  lists?: Record<string, Data>;
  /**
   * How the sync may read lists: `doc` (single documents), `query` (the whole collection) or
   * `both`. Any other read throws. Defaults to `both`.
   */
  listAccess?: 'both' | 'doc' | 'query';
  /** The list ids a collection query returns. Defaults to every list. */
  listQueryIds?: string[];
  /** Allows `batch.delete`. Without it, a batch delete throws. */
  allowBatchDelete?: boolean;
  /** Handles every list document write. Defaults to a resolving mock. */
  listSet?: jest.Mock;
  /** Episode tracking documents by show id. Enables the `episode_tracking` subcollection. */
  episodeTracking?: Record<string, Data>;
  /** Rating documents by id. Enables the `ratings` subcollection. */
  ratings?: Record<string, Data>;
  /**
   * The result of the post-sync enrichment queue transaction. Enables `runTransaction` and the
   * `traktEnrichmentRuns` subcollection.
   */
  enrichmentQueue?: unknown;
}

/**
 * Fakes Firestore for `users/user-1`. Only the subcollections a test passes are available; any
 * other read throws, so tests also catch reads the sync should not make. Batch writes are checked
 * for undefined values.
 */
export const mockSyncFirestore = ({
  allowBatchDelete = false,
  enrichmentQueue,
  episodeTracking,
  listAccess = 'both',
  listQueryIds,
  listSet = jest.fn().mockResolvedValue(undefined),
  lists,
  ratings,
  user,
}: SyncFirestoreOptions) => {
  // Typed loosely, like the inline mocks it replaced: tests read written refs and data back.
  const batchSet = jest.fn((_ref: any, data: any) => assertNoUndefined(data));
  const batchDelete = jest.fn();
  const batchCommit = jest.fn().mockResolvedValue(undefined);
  const runTransaction = jest.fn().mockResolvedValue(enrichmentQueue);
  const docPath = (subcollection: string, id: string) => `users/user-1/${subcollection}/${id}`;
  const plainDoc = (subcollection: string) =>
    jest.fn((id: string) => ({ id, path: docPath(subcollection, id) }));
  const readOnlyCollection = (subcollection: string, docs: Record<string, Data>) => ({
    doc: plainDoc(subcollection),
    get: jest
      .fn()
      .mockResolvedValue(
        createCollectionSnapshot(
          Object.entries(docs).map(([id, data]) => createDocSnapshot(docPath(subcollection, id), data))
        )
      ),
  });

  const subcollections: Record<string, unknown> = {
    traktSyncRuns: { doc: plainDoc('traktSyncRuns') },
  };

  if (lists) {
    subcollections.lists = {
      ...(listAccess !== 'query' && {
        doc: jest.fn((id: string) => ({
          get: jest.fn().mockResolvedValue({
            data: () => lists[id],
            exists: lists[id] !== undefined,
          }),
          id,
          path: docPath('lists', id),
          set: listSet,
        })),
      }),
      ...(listAccess !== 'doc' && {
        get: jest
          .fn()
          .mockResolvedValue(
            createCollectionSnapshot(
              (listQueryIds ?? Object.keys(lists)).map((id) =>
                createDocSnapshotWithSet(docPath('lists', id), lists[id], listSet)
              )
            )
          ),
      }),
    };
  }

  if (episodeTracking) {
    subcollections.episode_tracking = readOnlyCollection('episode_tracking', episodeTracking);
  }

  if (ratings) {
    subcollections.ratings = readOnlyCollection('ratings', ratings);
  }

  if (enrichmentQueue !== undefined) {
    subcollections.traktEnrichmentRuns = {
      doc: jest.fn((id = 'enrich-1') => ({ id, path: docPath('traktEnrichmentRuns', id) })),
    };
  }

  const userRef = {
    collection: jest.fn((name: string) => {
      if (!(name in subcollections)) {
        throw new Error(`Unexpected subcollection ${name}`);
      }

      return subcollections[name];
    }),
    get: jest.fn().mockResolvedValue({
      data: () => cloneData(user),
      exists: true,
    }),
    path: 'users/user-1',
  };

  firestoreFn.mockImplementation(() => ({
    batch: jest.fn(() => ({
      commit: batchCommit,
      ...(allowBatchDelete && { delete: batchDelete }),
      set: batchSet,
    })),
    collection: jest.fn((name: string) => {
      if (name !== 'users') {
        throw new Error(`Unexpected collection ${name}`);
      }

      return {
        doc: jest.fn(() => userRef),
      };
    }),
    ...(enrichmentQueue !== undefined ? { runTransaction } : {}),
  }));

  return { batchCommit, batchDelete, batchSet, listSet, runTransaction, userRef };
};

/** The sync status written by the batch for the given status, e.g. `completed` or `failed`. */
export const findSyncStatusWrite = (batchSet: jest.Mock, status: string) =>
  batchSet.mock.calls
    .map(([_ref, data]) => ('traktSyncStatus' in data ? data.traktSyncStatus : data))
    .find((data) => data?.status === status) as Record<string, any> | undefined;

// ── Running the worker ──

/** Runs the queued sync task for `run-1`. */
export const runSyncTask = (retryReason?: string) =>
  (runTraktSync as any)({
    data: { runId: 'run-1', userId: 'user-1' },
    retryCount: 0,
    retryReason,
  });

// ── Trakt API ──

export const traktJsonResponse = (body: unknown) => ({
  json: jest.fn().mockResolvedValue(body),
  ok: true,
  status: 200,
});

/**
 * Serves Trakt responses by exact URL path (query strings are ignored). Each call gets a fresh
 * copy of the body. Unknown paths throw, unless `fallback` is given.
 */
export const mockTraktFetch = (
  routes: Record<string, unknown>,
  { fallback }: { fallback?: unknown } = {}
) => {
  (global.fetch as jest.Mock).mockImplementation((input: unknown) => {
    const url = String(input);
    const path = new URL(url).pathname;
    const body = Object.hasOwn(routes, path) ? routes[path] : fallback;

    if (body === undefined) {
      throw new Error(`Unexpected fetch URL ${url}`);
    }

    return Promise.resolve(traktJsonResponse(JSON.parse(JSON.stringify(body))));
  });
};

export const TRAKT_USER_SETTINGS = {
  user: {
    ids: {
      slug: 'tester',
    },
    name: 'Tester',
    private: false,
    username: 'tester',
    vip: false,
    vip_ep: false,
  },
};

export const traktMovie = (slug: string, tmdb: number, trakt: number, title: string, year = 2024) => ({
  ids: { slug, tmdb, trakt },
  title,
  year,
});

export const MOVIE_ONE = traktMovie('movie-1', 101, 201, 'Movie One');
export const MOVIE_TWO = traktMovie('movie-2', 102, 202, 'Movie Two');
export const MOVIE_THREE = traktMovie('movie-3', 103, 203, 'Movie Three');
export const CUSTOM_MOVIE = traktMovie('custom-movie', 333, 303, 'Custom Movie');

export const watchedMovie = (movie: Data, watchedAt: string) => ({
  last_updated_at: watchedAt,
  last_watched_at: watchedAt,
  movie,
  plays: 1,
});

/** A watchlist or favorites entry for a movie. */
export const listedMovie = (id: number, listedAt: string, movie: Data) => ({
  id,
  listed_at: listedAt,
  movie,
  type: 'movie',
});

/** The Trakt custom list `custom-list` (id 701). */
export const CUSTOM_LIST = {
  created_at: '2024-01-05T00:00:00.000Z',
  description: 'Custom list',
  ids: {
    slug: 'custom-list',
    trakt: 701,
  },
  name: 'Custom List',
  privacy: 'private',
  updated_at: '2024-01-07T00:00:00.000Z',
};

/** Trakt data for a first sync: one watched movie, one watchlist movie, one favorite movie. */
export const FIRST_SYNC_ROUTES = {
  '/users/settings': TRAKT_USER_SETTINGS,
  '/sync/last_activities': {},
  '/sync/watched/movies': [watchedMovie(MOVIE_ONE, '2024-01-01T00:00:00.000Z')],
  '/sync/watched/shows': [],
  '/sync/ratings': [],
  '/sync/watchlist': [listedMovie(1, '2024-01-02T00:00:00.000Z', MOVIE_TWO)],
  '/sync/favorites': [listedMovie(2, '2024-01-03T00:00:00.000Z', MOVIE_THREE)],
  '/users/tester/lists': [],
};
