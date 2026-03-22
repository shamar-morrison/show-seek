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
