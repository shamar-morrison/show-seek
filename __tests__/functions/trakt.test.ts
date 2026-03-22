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

import { __test__, runTraktSync, traktApi } from '@/functions/src/trakt';
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

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyIdToken.mockResolvedValue({ uid: 'user-1' });
  mockEnqueue.mockResolvedValue(undefined);
  global.fetch = jest.fn() as any;
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

  it('retries enrichment when TMDB rate limits the worker', async () => {
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
    ).rejects.toMatchObject({
      category: 'rate_limited',
    });

    expect(batchCommit).toHaveBeenCalledTimes(2);
    expect(listRef.set).not.toHaveBeenCalled();
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
});
