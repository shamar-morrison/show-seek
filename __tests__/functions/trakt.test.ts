const mockDefineSecret = jest.fn(() => ({
  value: () => 'test-secret',
}));
const mockOnRequest = jest.fn((_options, handler) => handler);
const mockOnTaskDispatched = jest.fn((_options, handler) => handler);
const mockVerifyIdToken = jest.fn();
const mockEnqueue = jest.fn();
const firestoreFn: jest.Mock = jest.fn();

class MockTimestamp {
  private readonly millis: number;

  constructor(millis: number) {
    this.millis = millis;
  }

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

jest.mock(
  'firebase-functions/params',
  () => ({
    defineSecret: mockDefineSecret,
  }),
  { virtual: true }
);

jest.mock(
  'firebase-functions/v2/https',
  () => ({
    onRequest: mockOnRequest,
  }),
  { virtual: true }
);

jest.mock(
  'firebase-functions/v2/tasks',
  () => ({
    onTaskDispatched: mockOnTaskDispatched,
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

jest.mock(
  'firebase-admin',
  () => ({
    auth: jest.fn(() => ({
      verifyIdToken: mockVerifyIdToken,
    })),
    firestore: firestoreFn,
    initializeApp: jest.fn(),
  }),
  { virtual: true }
);

import { __test__, runTraktSync, traktApi, traktCallback } from '@/functions/src/trakt';
import { runTraktEnrichment } from '@/functions/src/trakt';

const emptyItemsSynced = () => ({
  episodes: 0,
  favorites: 0,
  lists: 0,
  movies: 0,
  ratings: 0,
  shows: 0,
  watchlistItems: 0,
});

const DAY_MS = 24 * 60 * 60 * 1000;

const assertNoUndefined = (value: unknown, path = 'root'): void => {
  if (value === undefined) {
    throw new Error(`Undefined Firestore value at ${path}`);
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoUndefined(item, `${path}[${index}]`));
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  Object.entries(value).forEach(([key, nestedValue]) => {
    assertNoUndefined(nestedValue, `${path}.${key}`);
  });
};

const createResponse = () => {
  const response: Record<string, jest.Mock> = {
    json: jest.fn(),
    send: jest.fn(),
    setHeader: jest.fn(),
    status: jest.fn(),
    type: jest.fn(),
  };

  response.status.mockReturnValue(response);
  response.type.mockReturnValue(response);
  return response;
};

const createDocSnapshot = (path: string, data?: Record<string, unknown>) => ({
  data: () => data,
  exists: data !== undefined,
  id: path.split('/').pop() ?? path,
  ref: { path },
});

const createCollectionSnapshot = (docs: Array<ReturnType<typeof createDocSnapshot>>) => ({
  docs,
  size: docs.length,
});

const createDocSnapshotWithSet = (
  path: string,
  data: Record<string, unknown> | undefined,
  set = jest.fn().mockResolvedValue(undefined)
) => ({
  ...createDocSnapshot(path, data),
  ref: { path, set },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyIdToken.mockResolvedValue({ uid: 'user-1' });
  mockEnqueue.mockResolvedValue(undefined);
  global.fetch = jest.fn() as any;
  delete process.env.TRAKT_ALLOWED_ORIGINS;
});

describe('Trakt sync Firestore sanitization', () => {
  it('queues a first-time sync without writing undefined lastSyncedAt values', async () => {
    const transactionGet = jest.fn().mockResolvedValue({
      data: () => ({
        traktAccessToken: 'token',
        traktConnected: true,
      }),
    });
    const transactionSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const runRef = {
      id: 'run-1',
      path: 'users/user-1/traktSyncRuns/run-1',
    };
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name !== 'traktSyncRuns') {
          throw new Error(`Unexpected subcollection ${name}`);
        }

        return {
          doc: jest.fn((id?: string) => ({
            id: id ?? runRef.id,
            path: `users/user-1/traktSyncRuns/${id ?? runRef.id}`,
          })),
        };
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      collection: jest.fn((name: string) => {
        if (name !== 'users') {
          throw new Error(`Unexpected collection ${name}`);
        }

        return {
          doc: jest.fn(() => userRef),
        };
      }),
      runTransaction: jest.fn(async (callback: any) =>
        callback({
          get: transactionGet,
          set: transactionSet,
        })
      ),
    }));

    const response = createResponse();

    await (traktApi as any)(
      {
        body: {},
        header: (name: string) => (name.toLowerCase() === 'authorization' ? 'Bearer token' : undefined),
        method: 'POST',
        path: '/sync',
      },
      response
    );

    expect(transactionSet).toHaveBeenCalledTimes(2);
    expect(mockEnqueue).toHaveBeenCalledWith(
      { runId: 'run-1', userId: 'user-1' },
      expect.objectContaining({ id: 'run-1' })
    );
    expect(response.status).toHaveBeenCalledWith(202);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        connected: true,
        runId: 'run-1',
        status: 'queued',
      })
    );
  });

  it('allows a new sync after a non-rate-limited failure even if a cooldown timestamp still exists', async () => {
    const futureCooldown = MockTimestamp.fromMillis(Date.now() + 60_000);
    const transactionGet = jest.fn().mockResolvedValue({
      data: () => ({
        traktAccessToken: 'token',
        traktConnected: true,
        traktSyncStatus: {
          errorCategory: 'upstream_unavailable',
          nextAllowedSyncAt: futureCooldown,
          runId: 'failed-run',
          status: 'failed',
        },
      }),
    });
    const transactionSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const runRef = {
      id: 'run-1',
      path: 'users/user-1/traktSyncRuns/run-1',
    };
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name !== 'traktSyncRuns') {
          throw new Error(`Unexpected subcollection ${name}`);
        }

        return {
          doc: jest.fn((id?: string) => ({
            id: id ?? runRef.id,
            path: `users/user-1/traktSyncRuns/${id ?? runRef.id}`,
          })),
        };
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      collection: jest.fn((name: string) => {
        if (name !== 'users') {
          throw new Error(`Unexpected collection ${name}`);
        }

        return {
          doc: jest.fn(() => userRef),
        };
      }),
      runTransaction: jest.fn(async (callback: any) =>
        callback({
          get: transactionGet,
          set: transactionSet,
        })
      ),
    }));

    const response = createResponse();

    await (traktApi as any)(
      {
        body: {},
        header: (name: string) => (name.toLowerCase() === 'authorization' ? 'Bearer token' : undefined),
        method: 'POST',
        path: '/sync',
      },
      response
    );

    expect(mockEnqueue).toHaveBeenCalledWith(
      { runId: 'run-1', userId: 'user-1' },
      expect.objectContaining({ id: 'run-1' })
    );
    expect(response.status).toHaveBeenCalledWith(202);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ runId: 'run-1', status: 'queued' }));

    const userStatusWriteCall = transactionSet.mock.calls.find(
      ([_ref, data]) => data && typeof data === 'object' && 'traktSyncStatus' in data
    ) as [unknown, { traktSyncStatus: Record<string, unknown> }] | undefined;

    expect(userStatusWriteCall?.[1].traktSyncStatus).toBeDefined();
    expect(userStatusWriteCall?.[1].traktSyncStatus.nextAllowedSyncAt).toBeUndefined();
  });

  it('keeps the manual cooldown after a successful sync until the next allowed time', async () => {
    const futureCooldown = MockTimestamp.fromMillis(Date.now() + DAY_MS);
    const transactionGet = jest.fn().mockResolvedValue({
      data: () => ({
        traktAccessToken: 'token',
        traktConnected: true,
        traktSyncStatus: {
          lastSyncedAt: MockTimestamp.fromMillis(Date.now() - 30_000),
          nextAllowedSyncAt: futureCooldown,
          runId: 'completed-run',
          status: 'completed',
        },
      }),
    });
    const transactionSet = jest.fn();
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name !== 'traktSyncRuns') {
          throw new Error(`Unexpected subcollection ${name}`);
        }

        return {
          doc: jest.fn((id?: string) => ({
            id: id ?? 'run-1',
            path: `users/user-1/traktSyncRuns/${id ?? 'run-1'}`,
          })),
        };
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      collection: jest.fn((name: string) => {
        if (name !== 'users') {
          throw new Error(`Unexpected collection ${name}`);
        }

        return {
          doc: jest.fn(() => userRef),
        };
      }),
      runTransaction: jest.fn(async (callback: any) =>
        callback({
          get: transactionGet,
          set: transactionSet,
        })
      ),
    }));

    const response = createResponse();

    await (traktApi as any)(
      {
        body: {},
        header: (name: string) => (name.toLowerCase() === 'authorization' ? 'Bearer token' : undefined),
        method: 'POST',
        path: '/sync',
      },
      response
    );

    expect(transactionSet).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(429);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCategory: 'rate_limited',
        nextAllowedSyncAt: futureCooldown.toDate().toISOString(),
      })
    );
  });

  it('bypasses the manual sync cooldown in the functions emulator when the dev header is present', async () => {
    const originalFunctionsEmulator = process.env.FUNCTIONS_EMULATOR;
    process.env.FUNCTIONS_EMULATOR = 'true';

    const futureCooldown = MockTimestamp.fromMillis(Date.now() + DAY_MS);
    const transactionGet = jest.fn().mockResolvedValue({
      data: () => ({
        traktAccessToken: 'token',
        traktConnected: true,
        traktSyncStatus: {
          lastSyncedAt: MockTimestamp.fromMillis(Date.now() - 30_000),
          nextAllowedSyncAt: futureCooldown,
          runId: 'completed-run',
          status: 'completed',
        },
      }),
    });
    const transactionSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name !== 'traktSyncRuns') {
          throw new Error(`Unexpected subcollection ${name}`);
        }

        return {
          doc: jest.fn((id?: string) => ({
            id: id ?? 'run-1',
            path: `users/user-1/traktSyncRuns/${id ?? 'run-1'}`,
          })),
        };
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      collection: jest.fn((name: string) => {
        if (name !== 'users') {
          throw new Error(`Unexpected collection ${name}`);
        }

        return {
          doc: jest.fn(() => userRef),
        };
      }),
      runTransaction: jest.fn(async (callback: any) =>
        callback({
          get: transactionGet,
          set: transactionSet,
        })
      ),
    }));

    const response = createResponse();

    try {
      await (traktApi as any)(
        {
          body: {},
          header: (name: string) => {
            const normalized = name.toLowerCase();
            if (normalized === 'authorization') return 'Bearer token';
            if (normalized === 'x-showseek-dev-sync') return 'true';
            return undefined;
          },
          method: 'POST',
          path: '/sync',
        },
        response
      );
    } finally {
      if (originalFunctionsEmulator === undefined) {
        delete process.env.FUNCTIONS_EMULATOR;
      } else {
        process.env.FUNCTIONS_EMULATOR = originalFunctionsEmulator;
      }
    }

    expect(transactionSet).toHaveBeenCalledTimes(2);
    expect(mockEnqueue).toHaveBeenCalledWith(
      { runId: 'run-1', userId: 'user-1' },
      expect.objectContaining({ id: 'run-1' })
    );
    expect(response.status).toHaveBeenCalledWith(202);
  });

  it('writes a 24-hour cooldown after a successful sync completes', async () => {
    const frozenNow = Date.UTC(2026, 2, 25, 12, 0, 0);
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(frozenNow);
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const listSet = jest.fn().mockResolvedValue(undefined);
    const listsCollection = {
      doc: jest.fn((id: string) => ({
        id,
        path: `users/user-1/lists/${id}`,
        get: jest.fn().mockResolvedValue({
          data: () => undefined,
          exists: false,
        }),
        set: listSet,
      })),
      get: jest.fn().mockResolvedValue({ docs: [] }),
    };
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name === 'traktSyncRuns') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/traktSyncRuns/${id}`,
            })),
          };
        }

        if (name === 'traktEnrichmentRuns') {
          return {
            doc: jest.fn((id = 'enrich-1') => ({
              id,
              path: `users/user-1/traktEnrichmentRuns/${id}`,
            })),
          };
        }

        if (name === 'lists') {
          return listsCollection;
        }

        if (name === 'episode_tracking') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/episode_tracking/${id}`,
            })),
            get: jest.fn().mockResolvedValue({ docs: [] }),
          };
        }

        if (name === 'ratings') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/ratings/${id}`,
            })),
            get: jest.fn().mockResolvedValue({ docs: [] }),
          };
        }

        throw new Error(`Unexpected subcollection ${name}`);
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktAccessToken: 'token',
          traktConnected: true,
          traktSyncStatus: {
            runId: 'run-1',
          },
          traktTokenExpiresAt: MockTimestamp.fromMillis(frozenNow + 2 * 60 * 60 * 1000),
        }),
        exists: true,
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      batch: jest.fn(() => ({
        commit: batchCommit,
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
      runTransaction: jest.fn().mockResolvedValue({
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
      }),
    }));

    (global.fetch as jest.Mock).mockImplementation((input: any) => {
      const url = String(input);

      if (url.endsWith('/users/settings')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue({
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
          }),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/sync/last_activities')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue({}),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/sync/watched/movies')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              last_updated_at: '2024-01-01T00:00:00.000Z',
              last_watched_at: '2024-01-01T00:00:00.000Z',
              movie: {
                ids: {
                  slug: 'movie-1',
                  tmdb: 101,
                  trakt: 201,
                },
                title: 'Movie One',
                year: 2024,
              },
              plays: 1,
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/sync/watchlist')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              id: 1,
              listed_at: '2024-01-02T00:00:00.000Z',
              movie: {
                ids: {
                  slug: 'movie-2',
                  tmdb: 102,
                  trakt: 202,
                },
                title: 'Movie Two',
                year: 2024,
              },
              type: 'movie',
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/sync/favorites')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              id: 2,
              listed_at: '2024-01-03T00:00:00.000Z',
              movie: {
                ids: {
                  slug: 'movie-3',
                  tmdb: 103,
                  trakt: 203,
                },
                title: 'Movie Three',
                year: 2024,
              },
              type: 'movie',
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      if (
        url.endsWith('/sync/watched/shows?extended=full') ||
        url.endsWith('/sync/ratings') ||
        url.endsWith('/users/tester/lists')
      ) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([]),
          ok: true,
          status: 200,
        });
      }

      throw new Error(`Unexpected fetch URL ${url}`);
    });

    try {
      await expect(
        (runTraktSync as any)({
          data: { runId: 'run-1', userId: 'user-1' },
          retryCount: 0,
          retryReason: undefined,
        })
      ).resolves.toBeUndefined();
    } finally {
      dateNowSpy.mockRestore();
    }

    const completedWrite = batchSet.mock.calls
      .map(([_ref, data]) => ('traktSyncStatus' in data ? data.traktSyncStatus : data))
      .find((data) => data?.status === 'completed') as
      | { completedAt: MockTimestamp; nextAllowedSyncAt: MockTimestamp }
      | undefined;

    expect(completedWrite).toBeDefined();
    expect(completedWrite?.completedAt.toMillis()).toBe(frozenNow);
    expect(completedWrite?.nextAllowedSyncAt.toMillis()).toBe(frozenNow + DAY_MS);
  });

  it('reports bootstrap summary mode with imported totals even when local data is already up to date', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchDelete = jest.fn();
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const listSet = jest.fn().mockResolvedValue(undefined);
    const alreadyWatchedData = {
      id: 'already-watched',
      items: {
        'movie-101': {
          addedAt: MockTimestamp.fromMillis(new Date('2024-01-02T00:00:00.000Z').getTime()),
          id: 101,
          media_type: 'movie',
          release_date: '2024-01-01',
          title: 'Movie One',
        },
        'movie-999': {
          addedAt: MockTimestamp.fromMillis(new Date('2024-03-01T00:00:00.000Z').getTime()),
          id: 999,
          media_type: 'movie',
          release_date: '2023-01-01',
          title: 'Local Movie Only',
        },
        'tv-201': {
          addedAt: MockTimestamp.fromMillis(new Date('2024-02-03T00:00:00.000Z').getTime()),
          first_air_date: '2020-01-01',
          id: 201,
          media_type: 'tv',
          name: 'Show One',
        },
      },
      metadata: {
        itemCount: 3,
        lastUpdated: MockTimestamp.now(),
        needsEnrichment: false,
      },
      name: 'Already Watched',
    };
    const watchlistData = {
      id: 'watchlist',
      items: {
        'movie-102': {
          addedAt: MockTimestamp.fromMillis(new Date('2024-01-03T00:00:00.000Z').getTime()),
          id: 102,
          media_type: 'movie',
          release_date: '2024-01-01',
          title: 'Movie Two',
        },
        'tv-909': {
          addedAt: MockTimestamp.fromMillis(new Date('2024-03-02T00:00:00.000Z').getTime()),
          first_air_date: '2021-01-01',
          id: 909,
          media_type: 'tv',
          name: 'Local Watchlist Show',
        },
      },
      metadata: {
        itemCount: 2,
        lastUpdated: MockTimestamp.now(),
        needsEnrichment: false,
      },
      name: 'Should Watch',
    };
    const favoritesData = {
      id: 'favorites',
      items: {
        'tv-202': {
          addedAt: MockTimestamp.fromMillis(new Date('2024-01-05T00:00:00.000Z').getTime()),
          id: 202,
          media_type: 'tv',
          title: 'Favorite Show',
        },
        'movie-303': {
          addedAt: MockTimestamp.fromMillis(new Date('2024-03-03T00:00:00.000Z').getTime()),
          id: 303,
          media_type: 'movie',
          title: 'Local Favorite Movie',
        },
      },
      metadata: {
        itemCount: 2,
        lastUpdated: MockTimestamp.now(),
        needsEnrichment: false,
      },
      name: 'Favorites',
    };
    const customListData = {
      createdAt: MockTimestamp.fromMillis(new Date('2024-01-05T00:00:00.000Z').getTime()),
      description: 'Custom list',
      isCustom: true,
      items: {
        'movie-333': {
          addedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
          id: 333,
          media_type: 'movie',
          title: 'Custom Movie',
          traktId: 303,
        },
      },
      metadata: {
        itemCount: 1,
        lastUpdated: MockTimestamp.now(),
        needsEnrichment: false,
      },
      name: 'Custom List',
      privacy: 'private',
      traktId: 701,
      updatedAt: MockTimestamp.fromMillis(new Date('2024-01-07T00:00:00.000Z').getTime()),
    };
    const listSnapshots = {
      'already-watched': createDocSnapshot('users/user-1/lists/already-watched', alreadyWatchedData),
      favorites: createDocSnapshot('users/user-1/lists/favorites', favoritesData),
      trakt_701: createDocSnapshot('users/user-1/lists/trakt_701', customListData),
      watchlist: createDocSnapshot('users/user-1/lists/watchlist', watchlistData),
    };
    const listsCollection = {
      doc: jest.fn((id: string) => ({
        get: jest.fn().mockResolvedValue({
          data: () => listSnapshots[id as keyof typeof listSnapshots]?.data(),
          exists: Boolean(listSnapshots[id as keyof typeof listSnapshots]),
        }),
        id,
        path: `users/user-1/lists/${id}`,
        set: listSet,
      })),
      get: jest.fn().mockResolvedValue(createCollectionSnapshot([listSnapshots.trakt_701])),
    };
    const episodeTrackingCollection = {
      doc: jest.fn((id: string) => ({
        id,
        path: `users/user-1/episode_tracking/${id}`,
      })),
      get: jest.fn().mockResolvedValue(
        createCollectionSnapshot([
          createDocSnapshot('users/user-1/episode_tracking/201', {
            episodes: {
              '1_1': {
                watched: true,
                watchedAt: MockTimestamp.fromMillis(new Date('2024-02-01T00:00:00.000Z').getTime()),
              },
              '1_2': {
                watched: true,
                watchedAt: MockTimestamp.fromMillis(new Date('2024-02-03T00:00:00.000Z').getTime()),
              },
              '1_3': {
                watched: true,
                watchedAt: MockTimestamp.fromMillis(new Date('2024-02-04T00:00:00.000Z').getTime()),
              },
            },
            metadata: {
              lastUpdated: MockTimestamp.now(),
              tvShowName: 'Show One',
            },
          }),
          createDocSnapshot('users/user-1/episode_tracking/999', {
            episodes: {
              '1_1': {
                watched: true,
                watchedAt: MockTimestamp.fromMillis(new Date('2024-03-04T00:00:00.000Z').getTime()),
              },
            },
            metadata: {
              lastUpdated: MockTimestamp.now(),
              tvShowName: 'Local Only Show',
            },
          }),
        ])
      ),
    };
    const ratingsCollection = {
      doc: jest.fn((id: string) => ({
        id,
        path: `users/user-1/ratings/${id}`,
      })),
      get: jest.fn().mockResolvedValue(
        createCollectionSnapshot([
          createDocSnapshot('users/user-1/ratings/movie-101', {
            id: '101',
            mediaType: 'movie',
            ratedAt: MockTimestamp.fromMillis(new Date('2024-01-09T00:00:00.000Z').getTime()),
            rating: 8,
            title: 'Movie One',
          }),
          createDocSnapshot('users/user-1/ratings/tv-909', {
            id: '909',
            mediaType: 'tv',
            ratedAt: MockTimestamp.fromMillis(new Date('2024-03-05T00:00:00.000Z').getTime()),
            rating: 9,
            title: 'Local TV Rating',
          }),
        ])
      ),
    };
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name === 'traktSyncRuns') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/traktSyncRuns/${id}`,
            })),
          };
        }

        if (name === 'lists') {
          return listsCollection;
        }

        if (name === 'episode_tracking') {
          return episodeTrackingCollection;
        }

        if (name === 'ratings') {
          return ratingsCollection;
        }

        throw new Error(`Unexpected subcollection ${name}`);
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktAccessToken: 'token',
          traktConnected: true,
          traktSyncStatus: {
            runId: 'run-1',
          },
          traktTokenExpiresAt: MockTimestamp.fromMillis(Date.now() + 2 * 60 * 60 * 1000),
        }),
        exists: true,
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      batch: jest.fn(() => ({
        commit: batchCommit,
        delete: batchDelete,
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
    }));

    (global.fetch as jest.Mock).mockImplementation((input: unknown) => {
      const url = String(input);

      if (url.endsWith('/sync/last_activities')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue({}),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/sync/watched/movies')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              last_updated_at: '2024-01-01T00:00:00.000Z',
              last_watched_at: '2024-01-01T00:00:00.000Z',
              movie: {
                ids: {
                  slug: 'movie-1',
                  tmdb: 101,
                  trakt: 201,
                },
                title: 'Movie One',
                year: 2024,
              },
              plays: 1,
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/sync/watched/shows?extended=full')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              last_updated_at: '2024-02-03T00:00:00.000Z',
              last_watched_at: '2024-02-03T00:00:00.000Z',
              plays: 2,
              seasons: [
                {
                  episodes: [
                    {
                      last_watched_at: '2024-02-01T00:00:00.000Z',
                      number: 1,
                      plays: 1,
                    },
                    {
                      last_watched_at: '2024-02-02T00:00:00.000Z',
                      number: 2,
                      plays: 1,
                    },
                  ],
                  number: 1,
                },
              ],
              show: {
                ids: {
                  slug: 'show-1',
                  tmdb: 201,
                  trakt: 301,
                },
                title: 'Show One',
                year: 2020,
              },
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/sync/ratings')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              movie: {
                ids: {
                  slug: 'movie-1',
                  tmdb: 101,
                  trakt: 201,
                },
                title: 'Movie One',
                year: 2024,
              },
              rated_at: '2024-01-08T00:00:00.000Z',
              rating: 8,
              type: 'movie',
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/sync/watchlist')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              id: 1,
              listed_at: '2024-01-02T00:00:00.000Z',
              movie: {
                ids: {
                  slug: 'movie-2',
                  tmdb: 102,
                  trakt: 202,
                },
                title: 'Movie Two',
                year: 2024,
              },
              type: 'movie',
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/sync/favorites')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              id: 2,
              listed_at: '2024-01-04T00:00:00.000Z',
              show: {
                ids: {
                  slug: 'favorite-show',
                  tmdb: 202,
                  trakt: 302,
                },
                title: 'Favorite Show',
                year: 2022,
              },
              type: 'show',
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/users/settings')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue({
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
          }),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/users/tester/lists')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              created_at: '2024-01-05T00:00:00.000Z',
              description: 'Custom list',
              ids: {
                slug: 'custom-list',
                trakt: 701,
              },
              name: 'Custom List',
              privacy: 'private',
              updated_at: '2024-01-07T00:00:00.000Z',
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/users/tester/lists/custom-list/items')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              id: 77,
              listed_at: '2024-01-06T00:00:00.000Z',
              movie: {
                ids: {
                  slug: 'custom-movie',
                  tmdb: 333,
                  trakt: 303,
                },
                title: 'Custom Movie',
                year: 2024,
              },
              rank: 1,
              type: 'movie',
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      throw new Error(`Unexpected fetch URL ${url}`);
    });

    await expect(
      (runTraktSync as any)({
        data: { runId: 'run-1', userId: 'user-1' },
        retryCount: 0,
        retryReason: undefined,
      })
    ).resolves.toBeUndefined();

    const completedWrite = batchSet.mock.calls
      .map(([_ref, data]) => ('traktSyncStatus' in data ? data.traktSyncStatus : data))
      .find((data) => data?.status === 'completed') as
      | {
          itemsSynced: ReturnType<typeof emptyItemsSynced>;
          summaryMode: string;
        }
      | undefined;

    expect(completedWrite).toMatchObject({
      itemsSynced: {
        episodes: 2,
        favorites: 1,
        lists: 1,
        movies: 1,
        ratings: 1,
        shows: 1,
        watchlistItems: 1,
      },
      summaryMode: 'bootstrap',
    });
    expect(batchDelete).not.toHaveBeenCalled();
    expect(listSet).not.toHaveBeenCalled();
  });

  it('does not count normalization-only managed list writes as remote changes', async () => {
    const listSet = jest.fn().mockResolvedValue(undefined);
    const movieItem = {
      addedAt: MockTimestamp.fromMillis(new Date('2024-01-03T00:00:00.000Z').getTime()),
      id: 101,
      media_type: 'movie',
      release_date: '2024-01-01',
      title: 'Movie One',
    };

    const result = await (__test__ as any).reconcileManagedList(
      'user-1',
      'watchlist',
      {
        'movie-101': movieItem,
      },
      {
        id: 'watchlist',
        name: 'Should Watch',
      },
      createDocSnapshotWithSet(
        'users/user-1/lists/watchlist',
        {
          id: 'watchlist',
          items: {
            '101': movieItem,
          },
          metadata: {
            itemCount: 1,
            lastUpdated: MockTimestamp.now(),
            needsEnrichment: false,
          },
          name: 'Should Watch',
        },
        listSet
      ),
      {
        preserveLocalItems: true,
        recencyField: 'addedAt',
      }
    );

    expect(result).toEqual({
      changedCount: 0,
      changedMediaTypes: [],
      didRemoteChange: false,
      didWrite: true,
      shouldEnrich: false,
    });
    expect(listSet).toHaveBeenCalledWith(
      expect.objectContaining({
        items: {
          '101': 'FIELD_DELETE',
          'movie-101': expect.objectContaining({
            id: 101,
            media_type: 'movie',
            title: 'Movie One',
          }),
        },
        metadata: expect.objectContaining({
          itemCount: 1,
          needsEnrichment: false,
        }),
      }),
      { merge: true }
    );
  });

  it('counts true remote managed list adds and updates as remote changes', async () => {
    const listSet = jest.fn().mockResolvedValue(undefined);
    const movieItem = {
      addedAt: MockTimestamp.fromMillis(new Date('2024-01-03T00:00:00.000Z').getTime()),
      id: 101,
      media_type: 'movie',
      release_date: '2024-01-01',
      title: 'Movie One',
    };

    const result = await (__test__ as any).reconcileManagedList(
      'user-1',
      'watchlist',
      {
        'movie-101': movieItem,
      },
      {
        id: 'watchlist',
        name: 'Should Watch',
      },
      createDocSnapshotWithSet(
        'users/user-1/lists/watchlist',
        {
          id: 'watchlist',
          items: {},
          metadata: {
            itemCount: 0,
            lastUpdated: MockTimestamp.now(),
            needsEnrichment: false,
          },
          name: 'Should Watch',
        },
        listSet
      ),
      {
        preserveLocalItems: true,
        recencyField: 'addedAt',
      }
    );

    expect(result).toEqual({
      changedCount: 1,
      changedMediaTypes: ['movie'],
      didRemoteChange: true,
      didWrite: true,
      shouldEnrich: true,
    });
    expect(listSet).toHaveBeenCalledWith(
      expect.objectContaining({
        items: {
          'movie-101': expect.objectContaining({
            id: 101,
            media_type: 'movie',
            title: 'Movie One',
          }),
        },
        metadata: expect.objectContaining({
          itemCount: 1,
          needsEnrichment: true,
        }),
      }),
      { merge: true }
    );
  });

  it('counts remote managed list deletions as remote changes', async () => {
    const listSet = jest.fn().mockResolvedValue(undefined);
    const movieItem = {
      addedAt: MockTimestamp.fromMillis(new Date('2024-01-03T00:00:00.000Z').getTime()),
      id: 101,
      media_type: 'movie',
      title: 'Custom Movie',
      traktId: 303,
    };

    const result = await (__test__ as any).reconcileManagedList(
      'user-1',
      'trakt_701',
      {},
      {
        createdAt: MockTimestamp.fromMillis(new Date('2024-01-01T00:00:00.000Z').getTime()),
        description: 'Custom list',
        isCustom: true,
        name: 'Custom List',
        privacy: 'private',
        traktId: 701,
        updatedAt: MockTimestamp.fromMillis(new Date('2024-01-07T00:00:00.000Z').getTime()),
      },
      createDocSnapshotWithSet(
        'users/user-1/lists/trakt_701',
        {
          createdAt: MockTimestamp.fromMillis(new Date('2024-01-01T00:00:00.000Z').getTime()),
          description: 'Custom list',
          id: 'trakt_701',
          isCustom: true,
          items: {
            'movie-101': movieItem,
          },
          metadata: {
            itemCount: 1,
            lastUpdated: MockTimestamp.now(),
            needsEnrichment: false,
          },
          name: 'Custom List',
          privacy: 'private',
          traktId: 701,
          updatedAt: MockTimestamp.fromMillis(new Date('2024-01-07T00:00:00.000Z').getTime()),
        },
        listSet
      ),
      {
        countBaseDataChangesAsRemoteChange: true,
        preserveLocalItems: false,
        recencyField: 'addedAt',
      }
    );

    expect(result).toEqual({
      changedCount: 1,
      changedMediaTypes: ['movie'],
      didRemoteChange: true,
      didWrite: true,
      shouldEnrich: false,
    });
    expect(listSet).toHaveBeenCalledWith(
      expect.objectContaining({
        items: {
          'movie-101': 'FIELD_DELETE',
        },
        metadata: expect.objectContaining({
          itemCount: 0,
          needsEnrichment: false,
        }),
      }),
      { merge: true }
    );
  });

  it('reports zero incremental summary deltas for normalization-only managed list writes', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const listSet = jest.fn().mockResolvedValue(undefined);
    const lastActivitiesBefore = {
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
    const lastActivitiesAfter = {
      ...lastActivitiesBefore,
      favorites: {
        updated_at: '2024-01-06T00:00:00.000Z',
      },
      movies: {
        ...lastActivitiesBefore.movies,
        watched_at: '2024-01-06T00:00:00.000Z',
      },
      watchlist: {
        updated_at: '2024-01-06T00:00:00.000Z',
      },
    };
    const listDataById: Record<string, Record<string, unknown>> = {
      'already-watched': {
        id: 'already-watched',
        items: {
          '101': {
            addedAt: MockTimestamp.fromMillis(new Date('2024-01-01T00:00:00.000Z').getTime()),
            id: 101,
            media_type: 'movie',
            release_date: '2024-01-01',
            title: 'Movie One',
          },
        },
        metadata: {
          itemCount: 1,
          lastUpdated: MockTimestamp.now(),
          needsEnrichment: false,
        },
        name: 'Already Watched',
      },
      favorites: {
        id: 'favorites',
        items: {
          '202': {
            addedAt: MockTimestamp.fromMillis(new Date('2024-01-04T00:00:00.000Z').getTime()),
            id: 202,
            media_type: 'tv',
            title: 'Favorite Show',
          },
        },
        metadata: {
          itemCount: 1,
          lastUpdated: MockTimestamp.now(),
          needsEnrichment: false,
        },
        name: 'Favorites',
      },
      watchlist: {
        id: 'watchlist',
        items: {
          '102': {
            addedAt: MockTimestamp.fromMillis(new Date('2024-01-02T00:00:00.000Z').getTime()),
            id: 102,
            media_type: 'movie',
            release_date: '2024-01-01',
            title: 'Movie Two',
          },
        },
        metadata: {
          itemCount: 1,
          lastUpdated: MockTimestamp.now(),
          needsEnrichment: false,
        },
        name: 'Should Watch',
      },
    };
    const listsCollection = {
      doc: jest.fn((id: string) => ({
        get: jest.fn().mockResolvedValue({
          data: () => listDataById[id],
          exists: Boolean(listDataById[id]),
        }),
        id,
        path: `users/user-1/lists/${id}`,
        set: listSet,
      })),
    };
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name === 'traktSyncRuns') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/traktSyncRuns/${id}`,
            })),
          };
        }

        if (name === 'lists') {
          return listsCollection;
        }

        if (name === 'episode_tracking') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/episode_tracking/${id}`,
            })),
            get: jest.fn().mockResolvedValue({ docs: [] }),
          };
        }

        throw new Error(`Unexpected subcollection ${name}`);
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktAccessToken: 'token',
          traktConnected: true,
          traktIncrementalState: {
            bootstrapCompletedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
            customLists: {},
            lastActivities: lastActivitiesBefore,
            schemaVersion: 1,
            updatedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
          },
          traktSyncStatus: {
            runId: 'run-1',
          },
          traktTokenExpiresAt: MockTimestamp.fromMillis(Date.now() + 2 * 60 * 60 * 1000),
        }),
        exists: true,
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      batch: jest.fn(() => ({
        commit: batchCommit,
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
    }));

    (global.fetch as jest.Mock).mockImplementation((input: unknown) => {
      const url = String(input);

      if (url.endsWith('/sync/last_activities')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue(lastActivitiesAfter),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/sync/watched/movies')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              last_updated_at: '2024-01-01T00:00:00.000Z',
              last_watched_at: '2024-01-01T00:00:00.000Z',
              movie: {
                ids: {
                  slug: 'movie-1',
                  tmdb: 101,
                  trakt: 201,
                },
                title: 'Movie One',
                year: 2024,
              },
              plays: 1,
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/sync/watched/shows?extended=full')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([]),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/sync/watchlist')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              id: 1,
              listed_at: '2024-01-02T00:00:00.000Z',
              movie: {
                ids: {
                  slug: 'movie-2',
                  tmdb: 102,
                  trakt: 202,
                },
                title: 'Movie Two',
                year: 2024,
              },
              type: 'movie',
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/sync/favorites')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              id: 2,
              listed_at: '2024-01-04T00:00:00.000Z',
              show: {
                ids: {
                  slug: 'favorite-show',
                  tmdb: 202,
                  trakt: 302,
                },
                title: 'Favorite Show',
                year: 2022,
              },
              type: 'show',
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      throw new Error(`Unexpected fetch URL ${url}`);
    });

    await expect(
      (runTraktSync as any)({
        data: { runId: 'run-1', userId: 'user-1' },
        retryCount: 0,
        retryReason: undefined,
      })
    ).resolves.toBeUndefined();

    const completedWrite = batchSet.mock.calls
      .map(([_ref, data]) => ('traktSyncStatus' in data ? data.traktSyncStatus : data))
      .find((data) => data?.status === 'completed') as
      | {
          itemsSynced: ReturnType<typeof emptyItemsSynced>;
          summaryMode: string;
        }
      | undefined;

    expect(completedWrite).toMatchObject({
      itemsSynced: emptyItemsSynced(),
      summaryMode: 'incremental',
    });
    expect(listSet).toHaveBeenCalledTimes(3);
  });

  it('keeps itemsSynced.lists at zero when incremental custom list reconciliation only normalizes local data', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const listSet = jest.fn().mockResolvedValue(undefined);
    const lastActivitiesBefore = {
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
    const lastActivitiesAfter = {
      ...lastActivitiesBefore,
      lists: {
        updated_at: '2024-01-06T00:00:00.000Z',
      },
    };
    const localListDoc = createDocSnapshotWithSet(
      'users/user-1/lists/trakt_701',
      {
        createdAt: MockTimestamp.fromMillis(new Date('2024-01-05T00:00:00.000Z').getTime()),
        description: 'Custom list',
        isCustom: true,
        items: {
          '333': {
            addedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
            id: 333,
            media_type: 'movie',
            title: 'Custom Movie',
            traktId: 303,
          },
        },
        metadata: {
          itemCount: 1,
          lastUpdated: MockTimestamp.now(),
          needsEnrichment: false,
        },
        name: 'Custom List',
        privacy: 'private',
        traktId: 701,
        updatedAt: MockTimestamp.fromMillis(new Date('2024-01-07T00:00:00.000Z').getTime()),
      },
      listSet
    );
    const listsCollection = {
      get: jest.fn().mockResolvedValue({
        docs: [localListDoc],
      }),
    };
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name === 'traktSyncRuns') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/traktSyncRuns/${id}`,
            })),
          };
        }

        if (name === 'lists') {
          return listsCollection;
        }

        throw new Error(`Unexpected subcollection ${name}`);
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktAccessToken: 'token',
          traktConnected: true,
          traktIncrementalState: {
            bootstrapCompletedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
            customLists: {},
            lastActivities: lastActivitiesBefore,
            schemaVersion: 1,
            updatedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
          },
          traktSyncStatus: {
            runId: 'run-1',
          },
          traktTokenExpiresAt: MockTimestamp.fromMillis(Date.now() + 2 * 60 * 60 * 1000),
        }),
        exists: true,
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      batch: jest.fn(() => ({
        commit: batchCommit,
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
    }));

    (global.fetch as jest.Mock).mockImplementation((input: unknown) => {
      const url = String(input);

      if (url.endsWith('/sync/last_activities')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue(lastActivitiesAfter),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/users/settings')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue({
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
          }),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/users/tester/lists')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              created_at: '2024-01-05T00:00:00.000Z',
              description: 'Custom list',
              ids: {
                slug: 'custom-list',
                trakt: 701,
              },
              name: 'Custom List',
              privacy: 'private',
              updated_at: '2024-01-07T00:00:00.000Z',
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/users/tester/lists/custom-list/items')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              id: 77,
              listed_at: '2024-01-06T00:00:00.000Z',
              movie: {
                ids: {
                  slug: 'custom-movie',
                  tmdb: 333,
                  trakt: 303,
                },
                title: 'Custom Movie',
                year: 2024,
              },
              rank: 1,
              type: 'movie',
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      throw new Error(`Unexpected fetch URL ${url}`);
    });

    await expect(
      (runTraktSync as any)({
        data: { runId: 'run-1', userId: 'user-1' },
        retryCount: 0,
        retryReason: undefined,
      })
    ).resolves.toBeUndefined();

    const completedWrite = batchSet.mock.calls
      .map(([_ref, data]) => ('traktSyncStatus' in data ? data.traktSyncStatus : data))
      .find((data) => data?.status === 'completed') as
      | {
          itemsSynced: ReturnType<typeof emptyItemsSynced>;
          summaryMode: string;
        }
      | undefined;

    expect(completedWrite).toMatchObject({
      itemsSynced: {
        ...emptyItemsSynced(),
        lists: 0,
      },
      summaryMode: 'incremental',
    });
    expect(listSet).toHaveBeenCalledTimes(1);
  });

  it('counts remote custom list metadata changes in itemsSynced.lists even when items are unchanged', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const listSet = jest.fn().mockResolvedValue(undefined);
    const lastActivitiesBefore = {
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
    const lastActivitiesAfter = {
      ...lastActivitiesBefore,
      lists: {
        updated_at: '2024-01-07T00:00:00.000Z',
      },
    };
    const localListDoc = createDocSnapshotWithSet(
      'users/user-1/lists/trakt_701',
      {
        createdAt: MockTimestamp.fromMillis(new Date('2024-01-05T00:00:00.000Z').getTime()),
        description: 'Custom list',
        isCustom: true,
        items: {
          'movie-333': {
            addedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
            id: 333,
            media_type: 'movie',
            title: 'Custom Movie',
            traktId: 303,
          },
        },
        metadata: {
          itemCount: 1,
          lastUpdated: MockTimestamp.now(),
          needsEnrichment: false,
        },
        name: 'Old Custom List',
        privacy: 'private',
        traktId: 701,
        updatedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
      },
      listSet
    );
    const listsCollection = {
      get: jest.fn().mockResolvedValue({
        docs: [localListDoc],
      }),
    };
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name === 'traktSyncRuns') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/traktSyncRuns/${id}`,
            })),
          };
        }

        if (name === 'lists') {
          return listsCollection;
        }

        throw new Error(`Unexpected subcollection ${name}`);
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktAccessToken: 'token',
          traktConnected: true,
          traktIncrementalState: {
            bootstrapCompletedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
            customLists: {
              '701': {
                slug: 'custom-list',
                updatedAt: '2024-01-06T00:00:00.000Z',
              },
            },
            lastActivities: lastActivitiesBefore,
            schemaVersion: 1,
            updatedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
          },
          traktSyncStatus: {
            runId: 'run-1',
          },
          traktTokenExpiresAt: MockTimestamp.fromMillis(Date.now() + 2 * 60 * 60 * 1000),
        }),
        exists: true,
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      batch: jest.fn(() => ({
        commit: batchCommit,
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
    }));

    (global.fetch as jest.Mock).mockImplementation((input: unknown) => {
      const url = String(input);

      if (url.endsWith('/sync/last_activities')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue(lastActivitiesAfter),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/users/settings')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue({
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
          }),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/users/tester/lists')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              created_at: '2024-01-05T00:00:00.000Z',
              description: 'Custom list',
              ids: {
                slug: 'custom-list',
                trakt: 701,
              },
              name: 'Custom List',
              privacy: 'private',
              updated_at: '2024-01-07T00:00:00.000Z',
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/users/tester/lists/custom-list/items')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              id: 77,
              listed_at: '2024-01-06T00:00:00.000Z',
              movie: {
                ids: {
                  slug: 'custom-movie',
                  tmdb: 333,
                  trakt: 303,
                },
                title: 'Custom Movie',
                year: 2024,
              },
              rank: 1,
              type: 'movie',
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      throw new Error(`Unexpected fetch URL ${url}`);
    });

    await expect(
      (runTraktSync as any)({
        data: { runId: 'run-1', userId: 'user-1' },
        retryCount: 0,
        retryReason: undefined,
      })
    ).resolves.toBeUndefined();

    const completedWrite = batchSet.mock.calls
      .map(([_ref, data]) => ('traktSyncStatus' in data ? data.traktSyncStatus : data))
      .find((data) => data?.status === 'completed') as
      | {
          itemsSynced: ReturnType<typeof emptyItemsSynced>;
          summaryMode: string;
        }
      | undefined;

    expect(completedWrite).toMatchObject({
      itemsSynced: {
        ...emptyItemsSynced(),
        lists: 1,
      },
      summaryMode: 'incremental',
    });
    expect(listSet).toHaveBeenCalledTimes(1);
  });

  it('preserves local-only ratings and only overwrites overlapping Trakt ratings when Trakt is newer', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchDelete = jest.fn();
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const lastActivitiesBefore = {
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
    const lastActivitiesAfter = {
      ...lastActivitiesBefore,
      movies: {
        ...lastActivitiesBefore.movies,
        rated_at: '2024-01-06T00:00:00.000Z',
      },
      shows: {
        ...lastActivitiesBefore.shows,
        rated_at: '2024-01-05T00:00:00.000Z',
      },
    };
    const ratingsCollection = {
      doc: jest.fn((id: string) => ({
        id,
        path: `users/user-1/ratings/${id}`,
      })),
      get: jest.fn().mockResolvedValue(
        createCollectionSnapshot([
          createDocSnapshot('users/user-1/ratings/movie-101', {
            id: '101',
            mediaType: 'movie',
            ratedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
            rating: 9,
            title: 'Movie One',
          }),
          createDocSnapshot('users/user-1/ratings/movie-303', {
            id: '303',
            mediaType: 'movie',
            ratedAt: MockTimestamp.fromMillis(new Date('2024-01-07T00:00:00.000Z').getTime()),
            rating: 7,
            title: 'Local Only Movie',
          }),
          createDocSnapshot('users/user-1/ratings/tv-202', {
            id: '202',
            mediaType: 'tv',
            ratedAt: MockTimestamp.fromMillis(new Date('2024-01-03T00:00:00.000Z').getTime()),
            rating: 6,
            title: 'Show Two',
          }),
        ])
      ),
    };
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name === 'traktSyncRuns') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/traktSyncRuns/${id}`,
            })),
          };
        }

        if (name === 'ratings') {
          return ratingsCollection;
        }

        throw new Error(`Unexpected subcollection ${name}`);
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktAccessToken: 'token',
          traktConnected: true,
          traktIncrementalState: {
            bootstrapCompletedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
            customLists: {},
            lastActivities: lastActivitiesBefore,
            schemaVersion: 1,
            updatedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
          },
          traktSyncStatus: {
            runId: 'run-1',
          },
          traktTokenExpiresAt: MockTimestamp.fromMillis(Date.now() + 2 * 60 * 60 * 1000),
        }),
        exists: true,
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      batch: jest.fn(() => ({
        commit: batchCommit,
        delete: batchDelete,
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
    }));

    (global.fetch as jest.Mock).mockImplementation((input: unknown) => {
      const url = String(input);

      if (url.endsWith('/sync/last_activities')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue(lastActivitiesAfter),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/sync/ratings')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              movie: {
                ids: {
                  slug: 'movie-1',
                  tmdb: 101,
                  trakt: 201,
                },
                title: 'Movie One',
                year: 2024,
              },
              rated_at: '2024-01-05T00:00:00.000Z',
              rating: 8,
              type: 'movie',
            },
            {
              rated_at: '2024-01-04T00:00:00.000Z',
              rating: 8,
              show: {
                ids: {
                  slug: 'show-2',
                  tmdb: 202,
                  trakt: 302,
                },
                title: 'Show Two',
                year: 2022,
              },
              type: 'show',
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      throw new Error(`Unexpected fetch URL ${url}`);
    });

    await expect(
      (runTraktSync as any)({
        data: { runId: 'run-1', userId: 'user-1' },
        retryCount: 0,
        retryReason: undefined,
      })
    ).resolves.toBeUndefined();

    const ratingWrites = batchSet.mock.calls
      .filter(([ref]) => typeof ref?.path === 'string' && ref.path.startsWith('users/user-1/ratings/'))
      .map((call) => {
        const [ref, data, options] = call as unknown as [
          { path: string },
          Record<string, unknown>,
          { merge: boolean } | undefined,
        ];

        return {
          data,
          options,
          path: ref.path,
        };
      });

    expect(ratingWrites).toHaveLength(1);
    expect(ratingWrites[0]?.path).toBe('users/user-1/ratings/tv-202');
    expect(ratingWrites[0]?.options).toEqual({ merge: false });
    expect(ratingWrites[0]?.data).toMatchObject({
      id: '202',
      mediaType: 'tv',
      rating: 8,
      title: 'Show Two',
    });
    expect((ratingWrites[0]?.data?.ratedAt as MockTimestamp).toMillis()).toBe(
      new Date('2024-01-04T00:00:00.000Z').getTime()
    );
    expect(ratingWrites[0]?.data).not.toHaveProperty('media_type');
    expect(ratingWrites.some((write) => write.path === 'users/user-1/ratings/movie-101')).toBe(false);
    expect(ratingWrites.some((write) => write.path === 'users/user-1/ratings/movie-303')).toBe(false);
    expect(batchDelete).not.toHaveBeenCalled();

    const completedWrite = batchSet.mock.calls
      .map(([_ref, data]) => ('traktSyncStatus' in data ? data.traktSyncStatus : data))
      .find((data) => data?.status === 'completed') as
      | {
          itemsSynced: ReturnType<typeof emptyItemsSynced>;
          summaryMode: string;
        }
      | undefined;

    expect(completedWrite).toMatchObject({
      itemsSynced: {
        ratings: 1,
      },
      summaryMode: 'incremental',
    });
  });

  it('reports zero changed items for unchanged incremental syncs', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const lastActivities = {
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
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name !== 'traktSyncRuns') {
          throw new Error(`Unexpected subcollection ${name}`);
        }

        return {
          doc: jest.fn((id: string) => ({
            id,
            path: `users/user-1/traktSyncRuns/${id}`,
          })),
        };
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktAccessToken: 'token',
          traktConnected: true,
          traktIncrementalState: {
            bootstrapCompletedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
            customLists: {},
            lastActivities,
            schemaVersion: 1,
            updatedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
          },
          traktSyncStatus: {
            runId: 'run-1',
          },
          traktTokenExpiresAt: MockTimestamp.fromMillis(Date.now() + 2 * 60 * 60 * 1000),
        }),
        exists: true,
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      batch: jest.fn(() => ({
        commit: batchCommit,
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
    }));

    (global.fetch as jest.Mock).mockImplementation((input: unknown) => {
      const url = String(input);

      if (url.endsWith('/sync/last_activities')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue(lastActivities),
          ok: true,
          status: 200,
        });
      }

      throw new Error(`Unexpected fetch URL ${url}`);
    });

    await expect(
      (runTraktSync as any)({
        data: { runId: 'run-1', userId: 'user-1' },
        retryCount: 0,
        retryReason: undefined,
      })
    ).resolves.toBeUndefined();

    const completedWrite = batchSet.mock.calls
      .map(([_ref, data]) => ('traktSyncStatus' in data ? data.traktSyncStatus : data))
      .find((data) => data?.status === 'completed') as
      | {
          itemsSynced: ReturnType<typeof emptyItemsSynced>;
          summaryMode: string;
        }
      | undefined;

    expect(completedWrite).toMatchObject({
      itemsSynced: emptyItemsSynced(),
      summaryMode: 'incremental',
    });
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);
  });

  it('reports only the changed incremental bucket when a single activity group changes', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const listSet = jest.fn().mockResolvedValue(undefined);
    const lastActivitiesBefore = {
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
    const lastActivitiesAfter = {
      ...lastActivitiesBefore,
      watchlist: {
        updated_at: '2024-01-06T00:00:00.000Z',
      },
    };
    const listsCollection = {
      doc: jest.fn((id: string) => ({
        get: jest.fn().mockResolvedValue({
          data: () => undefined,
          exists: false,
        }),
        id,
        path: `users/user-1/lists/${id}`,
        set: listSet,
      })),
    };
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name === 'traktSyncRuns') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/traktSyncRuns/${id}`,
            })),
          };
        }

        if (name === 'traktEnrichmentRuns') {
          return {
            doc: jest.fn((id = 'enrich-1') => ({
              id,
              path: `users/user-1/traktEnrichmentRuns/${id}`,
            })),
          };
        }

        if (name === 'lists') {
          return listsCollection;
        }

        throw new Error(`Unexpected subcollection ${name}`);
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktAccessToken: 'token',
          traktConnected: true,
          traktIncrementalState: {
            bootstrapCompletedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
            customLists: {},
            lastActivities: lastActivitiesBefore,
            schemaVersion: 1,
            updatedAt: MockTimestamp.fromMillis(new Date('2024-01-06T00:00:00.000Z').getTime()),
          },
          traktSyncStatus: {
            runId: 'run-1',
          },
          traktTokenExpiresAt: MockTimestamp.fromMillis(Date.now() + 2 * 60 * 60 * 1000),
        }),
        exists: true,
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      batch: jest.fn(() => ({
        commit: batchCommit,
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
      runTransaction: jest.fn().mockResolvedValue({
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
      }),
    }));

    (global.fetch as jest.Mock).mockImplementation((input: unknown) => {
      const url = String(input);

      if (url.endsWith('/sync/last_activities')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue(lastActivitiesAfter),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/sync/watchlist')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              id: 1,
              listed_at: '2024-01-06T00:00:00.000Z',
              movie: {
                ids: {
                  slug: 'movie-2',
                  tmdb: 102,
                  trakt: 202,
                },
                title: 'Movie Two',
                year: 2024,
              },
              type: 'movie',
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      throw new Error(`Unexpected fetch URL ${url}`);
    });

    await expect(
      (runTraktSync as any)({
        data: { runId: 'run-1', userId: 'user-1' },
        retryCount: 0,
        retryReason: undefined,
      })
    ).resolves.toBeUndefined();

    const completedWrite = batchSet.mock.calls
      .map(([_ref, data]) => ('traktSyncStatus' in data ? data.traktSyncStatus : data))
      .find((data) => data?.status === 'completed') as
      | {
          itemsSynced: ReturnType<typeof emptyItemsSynced>;
          summaryMode: string;
        }
      | undefined;

    expect(completedWrite).toMatchObject({
      itemsSynced: {
        episodes: 0,
        favorites: 0,
        lists: 0,
        movies: 0,
        ratings: 0,
        shows: 0,
        watchlistItems: 1,
      },
      summaryMode: 'incremental',
    });
    expect(listSet).toHaveBeenCalledTimes(1);
  });

  it('sanitizes failed worker status writes when optional diagnostics are absent', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name !== 'traktSyncRuns') {
          throw new Error(`Unexpected subcollection ${name}`);
        }

        return {
          doc: jest.fn((id: string) => ({
            id,
            path: `users/user-1/traktSyncRuns/${id}`,
          })),
        };
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktConnected: false,
          traktSyncStatus: {
            runId: 'run-1',
          },
        }),
        exists: true,
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      batch: jest.fn(() => ({
        commit: batchCommit,
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
    }));

    await expect(
      (runTraktSync as any)({
        data: { runId: 'run-1', userId: 'user-1' },
        retryCount: 0,
        retryReason: undefined,
      })
    ).resolves.toBeUndefined();

    expect(batchSet).toHaveBeenCalledTimes(2);
    expect(batchCommit).toHaveBeenCalledTimes(1);
  });

  it('sends the shared User-Agent on authenticated sync API requests', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const listSet = jest.fn().mockResolvedValue(undefined);
    const listsCollection = {
      doc: jest.fn((id: string) => ({
        id,
        path: `users/user-1/lists/${id}`,
        get: jest.fn().mockResolvedValue({
          data: () => undefined,
          exists: false,
        }),
        set: listSet,
      })),
      get: jest.fn().mockResolvedValue({ docs: [] }),
    };
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name === 'traktSyncRuns') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/traktSyncRuns/${id}`,
            })),
          };
        }

        if (name === 'traktEnrichmentRuns') {
          return {
            doc: jest.fn((id = 'enrich-1') => ({
              id,
              path: `users/user-1/traktEnrichmentRuns/${id}`,
            })),
          };
        }

        if (name === 'lists') {
          return listsCollection;
        }

        if (name === 'episode_tracking') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/episode_tracking/${id}`,
            })),
            get: jest.fn().mockResolvedValue({ docs: [] }),
          };
        }

        if (name === 'ratings') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/ratings/${id}`,
            })),
            get: jest.fn().mockResolvedValue({ docs: [] }),
          };
        }

        throw new Error(`Unexpected subcollection ${name}`);
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktAccessToken: 'token',
          traktConnected: true,
          traktSyncStatus: {
            runId: 'run-1',
          },
          traktTokenExpiresAt: MockTimestamp.fromMillis(Date.now() + 2 * 60 * 60 * 1000),
        }),
        exists: true,
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      batch: jest.fn(() => ({
        commit: batchCommit,
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
      runTransaction: jest.fn().mockResolvedValue({
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
      }),
    }));

    (global.fetch as jest.Mock).mockImplementation((input: any) => {
      const url = String(input);

      if (url.endsWith('/users/settings')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue({
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
          }),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/sync/last_activities')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue({}),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/sync/watched/movies')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              last_updated_at: '2024-01-01T00:00:00.000Z',
              last_watched_at: '2024-01-01T00:00:00.000Z',
              movie: {
                ids: {
                  slug: 'movie-1',
                  tmdb: 101,
                  trakt: 201,
                },
                title: 'Movie One',
                year: 2024,
              },
              plays: 1,
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/sync/watchlist')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              id: 1,
              listed_at: '2024-01-02T00:00:00.000Z',
              movie: {
                ids: {
                  slug: 'movie-2',
                  tmdb: 102,
                  trakt: 202,
                },
                title: 'Movie Two',
                year: 2024,
              },
              type: 'movie',
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/sync/favorites')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              id: 2,
              listed_at: '2024-01-03T00:00:00.000Z',
              movie: {
                ids: {
                  slug: 'movie-3',
                  tmdb: 103,
                  trakt: 203,
                },
                title: 'Movie Three',
                year: 2024,
              },
              type: 'movie',
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      if (
        url.endsWith('/sync/watched/shows?extended=full') ||
        url.endsWith('/sync/ratings') ||
        url.endsWith('/users/tester/lists')
      ) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([]),
          ok: true,
          status: 200,
        });
      }

      throw new Error(`Unexpected fetch URL ${url}`);
    });

    await (runTraktSync as any)({
      data: { runId: 'run-1', userId: 'user-1' },
      retryCount: 0,
      retryReason: undefined,
    });

    expect((global.fetch as jest.Mock).mock.calls).not.toHaveLength(0);

    const [, firstRequestInit] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      { headers: Record<string, string> }
    ];

    expect(firstRequestInit.headers).toEqual(
      expect.objectContaining({
        Accept: 'application/json',
        Authorization: 'Bearer token',
        'User-Agent': 'ShowSeek-TraktFunctions/1.0',
        'trakt-api-key': 'test-secret',
        'trakt-api-version': '2',
      })
    );
    expect(firstRequestInit.headers['Content-Type']).toBeUndefined();
  });

  it('auto-queues post-sync enrichment without episode tracking scans', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const listSet = jest.fn().mockResolvedValue(undefined);
    const listsCollection = {
      doc: jest.fn((id: string) => ({
        id,
        path: `users/user-1/lists/${id}`,
        get: jest.fn().mockResolvedValue({
          data: () => undefined,
          exists: false,
        }),
        set: listSet,
      })),
      get: jest.fn().mockResolvedValue({ docs: [] }),
    };
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name === 'traktSyncRuns') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/traktSyncRuns/${id}`,
            })),
          };
        }

        if (name === 'traktEnrichmentRuns') {
          return {
            doc: jest.fn((id = 'enrich-1') => ({
              id,
              path: `users/user-1/traktEnrichmentRuns/${id}`,
            })),
          };
        }

        if (name === 'lists') {
          return listsCollection;
        }

        if (name === 'episode_tracking') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/episode_tracking/${id}`,
            })),
            get: jest.fn().mockResolvedValue({ docs: [] }),
          };
        }

        if (name === 'ratings') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/ratings/${id}`,
            })),
            get: jest.fn().mockResolvedValue({ docs: [] }),
          };
        }

        throw new Error(`Unexpected subcollection ${name}`);
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktAccessToken: 'token',
          traktConnected: true,
          traktSyncStatus: {
            runId: 'run-1',
          },
          traktTokenExpiresAt: MockTimestamp.fromMillis(Date.now() + 2 * 60 * 60 * 1000),
        }),
        exists: true,
      }),
      path: 'users/user-1',
    };
    const runTransaction = jest.fn().mockResolvedValue({
      kind: 'queued',
      status: {
        includeEpisodes: false,
        lists: ['already-watched', 'watchlist', 'favorites'],
        runId: 'enrich-1',
        userId: 'user-1',
      },
    });

    firestoreFn.mockImplementation(() => ({
      batch: jest.fn(() => ({
        commit: batchCommit,
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
      runTransaction,
    }));

    (global.fetch as jest.Mock).mockImplementation((input: any) => {
      const url = String(input);

      if (url.endsWith('/users/settings')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue({
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
          }),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/sync/last_activities')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue({}),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/sync/watched/movies')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              last_updated_at: '2024-01-01T00:00:00.000Z',
              last_watched_at: '2024-01-01T00:00:00.000Z',
              movie: {
                ids: {
                  slug: 'movie-1',
                  tmdb: 101,
                  trakt: 201,
                },
                title: 'Movie One',
                year: 2024,
              },
              plays: 1,
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/sync/watchlist')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              id: 1,
              listed_at: '2024-01-02T00:00:00.000Z',
              movie: {
                ids: {
                  slug: 'movie-2',
                  tmdb: 102,
                  trakt: 202,
                },
                title: 'Movie Two',
                year: 2024,
              },
              type: 'movie',
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/sync/favorites')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              id: 2,
              listed_at: '2024-01-03T00:00:00.000Z',
              movie: {
                ids: {
                  slug: 'movie-3',
                  tmdb: 103,
                  trakt: 203,
                },
                title: 'Movie Three',
                year: 2024,
              },
              type: 'movie',
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      if (
        url.endsWith('/sync/watched/shows?extended=full') ||
        url.endsWith('/sync/ratings') ||
        url.endsWith('/users/tester/lists')
      ) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([]),
          ok: true,
          status: 200,
        });
      }

      throw new Error(`Unexpected fetch URL ${url}`);
    });

    await expect(
      (runTraktSync as any)({
        data: { runId: 'run-1', userId: 'user-1' },
        retryCount: 0,
        retryReason: undefined,
      })
    ).resolves.toBeUndefined();

    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledWith(
      {
        includeEpisodes: false,
        lists: ['already-watched', 'watchlist', 'favorites'],
        runId: 'enrich-1',
        userId: 'user-1',
      },
      expect.objectContaining({
        dispatchDeadlineSeconds: 1800,
        id: 'enrich-1',
      })
    );
  });

  it('keeps upstream rate-limit cooldowns enforced in the functions emulator even when the dev header is present', async () => {
    const originalFunctionsEmulator = process.env.FUNCTIONS_EMULATOR;
    process.env.FUNCTIONS_EMULATOR = 'true';

    const futureCooldown = MockTimestamp.fromMillis(Date.now() + DAY_MS);
    const transactionGet = jest.fn().mockResolvedValue({
      data: () => ({
        traktAccessToken: 'token',
        traktConnected: true,
        traktSyncStatus: {
          errorCategory: 'rate_limited',
          lastSyncedAt: MockTimestamp.fromMillis(Date.now() - 30_000),
          nextAllowedSyncAt: futureCooldown,
          runId: 'failed-run',
          status: 'failed',
        },
      }),
    });
    const transactionSet = jest.fn();
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name !== 'traktSyncRuns') {
          throw new Error(`Unexpected subcollection ${name}`);
        }

        return {
          doc: jest.fn((id?: string) => ({
            id: id ?? 'run-1',
            path: `users/user-1/traktSyncRuns/${id ?? 'run-1'}`,
          })),
        };
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      collection: jest.fn((name: string) => {
        if (name !== 'users') {
          throw new Error(`Unexpected collection ${name}`);
        }

        return {
          doc: jest.fn(() => userRef),
        };
      }),
      runTransaction: jest.fn(async (callback: any) =>
        callback({
          get: transactionGet,
          set: transactionSet,
        })
      ),
    }));

    const response = createResponse();

    try {
      await (traktApi as any)(
        {
          body: {},
          header: (name: string) => {
            const normalized = name.toLowerCase();
            if (normalized === 'authorization') return 'Bearer token';
            if (normalized === 'x-showseek-dev-sync') return 'true';
            return undefined;
          },
          method: 'POST',
          path: '/sync',
        },
        response
      );
    } finally {
      if (originalFunctionsEmulator === undefined) {
        delete process.env.FUNCTIONS_EMULATOR;
      } else {
        process.env.FUNCTIONS_EMULATOR = originalFunctionsEmulator;
      }
    }

    expect(transactionSet).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(429);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCategory: 'rate_limited',
        nextAllowedSyncAt: futureCooldown.toDate().toISOString(),
      })
    );
  });

  it('sends the shared User-Agent on OAuth token exchange requests', async () => {
    const userSet = jest.fn().mockResolvedValue(undefined);
    const stateRef = {
      id: 'state-1',
      path: 'traktOAuthStates/state-1',
    };
    const userRef = {
      path: 'users/user-1',
      set: userSet,
    };
    const transactionGet = jest.fn().mockImplementation(async (ref) => {
      if (ref === stateRef) {
        return {
          data: () => ({
            expiresAt: MockTimestamp.fromMillis(Date.now() + 60_000),
            used: false,
            userId: 'user-1',
          }),
          exists: true,
        };
      }

      throw new Error(`Unexpected transaction get for ${String(ref?.path ?? ref)}`);
    });
    const transactionSet = jest.fn();

    firestoreFn.mockImplementation(() => ({
      collection: jest.fn((name: string) => {
        if (name === 'traktOAuthStates') {
          return {
            doc: jest.fn(() => stateRef),
          };
        }

        if (name === 'users') {
          return {
            doc: jest.fn(() => userRef),
          };
        }

        throw new Error(`Unexpected collection ${name}`);
      }),
      runTransaction: jest.fn(async (callback: any) =>
        callback({
          get: transactionGet,
          set: transactionSet,
        })
      ),
    }));

    (global.fetch as jest.Mock).mockResolvedValue({
      headers: {
        get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          access_token: 'access-token',
          created_at: Math.floor(Date.now() / 1000),
          expires_in: 7200,
          refresh_token: 'refresh-token',
        })
      ),
    });

    const response = createResponse();

    await (traktCallback as any)(
      {
        method: 'GET',
        query: {
          code: 'code-1',
          state: 'state-1',
        },
      },
      response
    );

    const [, requestInit] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      { headers: Record<string, string> }
    ];

    expect(requestInit.headers).toEqual(
      expect.objectContaining({
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'ShowSeek-TraktFunctions/1.0',
        'trakt-api-key': 'test-secret',
        'trakt-api-version': '2',
      })
    );
    expect(requestInit.headers.Authorization).toBeUndefined();
    expect(response.status).toHaveBeenCalledWith(200);
    expect(userSet).toHaveBeenCalledWith(
      expect.objectContaining({
        traktAccessToken: 'access-token',
        traktConnected: true,
        traktEnrichmentStatus: 'FIELD_DELETE',
        traktIncrementalState: 'FIELD_DELETE',
        traktRefreshToken: 'refresh-token',
        traktSyncStatus: 'FIELD_DELETE',
      }),
      { merge: true }
    );
  });

  it('preserves completed timestamps while omitting empty diagnostics objects', () => {
    const completedAt = MockTimestamp.now();
    const startedAt = MockTimestamp.fromMillis(completedAt.toMillis() - 60_000);

    const sanitized = __test__.sanitizeSyncStatusForWrite({
      attempt: 1,
      completedAt: completedAt as any,
      diagnostics: {
        cfRay: undefined,
        endpoint: undefined,
        retryAfterSeconds: undefined,
        retryReason: undefined,
        snippet: undefined,
        statusCode: undefined,
      },
      itemsSynced: emptyItemsSynced(),
      lastSyncedAt: completedAt as any,
      maxAttempts: 5,
      runId: 'run-1',
      startedAt: startedAt as any,
      status: 'completed',
      updatedAt: completedAt as any,
      userId: 'user-1',
    }) as Record<string, unknown>;

    expect(sanitized.completedAt).toBe(completedAt);
    expect(sanitized.lastSyncedAt).toBe(completedAt);
    expect(sanitized.startedAt).toBe(startedAt);
    expect(sanitized).not.toHaveProperty('diagnostics');
  });

  it('returns an existing active enrichment run instead of creating a duplicate', async () => {
    const transactionGet = jest.fn().mockResolvedValue({
      data: () => ({
        traktEnrichmentStatus: {
          attempt: 2,
          counts: {
            episodes: 0,
            items: 4,
            lists: 1,
          },
          includeEpisodes: true,
          lists: ['watchlist'],
          maxAttempts: 5,
          runId: 'enrich-1',
          status: 'retrying',
        },
      }),
    });
    const transactionSet = jest.fn();
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name === 'lists') {
          return {
            get: jest.fn().mockResolvedValue({ docs: [] }),
          };
        }

        if (name === 'traktEnrichmentRuns') {
          return {
            doc: jest.fn((id?: string) => ({
              id: id ?? 'enrich-1',
              path: `users/user-1/traktEnrichmentRuns/${id ?? 'enrich-1'}`,
            })),
          };
        }

        throw new Error(`Unexpected subcollection ${name}`);
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      collection: jest.fn((name: string) => {
        if (name !== 'users') {
          throw new Error(`Unexpected collection ${name}`);
        }

        return {
          doc: jest.fn(() => userRef),
        };
      }),
      runTransaction: jest.fn(async (callback: any) =>
        callback({
          get: transactionGet,
          set: transactionSet,
        })
      ),
    }));

    const response = createResponse();

    await (traktApi as any)(
      {
        body: { includeEpisodes: true },
        header: (name: string) => (name.toLowerCase() === 'authorization' ? 'Bearer token' : undefined),
        method: 'POST',
        path: '/enrich',
      },
      response
    );

    expect(transactionSet).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(202);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'enrich-1',
        status: 'retrying',
      })
    );
  });

  it('writes a 24-hour cooldown when queueing a new enrichment run', async () => {
    const frozenNow = Date.UTC(2026, 2, 25, 12, 0, 0);
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(frozenNow);
    const transactionGet = jest.fn().mockResolvedValue({
      data: () => ({}),
    });
    const transactionSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name === 'lists') {
          return {
            get: jest.fn().mockResolvedValue({ docs: [] }),
          };
        }

        if (name === 'traktEnrichmentRuns') {
          return {
            doc: jest.fn((id?: string) => ({
              id: id ?? 'enrich-1',
              path: `users/user-1/traktEnrichmentRuns/${id ?? 'enrich-1'}`,
            })),
          };
        }

        throw new Error(`Unexpected subcollection ${name}`);
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      collection: jest.fn((name: string) => {
        if (name !== 'users') {
          throw new Error(`Unexpected collection ${name}`);
        }

        return {
          doc: jest.fn(() => userRef),
        };
      }),
      runTransaction: jest.fn(async (callback: any) =>
        callback({
          get: transactionGet,
          set: transactionSet,
        })
      ),
    }));

    const response = createResponse();

    try {
      await (traktApi as any)(
        {
          body: { includeEpisodes: true },
          header: (name: string) => (name.toLowerCase() === 'authorization' ? 'Bearer token' : undefined),
          method: 'POST',
          path: '/enrich',
        },
        response
      );
    } finally {
      dateNowSpy.mockRestore();
    }

    const userStatusWriteCall = transactionSet.mock.calls.find(
      ([_ref, data]) => data && typeof data === 'object' && 'traktEnrichmentStatus' in data
    ) as [unknown, { traktEnrichmentStatus: Record<string, MockTimestamp> }] | undefined;

    expect(response.status).toHaveBeenCalledWith(202);
    expect(userStatusWriteCall?.[1].traktEnrichmentStatus).toBeDefined();
    expect(userStatusWriteCall?.[1].traktEnrichmentStatus.startedAt.toMillis()).toBe(frozenNow);
    expect(userStatusWriteCall?.[1].traktEnrichmentStatus.nextAllowedEnrichAt.toMillis()).toBe(
      frozenNow + DAY_MS
    );
  });

  it('keeps the manual enrichment cooldown after a completed run until the next allowed time', async () => {
    const futureCooldown = MockTimestamp.fromMillis(Date.now() + DAY_MS);
    const transactionGet = jest.fn().mockResolvedValue({
      data: () => ({
        traktEnrichmentStatus: {
          completedAt: MockTimestamp.fromMillis(Date.now() - 30_000),
          counts: {
            episodes: 0,
            items: 3,
            lists: 1,
          },
          includeEpisodes: true,
          lists: ['watchlist'],
          maxAttempts: 5,
          nextAllowedEnrichAt: futureCooldown,
          runId: 'completed-enrich-run',
          status: 'completed',
        },
      }),
    });
    const transactionSet = jest.fn();
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name === 'lists') {
          return {
            get: jest.fn().mockResolvedValue({ docs: [] }),
          };
        }

        if (name === 'traktEnrichmentRuns') {
          return {
            doc: jest.fn((id?: string) => ({
              id: id ?? 'enrich-1',
              path: `users/user-1/traktEnrichmentRuns/${id ?? 'enrich-1'}`,
            })),
          };
        }

        throw new Error(`Unexpected subcollection ${name}`);
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      collection: jest.fn((name: string) => {
        if (name !== 'users') {
          throw new Error(`Unexpected collection ${name}`);
        }

        return {
          doc: jest.fn(() => userRef),
        };
      }),
      runTransaction: jest.fn(async (callback: any) =>
        callback({
          get: transactionGet,
          set: transactionSet,
        })
      ),
    }));

    const response = createResponse();

    await (traktApi as any)(
      {
        body: { includeEpisodes: true },
        header: (name: string) => (name.toLowerCase() === 'authorization' ? 'Bearer token' : undefined),
        method: 'POST',
        path: '/enrich',
      },
      response
    );

    expect(transactionSet).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(429);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCategory: 'rate_limited',
        nextAllowedEnrichAt: futureCooldown.toDate().toISOString(),
      })
    );
  });

  it('schedules a delayed enrichment retry when TMDB returns Retry-After', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const listRef = {
      get: jest.fn().mockResolvedValue({
        data: () => ({
          items: {
            '1': {
              id: 1,
              media_type: 'movie',
              title: 'Movie',
            },
          },
          metadata: {
            needsEnrichment: true,
          },
        }),
        exists: true,
      }),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name === 'traktEnrichmentRuns') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/traktEnrichmentRuns/${id}`,
            })),
          };
        }

        if (name === 'lists') {
          return {
            doc: jest.fn(() => listRef),
          };
        }

        if (name === 'episode_tracking') {
          return {
            get: jest.fn().mockResolvedValue({ docs: [] }),
          };
        }

        throw new Error(`Unexpected subcollection ${name}`);
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktEnrichmentStatus: {
            runId: 'run-1',
          },
        }),
        exists: true,
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      batch: jest.fn(() => ({
        commit: batchCommit,
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
    }));

    (global.fetch as jest.Mock).mockResolvedValue({
      headers: {
        get: (name: string) => (name.toLowerCase() === 'retry-after' ? '60' : null),
      },
      ok: false,
      status: 429,
    });

    await expect(
      (runTraktEnrichment as any)({
        data: { includeEpisodes: false, lists: ['watchlist'], runId: 'run-1', userId: 'user-1' },
        retryCount: 0,
        retryReason: 'rate-limited',
      })
    ).resolves.toBeUndefined();

    expect(batchCommit).toHaveBeenCalledTimes(2);
    expect(listRef.set).not.toHaveBeenCalled();
    expect(mockEnqueue).toHaveBeenCalledWith(
      {
        includeEpisodes: false,
        lists: ['watchlist'],
        runId: 'run-1',
        userId: 'user-1',
      },
      expect.objectContaining({
        dispatchDeadlineSeconds: 1800,
        scheduleDelaySeconds: 60,
      })
    );
    expect(mockEnqueue.mock.calls[0][1]).not.toHaveProperty('id');

    const retryingWrite = batchSet.mock.calls
      .map(([_ref, data]) => ('traktEnrichmentStatus' in data ? data.traktEnrichmentStatus : data))
      .find((data) => data?.status === 'retrying') as Record<string, unknown> | undefined;

    expect(retryingWrite).toMatchObject({
      errorCategory: 'rate_limited',
      status: 'retrying',
    });
    expect(retryingWrite?.nextRetryAt).toBeDefined();
  });

  it('treats missing TMDB items as skips and still completes enrichment', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const listSet = jest.fn().mockResolvedValue(undefined);
    const listRef = {
      get: jest.fn().mockResolvedValue({
        data: () => ({
          items: {
            '1': {
              id: 1,
              media_type: 'movie',
              title: 'Movie',
            },
          },
          metadata: {
            needsEnrichment: true,
          },
        }),
        exists: true,
      }),
      set: listSet,
    };
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name === 'traktEnrichmentRuns') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/traktEnrichmentRuns/${id}`,
            })),
          };
        }

        if (name === 'lists') {
          return {
            doc: jest.fn(() => listRef),
          };
        }

        if (name === 'episode_tracking') {
          return {
            get: jest.fn().mockResolvedValue({ docs: [] }),
          };
        }

        throw new Error(`Unexpected subcollection ${name}`);
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktEnrichmentStatus: {
            runId: 'run-1',
          },
        }),
        exists: true,
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      batch: jest.fn(() => ({
        commit: batchCommit,
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
    }));

    (global.fetch as jest.Mock).mockResolvedValue({
      headers: {
        get: () => null,
      },
      ok: false,
      status: 404,
    });

    await expect(
      (runTraktEnrichment as any)({
        data: { includeEpisodes: false, lists: ['watchlist'], runId: 'run-1', userId: 'user-1' },
        retryCount: 0,
        retryReason: undefined,
      })
    ).resolves.toBeUndefined();

    expect(listSet).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          needsEnrichment: false,
        }),
      }),
      { merge: true }
    );
    expect(batchCommit).toHaveBeenCalledTimes(2);
  });

  it('does not read episode tracking when includeEpisodes is false', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const listSet = jest.fn().mockResolvedValue(undefined);
    const episodeTrackingGet = jest.fn().mockResolvedValue({ docs: [] });
    const listRef = {
      get: jest.fn().mockResolvedValue({
        data: () => ({
          items: {},
          metadata: {
            needsEnrichment: true,
          },
        }),
        exists: true,
      }),
      set: listSet,
    };
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name === 'traktEnrichmentRuns') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/traktEnrichmentRuns/${id}`,
            })),
          };
        }

        if (name === 'lists') {
          return {
            doc: jest.fn(() => listRef),
          };
        }

        if (name === 'episode_tracking') {
          return {
            get: episodeTrackingGet,
          };
        }

        throw new Error(`Unexpected subcollection ${name}`);
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktEnrichmentStatus: {
            runId: 'run-1',
          },
        }),
        exists: true,
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      batch: jest.fn(() => ({
        commit: batchCommit,
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
    }));

    await expect(
      (runTraktEnrichment as any)({
        data: { includeEpisodes: false, lists: ['watchlist'], runId: 'run-1', userId: 'user-1' },
        retryCount: 0,
        retryReason: undefined,
      })
    ).resolves.toBeUndefined();

    expect(episodeTrackingGet).not.toHaveBeenCalled();
    expect(listSet).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          needsEnrichment: false,
        }),
      }),
      { merge: true }
    );
    expect(batchCommit).toHaveBeenCalledTimes(2);
  });

  it('writes Firestore timestamps for synced custom lists', async () => {
    const listSet = jest.fn().mockResolvedValue(undefined);
    const usersCollection = {
      doc: jest.fn(() => ({
        collection: jest.fn((name: string) => {
          if (name !== 'lists') {
            throw new Error(`Unexpected subcollection ${name}`);
          }

          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue({
                data: () => undefined,
                exists: false,
              }),
              set: listSet,
            })),
          };
        }),
      })),
    };

    firestoreFn.mockImplementation(() => ({
      collection: jest.fn((name: string) => {
        if (name !== 'users') {
          throw new Error(`Unexpected collection ${name}`);
        }

        return usersCollection;
      }),
    }));

    (global.fetch as jest.Mock).mockResolvedValue({
      headers: {
        get: () => null,
      },
      json: jest.fn().mockResolvedValue([
        {
          id: 1,
          listed_at: '2024-01-03T00:00:00.000Z',
          movie: {
            ids: {
              slug: 'movie-slug',
              tmdb: 101,
              trakt: 202,
            },
            title: 'Example Movie',
            year: 2024,
          },
          rank: 1,
          type: 'movie',
        },
      ]),
      ok: true,
      status: 200,
      text: jest.fn(),
    });

    await (__test__ as any).syncCustomLists('user-1', 'access-token', 'showseek-user', [
      {
        created_at: '2024-01-01T00:00:00.000Z',
        description: 'Custom list',
        ids: {
          slug: 'favorites',
          trakt: 55,
        },
        name: 'Favorites',
        privacy: 'public',
        updated_at: '2024-01-02T00:00:00.000Z',
      },
    ]);

    const payload = listSet.mock.calls[0][0];
    expect(payload.createdAt.toMillis()).toBe(new Date('2024-01-01T00:00:00.000Z').getTime());
    expect(payload.updatedAt.toMillis()).toBe(new Date('2024-01-02T00:00:00.000Z').getTime());
    expect(payload.metadata.lastUpdated).toBeInstanceOf(MockTimestamp);
  });

  it('warns when episode watchedAt strings are invalid before falling back to now', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    (global.fetch as jest.Mock).mockResolvedValue({
      headers: {
        get: () => null,
      },
      json: jest.fn().mockResolvedValue({
        episodes: [
          {
            air_date: '2020-01-01',
            episode_number: 1,
            id: 77,
            name: 'Pilot',
          },
        ],
      }),
      ok: true,
      status: 200,
    });

    const enrichedEpisodes = await (__test__ as any).enrichEpisodeTracking(99, {
      '1_1': {
        watchedAt: 'not-a-date',
      },
    });

    expect(warnSpy).toHaveBeenCalledWith(
      '[TraktEnrichment] Invalid watchedAt string, defaulting to now.',
      expect.objectContaining({
        episodeKey: '1_1',
        showId: 99,
        watchedAt: 'not-a-date',
      })
    );
    expect(enrichedEpisodes['1_1'].watchedAt.toMillis()).toBe(1_700_000_000_000);

    warnSpy.mockRestore();
    nowSpy.mockRestore();
  });

  it('marks upstream blocked sync errors as retrying and rethrows for Cloud Tasks retries', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name !== 'traktSyncRuns') {
          throw new Error(`Unexpected subcollection ${name}`);
        }

        return {
          doc: jest.fn((id: string) => ({
            id,
            path: `users/user-1/traktSyncRuns/${id}`,
          })),
        };
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktAccessToken: 'token',
          traktConnected: true,
          traktSyncStatus: {
            runId: 'run-1',
          },
          traktTokenExpiresAt: MockTimestamp.fromMillis(Date.now() + 2 * 60 * 60 * 1000),
        }),
        exists: true,
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      batch: jest.fn(() => ({
        commit: batchCommit,
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
    }));

    (global.fetch as jest.Mock).mockResolvedValue({
      headers: {
        get: (name: string) => {
          const header = name.toLowerCase();
          if (header === 'cf-ray') return 'ray-1';
          if (header === 'content-type') return 'text/html';
          return null;
        },
      },
      ok: false,
      status: 403,
      text: jest.fn().mockResolvedValue('<html>cloudflare blocked cf-ray</html>'),
    });

    await expect(
      (runTraktSync as any)({
        data: { runId: 'run-1', userId: 'user-1' },
        retryCount: 0,
        retryReason: 'upstream-blocked',
      })
    ).rejects.toMatchObject({
      category: 'upstream_blocked',
      retryable: true,
    });

    expect(batchCommit).toHaveBeenCalledTimes(2);

    const retryingWrite = batchSet.mock.calls
      .map(([_ref, data]) => ('traktSyncStatus' in data ? data.traktSyncStatus : data))
      .find((data) => data?.status === 'retrying') as Record<string, unknown> | undefined;

    expect(retryingWrite).toMatchObject({
      errorCategory: 'upstream_blocked',
      status: 'retrying',
    });
    expect(retryingWrite?.nextAllowedSyncAt).toBeUndefined();
  });

  it('schedules a delayed sync retry when Trakt returns Retry-After', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name !== 'traktSyncRuns') {
          throw new Error(`Unexpected subcollection ${name}`);
        }

        return {
          doc: jest.fn((id: string) => ({
            id,
            path: `users/user-1/traktSyncRuns/${id}`,
          })),
        };
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktAccessToken: 'token',
          traktConnected: true,
          traktSyncStatus: {
            runId: 'run-1',
          },
          traktTokenExpiresAt: MockTimestamp.fromMillis(Date.now() + 2 * 60 * 60 * 1000),
        }),
        exists: true,
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      batch: jest.fn(() => ({
        commit: batchCommit,
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
    }));

    (global.fetch as jest.Mock).mockResolvedValue({
      headers: {
        get: (name: string) => (name.toLowerCase() === 'retry-after' ? '60' : null),
      },
      ok: false,
      status: 429,
      text: jest.fn().mockResolvedValue('rate limited'),
    });

    await expect(
      (runTraktSync as any)({
        data: { runId: 'run-1', userId: 'user-1' },
        retryCount: 0,
        retryReason: 'rate-limited',
      })
    ).resolves.toBeUndefined();

    expect(batchCommit).toHaveBeenCalledTimes(2);
    expect(mockEnqueue).toHaveBeenCalledWith(
      { runId: 'run-1', userId: 'user-1' },
      expect.objectContaining({
        dispatchDeadlineSeconds: 1800,
        scheduleDelaySeconds: 60,
      })
    );
    expect(mockEnqueue.mock.calls[0][1]).not.toHaveProperty('id');

    const retryingWrite = batchSet.mock.calls
      .map(([_ref, data]) => ('traktSyncStatus' in data ? data.traktSyncStatus : data))
      .find((data) => data?.status === 'retrying') as Record<string, unknown> | undefined;

    expect(retryingWrite).toMatchObject({
      errorCategory: 'rate_limited',
      status: 'retrying',
    });
    expect(retryingWrite?.nextAllowedSyncAt).toBeUndefined();
    expect(retryingWrite?.nextRetryAt).toBeDefined();
  });

  it('marks sync failures caused by Firestore index-entry limits as storage_limit without retrying', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const indexLimitError = new Error(
      '3 INVALID_ARGUMENT: too many index entries for entity /users/user-1/lists/already-watched'
    );
    const listSet = jest.fn((data: Record<string, unknown>) => {
      if (data.id === 'already-watched') {
        return Promise.reject(indexLimitError);
      }

      return Promise.resolve(undefined);
    });
    const listsCollection = {
      doc: jest.fn((id: string) => ({
        id,
        path: `users/user-1/lists/${id}`,
        get: jest.fn().mockResolvedValue({
          data: () => undefined,
          exists: false,
        }),
        set: listSet,
      })),
      get: jest.fn().mockResolvedValue({ docs: [] }),
    };
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name === 'traktSyncRuns') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/traktSyncRuns/${id}`,
            })),
          };
        }

        if (name === 'lists') {
          return listsCollection;
        }

        if (name === 'episode_tracking') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/episode_tracking/${id}`,
            })),
            get: jest.fn().mockResolvedValue({ docs: [] }),
          };
        }

        if (name === 'ratings') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/ratings/${id}`,
            })),
            get: jest.fn().mockResolvedValue({ docs: [] }),
          };
        }

        throw new Error(`Unexpected subcollection ${name}`);
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktAccessToken: 'token',
          traktConnected: true,
          traktSyncStatus: {
            runId: 'run-1',
          },
          traktTokenExpiresAt: MockTimestamp.fromMillis(Date.now() + 2 * 60 * 60 * 1000),
        }),
        exists: true,
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      batch: jest.fn(() => ({
        commit: batchCommit,
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
    }));

    (global.fetch as jest.Mock).mockImplementation((input: any) => {
      const url = String(input);

      if (url.endsWith('/users/settings')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue({
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
          }),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/sync/last_activities')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue({}),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/sync/watched/movies')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              last_updated_at: '2024-01-01T00:00:00.000Z',
              last_watched_at: '2024-01-01T00:00:00.000Z',
              movie: {
                ids: {
                  slug: 'movie-1',
                  tmdb: 101,
                  trakt: 201,
                },
                title: 'Movie One',
                year: 2024,
              },
              plays: 1,
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/sync/watched/shows?extended=full')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([]),
          ok: true,
          status: 200,
        });
      }

      throw new Error(`Unexpected fetch URL ${url}`);
    });

    await expect(
      (runTraktSync as any)({
        data: { runId: 'run-1', userId: 'user-1' },
        retryCount: 0,
        retryReason: 'index-limit',
      })
    ).resolves.toBeUndefined();

    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(batchCommit).toHaveBeenCalledTimes(2);

    const failedWrite = batchSet.mock.calls
      .map(([_ref, data]) => ('traktSyncStatus' in data ? data.traktSyncStatus : data))
      .find((data) => data?.status === 'failed') as Record<string, unknown> | undefined;

    expect(failedWrite).toMatchObject({
      errorCategory: 'storage_limit',
      errorMessage: 'Your Trakt history is too large to import right now. Please try again later.',
      status: 'failed',
    });
    expect((failedWrite?.diagnostics as Record<string, unknown> | undefined)?.snippet).toBe(
      indexLimitError.message
    );
    expect(failedWrite?.nextRetryAt).toBeUndefined();
    expect(failedWrite?.nextAllowedSyncAt).toBeUndefined();
  });

  it('omits undefined release_date from already-watched items when Trakt movies are missing year', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const listSet = jest.fn((_data: Record<string, unknown>) => Promise.resolve(undefined));
    const listsCollection = {
      doc: jest.fn((id: string) => ({
        id,
        path: `users/user-1/lists/${id}`,
        get: jest.fn().mockResolvedValue({
          data: () => undefined,
          exists: false,
        }),
        set: listSet,
      })),
      get: jest.fn().mockResolvedValue({ docs: [] }),
    };
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name === 'traktSyncRuns') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/traktSyncRuns/${id}`,
            })),
          };
        }

        if (name === 'traktEnrichmentRuns') {
          return {
            doc: jest.fn((id = 'enrich-1') => ({
              id,
              path: `users/user-1/traktEnrichmentRuns/${id}`,
            })),
          };
        }

        if (name === 'lists') {
          return listsCollection;
        }

        if (name === 'episode_tracking') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/episode_tracking/${id}`,
            })),
            get: jest.fn().mockResolvedValue({ docs: [] }),
          };
        }

        if (name === 'ratings') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/ratings/${id}`,
            })),
            get: jest.fn().mockResolvedValue({ docs: [] }),
          };
        }

        throw new Error(`Unexpected subcollection ${name}`);
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktAccessToken: 'token',
          traktConnected: true,
          traktSyncStatus: {
            runId: 'run-1',
          },
          traktTokenExpiresAt: MockTimestamp.fromMillis(Date.now() + 2 * 60 * 60 * 1000),
        }),
        exists: true,
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      batch: jest.fn(() => ({
        commit: batchCommit,
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
      runTransaction: jest.fn().mockResolvedValue({
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
      }),
    }));

    (global.fetch as jest.Mock).mockImplementation((input: any) => {
      const url = String(input);

      if (url.endsWith('/users/settings')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue({
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
          }),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/sync/last_activities')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue({}),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/sync/watched/movies')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              last_updated_at: '2024-01-01T00:00:00.000Z',
              last_watched_at: '2024-01-01T00:00:00.000Z',
              movie: {
                ids: {
                  slug: 'movie-1',
                  tmdb: 576788,
                  trakt: 201,
                },
                title: 'Movie Without Year',
                year: 0,
              },
              plays: 1,
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      if (
        url.endsWith('/sync/last_activities') ||
        url.endsWith('/sync/watched/shows?extended=full') ||
        url.endsWith('/sync/ratings') ||
        url.endsWith('/sync/watchlist') ||
        url.endsWith('/sync/favorites') ||
        url.endsWith('/users/tester/lists')
      ) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([]),
          ok: true,
          status: 200,
        });
      }

      throw new Error(`Unexpected fetch URL ${url}`);
    });

    await expect(
      (runTraktSync as any)({
        data: { runId: 'run-1', userId: 'user-1' },
        retryCount: 0,
        retryReason: undefined,
      })
    ).resolves.toBeUndefined();

    const alreadyWatchedWrite = listSet.mock.calls.find(
      ([data]) => data && typeof data === 'object' && data.id === 'already-watched'
    )?.[0] as Record<string, unknown> | undefined;

    expect(alreadyWatchedWrite).toBeDefined();
    const movieEntry = (alreadyWatchedWrite?.items as Record<string, Record<string, unknown>>)?.[
      'movie-576788'
    ];
    expect(movieEntry).toEqual(
      expect.objectContaining({
        id: 576788,
        media_type: 'movie',
        title: 'Movie Without Year',
      })
    );
    expect(movieEntry).not.toHaveProperty('release_date');
  });

  it('omits undefined traktId from custom list items before writing Firestore docs', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const listSet = jest.fn((_data: Record<string, unknown>) => Promise.resolve(undefined));
    const listsCollection = {
      doc: jest.fn((id: string) => ({
        id,
        path: `users/user-1/lists/${id}`,
        get: jest.fn().mockResolvedValue({
          data: () => undefined,
          exists: false,
        }),
        set: listSet,
      })),
      get: jest.fn().mockResolvedValue({ docs: [] }),
    };
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name === 'traktSyncRuns') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/traktSyncRuns/${id}`,
            })),
          };
        }

        if (name === 'traktEnrichmentRuns') {
          return {
            doc: jest.fn((id = 'enrich-1') => ({
              id,
              path: `users/user-1/traktEnrichmentRuns/${id}`,
            })),
          };
        }

        if (name === 'lists') {
          return listsCollection;
        }

        if (name === 'episode_tracking') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/episode_tracking/${id}`,
            })),
            get: jest.fn().mockResolvedValue({ docs: [] }),
          };
        }

        if (name === 'ratings') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/ratings/${id}`,
            })),
            get: jest.fn().mockResolvedValue({ docs: [] }),
          };
        }

        throw new Error(`Unexpected subcollection ${name}`);
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktAccessToken: 'token',
          traktConnected: true,
          traktSyncStatus: {
            runId: 'run-1',
          },
          traktTokenExpiresAt: MockTimestamp.fromMillis(Date.now() + 2 * 60 * 60 * 1000),
        }),
        exists: true,
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      batch: jest.fn(() => ({
        commit: batchCommit,
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
      runTransaction: jest.fn().mockResolvedValue({
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
      }),
    }));

    (global.fetch as jest.Mock).mockImplementation((input: any) => {
      const url = String(input);

      if (url.endsWith('/users/settings')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue({
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
          }),
          ok: true,
          status: 200,
        });
      }

      if (
        url.endsWith('/sync/last_activities') ||
        url.endsWith('/sync/watched/movies') ||
        url.endsWith('/sync/watched/shows?extended=full') ||
        url.endsWith('/sync/ratings') ||
        url.endsWith('/sync/watchlist') ||
        url.endsWith('/sync/favorites')
      ) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([]),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/users/tester/lists')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              created_at: '2024-01-01T00:00:00.000Z',
              description: '',
              ids: {
                slug: 'custom-list',
                trakt: 701,
              },
              name: 'Custom List',
              privacy: 'private',
              updated_at: '2024-01-02T00:00:00.000Z',
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      if (url.endsWith('/users/tester/lists/custom-list/items')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              id: 9001,
              listed_at: '2024-01-03T00:00:00.000Z',
              movie: {
                ids: {
                  slug: 'movie-no-trakt-id',
                  tmdb: 333,
                },
                title: 'Movie Without Trakt Id',
                year: 2024,
              },
              rank: 1,
              type: 'movie',
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      throw new Error(`Unexpected fetch URL ${url}`);
    });

    await expect(
      (runTraktSync as any)({
        data: { runId: 'run-1', userId: 'user-1' },
        retryCount: 0,
        retryReason: undefined,
      })
    ).resolves.toBeUndefined();

    const customListWrite = listSet.mock.calls.find(
      ([data]) => data && typeof data === 'object' && data.name === 'Custom List'
    )?.[0] as Record<string, unknown> | undefined;

    expect(customListWrite).toBeDefined();
    const customItem = (customListWrite?.items as Record<string, Record<string, unknown>>)?.[
      'movie-333'
    ];
    expect(customItem).toEqual(
      expect.objectContaining({
        id: 333,
        media_type: 'movie',
        title: 'Movie Without Trakt Id',
      })
    );
    expect(customItem).not.toHaveProperty('traktId');
  });

  it('reflects allowed origins for CORS preflight requests', async () => {
    process.env.TRAKT_ALLOWED_ORIGINS = 'https://allowed.example, https://other.example';
    const response = createResponse();

    await (traktApi as any)(
      {
        header: (name: string) => (name.toLowerCase() === 'origin' ? 'https://allowed.example' : undefined),
        method: 'OPTIONS',
        path: '/sync',
      },
      response
    );

    expect(response.setHeader).toHaveBeenCalledWith(
      'Access-Control-Allow-Origin',
      'https://allowed.example'
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Access-Control-Allow-Headers',
      expect.stringContaining('x-showseek-dev-sync')
    );
    expect(response.setHeader).toHaveBeenCalledWith('Vary', 'Origin');
    expect(response.status).toHaveBeenCalledWith(204);
  });

  it('omits Access-Control-Allow-Origin for disallowed origins on normal responses', async () => {
    process.env.TRAKT_ALLOWED_ORIGINS = 'https://allowed.example';
    const response = createResponse();

    await (traktApi as any)(
      {
        header: (name: string) => (name.toLowerCase() === 'origin' ? 'https://blocked.example' : undefined),
        method: 'GET',
        path: '/missing',
      },
      response
    );

    expect(response.setHeader).not.toHaveBeenCalledWith(
      'Access-Control-Allow-Origin',
      expect.anything()
    );
    expect(response.setHeader).toHaveBeenCalledWith('Vary', 'Origin');
    expect(response.status).toHaveBeenCalledWith(404);
  });
});
