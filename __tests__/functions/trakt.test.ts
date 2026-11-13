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
    onCall: jest.fn((_options, handler) => handler),
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

import {
  __test__,
  clearTraktTokensIfRefreshTokenUnchanged,
  createOAuthState,
  enrichMediaItem,
  enrichMediaItems,
  exchangeAuthorizationCode,
  getSyncSteps,
  isRunFatalSyncError,
  needsMediaEnrichment,
  planEnrichmentRelocation,
  normalizeSyncError,
  reconcileRatings,
  refreshAccessToken,
  requestOAuthToken,
  runTraktSync,
  TRAKT_INVALID_GRANT_MESSAGE,
  TRAKT_LISTS_SCHEMA_VERSION,
  TRAKT_OAUTH_STATE_TTL_MS,
  TraktOAuthError,
  TraktSyncError,
  traktApi,
  traktCallback,
} from '@/functions/src/trakt';
import { runTraktEnrichment } from '@/functions/src/trakt';

// These tests cover the released behavior: episode list entries for everyone. The rollout
// switch itself is tested at the end of the file.
process.env.EPISODE_LIST_ENTRIES_UIDS = '*';

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
  delete process.env.TRAKT_SYNC_BYPASS_UIDS;
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

  it('rejects sync when a Trakt zip import is active', async () => {
    const recentTime = MockTimestamp.fromMillis(Date.now() - 30_000);
    const transactionGet = jest.fn().mockResolvedValue({
      data: () => ({
        traktAccessToken: 'token',
        traktConnected: true,
        traktZipImportStatus: {
          createdAt: recentTime,
          id: 'zip_1',
          status: 'pending',
          updatedAt: recentTime,
        },
      }),
    });
    const transactionSet = jest.fn();

    firestoreFn.mockImplementation(() => ({
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          collection: jest.fn(() => ({
            doc: jest.fn(() => ({ id: 'run-1', path: 'users/user-1/traktSyncRuns/run-1' })),
          })),
          path: 'users/user-1',
        })),
      })),
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
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'A Trakt zip import is currently in progress.',
        errorCategory: 'storage_limit',
      })
    );
  });

  it('allows sync when previous Trakt zip import is stale (> 5 minutes for pending)', async () => {
    const staleTime = MockTimestamp.fromMillis(Date.now() - 6 * 60 * 1000);
    const transactionGet = jest.fn().mockResolvedValue({
      data: () => ({
        traktAccessToken: 'token',
        traktConnected: true,
        traktZipImportStatus: {
          createdAt: staleTime,
          id: 'zip_stale',
          status: 'pending',
          updatedAt: staleTime,
        },
      }),
    });
    const transactionSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const runRef = {
      id: 'run-1',
      path: 'users/user-1/traktSyncRuns/run-1',
    };
    const userRef = {
      collection: jest.fn(() => ({
        doc: jest.fn(() => runRef),
      })),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      collection: jest.fn(() => ({
        doc: jest.fn(() => userRef),
      })),
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

  it('bypasses the manual sync cooldown on deployed functions for allowlisted testers when the dev header is present', async () => {
    process.env.TRAKT_SYNC_BYPASS_UIDS = 'tester-1, tester-2';
    mockVerifyIdToken.mockResolvedValue({ uid: 'tester-1' });

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
            path: `users/tester-1/traktSyncRuns/${id ?? 'run-1'}`,
          })),
        };
      }),
      path: 'users/tester-1',
    };
    const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);

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
      expect(transactionSet).toHaveBeenCalledTimes(2);
      expect(mockEnqueue).toHaveBeenCalledWith(
        { runId: 'run-1', userId: 'tester-1' },
        expect.objectContaining({ id: 'run-1' })
      );
      expect(response.status).toHaveBeenCalledWith(202);
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        '[Trakt] Bypassed manual sync cooldown for allowlisted tester',
        expect.objectContaining({
          runId: 'run-1',
          userId: 'tester-1',
        })
      );
    } finally {
      consoleInfoSpy.mockRestore();
    }
  });

  it('keeps the manual cooldown on deployed functions when the dev header is present for a non-allowlisted tester', async () => {
    process.env.TRAKT_SYNC_BYPASS_UIDS = 'someone-else';
    mockVerifyIdToken.mockResolvedValue({ uid: 'tester-1' });

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
            path: `users/tester-1/traktSyncRuns/${id ?? 'run-1'}`,
          })),
        };
      }),
      path: 'users/tester-1',
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

  it('keeps the manual cooldown on deployed functions for allowlisted testers when the dev header is absent', async () => {
    process.env.TRAKT_SYNC_BYPASS_UIDS = 'tester-1';
    mockVerifyIdToken.mockResolvedValue({ uid: 'tester-1' });

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
            path: `users/tester-1/traktSyncRuns/${id ?? 'run-1'}`,
          })),
        };
      }),
      path: 'users/tester-1',
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

      if (url.includes('/users/settings')) {
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

      if (url.includes('/sync/last_activities')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue({}),
          ok: true,
          status: 200,
        });
      }

      if (url.includes('/sync/watched/movies')) {
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

      if (url.includes('/sync/watchlist')) {
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

      if (url.includes('/sync/favorites')) {
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
        url.includes('/sync/watched/shows') ||
        url.includes('/sync/ratings') ||
        url.includes('/users/tester/lists')
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

      if (url.includes('/sync/last_activities')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue({}),
          ok: true,
          status: 200,
        });
      }

      if (url.includes('/sync/watched/movies')) {
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

      if (url.includes('/sync/watched/shows')) {
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

      if (url.includes('/sync/ratings')) {
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

      if (url.includes('/sync/watchlist')) {
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

      if (url.includes('/sync/favorites')) {
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

      if (url.includes('/users/settings')) {
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

      if (url.includes('/users/tester/lists') && !url.includes('/items')) {
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

      if (url.includes('/users/tester/lists/custom-list/items')) {
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

  it('does not treat equal addedAt millis with different raw shapes as remote changes', async () => {
    const listSet = jest.fn().mockResolvedValue(undefined);
    const addedAtMs = new Date('2024-01-03T00:00:00.000Z').getTime();

    const result = await (__test__ as any).reconcileManagedList(
      'user-1',
      'watchlist',
      {
        'movie-101': {
          addedAt: MockTimestamp.fromMillis(addedAtMs),
          id: 101,
          media_type: 'movie',
          release_date: '2024-01-01',
          title: 'Movie One',
        },
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
            'movie-101': {
              addedAt: new Date(addedAtMs).toISOString(),
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
      didWrite: false,
      shouldEnrich: false,
    });
    expect(listSet).not.toHaveBeenCalled();
  });

  it('applies equal addedAt millis updates when non-recency managed fields change', async () => {
    const listSet = jest.fn().mockResolvedValue(undefined);
    const addedAtMs = new Date('2024-01-03T00:00:00.000Z').getTime();

    const result = await (__test__ as any).reconcileManagedList(
      'user-1',
      'watchlist',
      {
        'movie-101': {
          addedAt: MockTimestamp.fromMillis(addedAtMs),
          id: 101,
          media_type: 'movie',
          release_date: '2024-01-01',
          title: 'Movie One Updated',
        },
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
            'movie-101': {
              addedAt: new Date(addedAtMs).toISOString(),
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
            title: 'Movie One Updated',
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
            listsSchemaVersion: TRAKT_LISTS_SCHEMA_VERSION,
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

      if (url.includes('/sync/last_activities')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue(lastActivitiesAfter),
          ok: true,
          status: 200,
        });
      }

      if (url.includes('/sync/watched/movies')) {
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

      if (url.includes('/sync/watched/shows')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([]),
          ok: true,
          status: 200,
        });
      }

      if (url.includes('/sync/watchlist')) {
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

      if (url.includes('/sync/favorites')) {
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
            listsSchemaVersion: TRAKT_LISTS_SCHEMA_VERSION,
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

      if (url.includes('/sync/last_activities')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue(lastActivitiesAfter),
          ok: true,
          status: 200,
        });
      }

      if (url.includes('/users/settings')) {
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

      if (url.includes('/users/tester/lists') && !url.includes('/items')) {
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

      if (url.includes('/users/tester/lists/custom-list/items')) {
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
            listsSchemaVersion: TRAKT_LISTS_SCHEMA_VERSION,
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

      if (url.includes('/sync/last_activities')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue(lastActivitiesAfter),
          ok: true,
          status: 200,
        });
      }

      if (url.includes('/users/settings')) {
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

      if (url.includes('/users/tester/lists') && !url.includes('/items')) {
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

      if (url.includes('/users/tester/lists/custom-list/items')) {
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
            listsSchemaVersion: TRAKT_LISTS_SCHEMA_VERSION,
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

      if (url.includes('/sync/last_activities')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue(lastActivitiesAfter),
          ok: true,
          status: 200,
        });
      }

      if (url.includes('/sync/ratings')) {
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
            listsSchemaVersion: TRAKT_LISTS_SCHEMA_VERSION,
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

      if (url.includes('/sync/last_activities')) {
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
    const savedState = batchSet.mock.calls
      .map(([_ref, data]) => data)
      .find((data) => data?.traktIncrementalState)?.traktIncrementalState;
    expect(savedState).toMatchObject({ listsSchemaVersion: TRAKT_LISTS_SCHEMA_VERSION, schemaVersion: 1 });
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
            listsSchemaVersion: TRAKT_LISTS_SCHEMA_VERSION,
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

      if (url.includes('/sync/last_activities')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue(lastActivitiesAfter),
          ok: true,
          status: 200,
        });
      }

      if (url.includes('/sync/watchlist')) {
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

      if (url.includes('/users/settings')) {
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

      if (url.includes('/sync/last_activities')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue({}),
          ok: true,
          status: 200,
        });
      }

      if (url.includes('/sync/watched/movies')) {
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

      if (url.includes('/sync/watchlist')) {
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

      if (url.includes('/sync/favorites')) {
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
        url.includes('/sync/watched/shows') ||
        url.includes('/sync/ratings') ||
        url.includes('/users/tester/lists')
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

      if (url.includes('/users/settings')) {
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

      if (url.includes('/sync/last_activities')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue({}),
          ok: true,
          status: 200,
        });
      }

      if (url.includes('/sync/watched/movies')) {
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

      if (url.includes('/sync/watchlist')) {
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

      if (url.includes('/sync/favorites')) {
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
        url.includes('/sync/watched/shows') ||
        url.includes('/sync/ratings') ||
        url.includes('/users/tester/lists')
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

  it('keeps upstream rate-limit cooldowns enforced on deployed functions for allowlisted testers', async () => {
    process.env.TRAKT_SYNC_BYPASS_UIDS = 'tester-1';
    mockVerifyIdToken.mockResolvedValue({ uid: 'tester-1' });

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
            path: `users/tester-1/traktSyncRuns/${id ?? 'run-1'}`,
          })),
        };
      }),
      path: 'users/tester-1',
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
        traktReauthRequired: 'FIELD_DELETE',
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

    expect(transactionSet).toHaveBeenCalledWith(
      userRef,
      expect.objectContaining({
        traktEnrichmentStatus: expect.objectContaining({
          pendingLists: expect.arrayContaining(['already-watched', 'watchlist', 'favorites']),
        }),
      }),
      { merge: true }
    );
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
            get: jest.fn().mockResolvedValue({ docs: [] }),
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

    await (__test__ as any).reconcileCustomLists(
      'user-1',
      'access-token',
      'showseek-user',
      [
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
      ],
      {},
      true
    );

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

      if (url.includes('/sync/last_activities')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue({}),
          ok: true,
          status: 200,
        });
      }

      if (url.includes('/sync/watched/movies')) {
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

      if (url.includes('/sync/watched/shows')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([]),
          ok: true,
          status: 200,
        });
      }

      // Later sync steps still run after the failed list write; give them empty Trakt data.
      return Promise.resolve({
        json: jest.fn().mockResolvedValue([]),
        ok: true,
        status: 200,
      });
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

  it('keeps syncing the other steps when one list write fails, then fails the run as storage_limit', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const sizeLimitError = new Error(
      "3 INVALID_ARGUMENT: Document 'projects/p/databases/(default)/documents/users/user-1/lists/already-watched' cannot be written because its size (1,100,000 bytes) exceeds the maximum allowed size of 1,048,576 bytes."
    );
    const writtenListIds: string[] = [];
    const listSet = jest.fn((data: Record<string, unknown>) => {
      if (data.id === 'already-watched') {
        return Promise.reject(sizeLimitError);
      }
      writtenListIds.push(String(data.id));
      return Promise.resolve(undefined);
    });
    const emptyCollection = (name: string) => ({
      doc: jest.fn((id: string) => ({
        id,
        path: `users/user-1/${name}/${id}`,
        get: jest.fn().mockResolvedValue({ data: () => undefined, exists: false }),
        set: listSet,
      })),
      get: jest.fn().mockResolvedValue({ docs: [] }),
    });
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name === 'traktSyncRuns') {
          return { doc: jest.fn((id: string) => ({ id, path: `users/user-1/traktSyncRuns/${id}` })) };
        }
        if (['lists', 'episode_tracking', 'ratings'].includes(name)) {
          return emptyCollection(name);
        }
        throw new Error(`Unexpected subcollection ${name}`);
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktAccessToken: 'token',
          traktConnected: true,
          traktSyncStatus: { runId: 'run-1' },
          traktTokenExpiresAt: MockTimestamp.fromMillis(Date.now() + 2 * 60 * 60 * 1000),
        }),
        exists: true,
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      batch: jest.fn(() => ({ commit: batchCommit, set: batchSet })),
      collection: jest.fn((name: string) => {
        if (name !== 'users') {
          throw new Error(`Unexpected collection ${name}`);
        }
        return { doc: jest.fn(() => userRef) };
      }),
    }));

    const fetchedPaths: string[] = [];
    (global.fetch as jest.Mock).mockImplementation((input: any) => {
      const url = String(input);
      fetchedPaths.push(new URL(url).pathname);
      const json = (body: unknown) =>
        Promise.resolve({ json: jest.fn().mockResolvedValue(body), ok: true, status: 200 });

      if (url.endsWith('/users/settings')) {
        return json({ user: { ids: { slug: 'tester' }, username: 'tester' } });
      }
      if (url.includes('/sync/watched/movies')) {
        return json([
          {
            last_watched_at: '2024-01-01T00:00:00.000Z',
            movie: { ids: { slug: 'movie-1', tmdb: 101, trakt: 201 }, title: 'Movie One', year: 2024 },
            plays: 1,
          },
        ]);
      }
      if (url.includes('/sync/watchlist')) {
        return json([
          {
            listed_at: '2024-02-01T00:00:00.000Z',
            movie: { ids: { slug: 'movie-2', tmdb: 102, trakt: 202 }, title: 'Movie Two', year: 2023 },
            type: 'movie',
          },
        ]);
      }
      if (url.includes('/sync/last_activities')) {
        return json({});
      }
      return json([]);
    });

    await expect(
      (runTraktSync as any)({
        data: { runId: 'run-1', userId: 'user-1' },
        retryCount: 0,
        retryReason: 'size-limit',
      })
    ).resolves.toBeUndefined();

    // The steps after the failed Already Watched write still ran and wrote.
    expect(fetchedPaths).toEqual(
      expect.arrayContaining(['/sync/ratings', '/sync/watchlist', '/sync/favorites'])
    );
    expect(writtenListIds).toContain('watchlist');

    const failedWrite = batchSet.mock.calls
      .map(([_ref, data]) => ('traktSyncStatus' in data ? data.traktSyncStatus : data))
      .find((data) => data?.status === 'failed') as Record<string, unknown> | undefined;

    expect(failedWrite).toMatchObject({ errorCategory: 'storage_limit', status: 'failed' });
    expect(mockEnqueue).not.toHaveBeenCalled();
    // A failed run must not advance the incremental state, or the next sync would skip the step.
    expect(batchSet.mock.calls.every(([_ref, data]) => !('traktIncrementalState' in data))).toBe(true);
  });

  it('only treats Trakt-side errors as fatal to the whole sync run', () => {
    expect(isRunFatalSyncError(new TraktSyncError('slow down', 'rate_limited', true))).toBe(true);
    expect(isRunFatalSyncError(new TraktSyncError('reconnect', 'auth_invalid', false))).toBe(true);
    expect(
      isRunFatalSyncError(new TraktOAuthError('invalid grant', 'invalid_grant'))
    ).toBe(true);
    expect(isRunFatalSyncError(new TraktSyncError('write failed', 'internal', false))).toBe(false);
    expect(isRunFatalSyncError(new TraktSyncError('too big', 'storage_limit', false))).toBe(false);
    expect(isRunFatalSyncError(new Error('Firestore write failed'))).toBe(false);
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

      if (url.includes('/users/settings')) {
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

      if (url.includes('/sync/watched/movies')) {
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
        url.includes('/sync/last_activities') ||
        url.includes('/sync/watched/shows') ||
        url.includes('/sync/ratings') ||
        url.includes('/sync/watchlist') ||
        url.includes('/sync/favorites') ||
        url.includes('/users/tester/lists')
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

      if (url.includes('/users/settings')) {
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
        url.includes('/sync/last_activities') ||
        url.includes('/sync/watched/movies') ||
        url.includes('/sync/watched/shows') ||
        url.includes('/sync/ratings') ||
        url.includes('/sync/watchlist') ||
        url.includes('/sync/favorites')
      ) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([]),
          ok: true,
          status: 200,
        });
      }

      if (url.includes('/users/tester/lists') && !url.includes('/items')) {
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

      if (url.includes('/users/tester/lists/custom-list/items')) {
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

  describe('Post-June 30 2026 Trakt API Updates (Pagination & extended=progress)', () => {
    describe('toMillisOrNow helper', () => {
      it('returns numeric millis for valid ISO date strings', () => {
        const iso = '2026-07-15T10:30:00.000Z';
        const millis = __test__.toMillisOrNow(iso);
        expect(typeof millis).toBe('number');
        expect(millis).toBe(new Date(iso).getTime());
      });

      it('returns current millis when value is undefined, null, or empty string', () => {
        const before = Date.now();
        const millisNull = __test__.toMillisOrNow(null);
        const millisUndef = __test__.toMillisOrNow(undefined);
        const millisEmpty = __test__.toMillisOrNow('');
        const after = Date.now();

        for (const millis of [millisNull, millisUndef, millisEmpty]) {
          expect(typeof millis).toBe('number');
          expect(millis).toBeGreaterThanOrEqual(before);
          expect(millis).toBeLessThanOrEqual(after);
        }
      });

      it('returns current millis when value is an invalid date string', () => {
        const before = Date.now();
        const millis = __test__.toMillisOrNow('not-a-valid-date');
        const after = Date.now();

        expect(typeof millis).toBe('number');
        expect(millis).toBeGreaterThanOrEqual(before);
        expect(millis).toBeLessThanOrEqual(after);
      });
    });

    it('buildEpisodeTrackingDoc handles undefined seasons without throwing TypeError', () => {
      const showWithoutSeasons = {
        last_updated_at: '2026-07-01T00:00:00.000Z',
        last_watched_at: '2026-07-01T00:00:00.000Z',
        plays: 1,
        show: {
          ids: {
            slug: 'breaking-bad',
            tmdb: 1396,
            trakt: 1,
          },
          title: 'Breaking Bad',
          year: 2008,
        },
      };

      const result = __test__.buildEpisodeTrackingDoc(showWithoutSeasons as any);
      expect(result).not.toBeNull();
      expect(result?.showId).toBe('1396');
      expect(result?.metadata.tvShowName).toBe('Breaking Bad');
      expect(result?.episodes).toEqual({});
    });

    it('buildEpisodeTrackingDoc handles seasons with undefined episodes gracefully', () => {
      const showWithMalformedSeasons = {
        last_updated_at: '2026-07-01T00:00:00.000Z',
        last_watched_at: '2026-07-01T00:00:00.000Z',
        plays: 1,
        seasons: [
          {
            number: 1,
          },
        ],
        show: {
          ids: {
            slug: 'better-call-saul',
            tmdb: 60059,
            trakt: 2,
          },
          title: 'Better Call Saul',
          year: 2015,
        },
      };

      const result = __test__.buildEpisodeTrackingDoc(showWithMalformedSeasons as any);
      expect(result).not.toBeNull();
      expect(result?.showId).toBe('60059');
      expect(result?.episodes).toEqual({});
    });

    it('buildEpisodeTrackingDoc populates episodes when extended=progress data is present', () => {
      const showWithProgress = {
        last_updated_at: '2026-07-01T00:00:00.000Z',
        last_watched_at: '2026-07-01T00:00:00.000Z',
        plays: 5,
        seasons: [
          {
            episodes: [
              {
                last_watched_at: '2026-06-01T12:00:00.000Z',
                number: 1,
                plays: 1,
              },
              {
                last_watched_at: '2026-06-02T12:00:00.000Z',
                number: 2,
                plays: 2,
              },
            ],
            number: 1,
          },
          {
            episodes: [
              {
                last_watched_at: '2026-06-10T12:00:00.000Z',
                number: 1,
                plays: 1,
              },
            ],
            number: 2,
          },
        ],
        show: {
          ids: {
            slug: 'severance',
            tmdb: 93405,
            trakt: 3,
          },
          title: 'Severance',
          year: 2022,
        },
      };

      const result = __test__.buildEpisodeTrackingDoc(showWithProgress as any);
      expect(result).not.toBeNull();
      expect(result?.showId).toBe('93405');
      expect(Object.keys(result?.episodes ?? {})).toEqual(['1_1', '1_2', '2_1']);
      expect(result?.episodes['1_1'].watched).toBe(true);
      expect(result?.episodes['1_2'].watched).toBe(true);
      expect(result?.episodes['2_1'].watched).toBe(true);
    });

    it('buildEpisodeTrackingDoc reuses show-level last_watched_at or omits watchedAt when episode last_watched_at is missing/invalid', () => {
      const show = {
        last_updated_at: '2026-07-01T00:00:00.000Z',
        last_watched_at: '2026-05-01T12:00:00.000Z',
        plays: 2,
        seasons: [
          {
            episodes: [
              {
                number: 1,
                plays: 1,
              },
              {
                last_watched_at: 'invalid-date',
                number: 2,
                plays: 1,
              },
            ],
            number: 1,
          },
        ],
        show: {
          ids: {
            slug: 'severance',
            tmdb: 93405,
            trakt: 3,
          },
          title: 'Severance',
          year: 2022,
        },
      };

      const result = __test__.buildEpisodeTrackingDoc(show as any);
      expect(result).not.toBeNull();
      const episodes = (result?.episodes ?? {}) as any;
      expect(episodes['1_1'].watched).toBe(true);
      expect(episodes['1_1'].watchedAt.toMillis()).toBe(new Date('2026-05-01T12:00:00.000Z').getTime());
      expect(episodes['1_2'].watched).toBe(true);
      expect(episodes['1_2'].watchedAt.toMillis()).toBe(new Date('2026-05-01T12:00:00.000Z').getTime());

      const showWithoutShowWatchedAt = {
        ...show,
        last_watched_at: undefined,
      };
      const result2 = __test__.buildEpisodeTrackingDoc(showWithoutShowWatchedAt as any);
      const episodes2 = (result2?.episodes ?? {}) as any;
      expect(episodes2['1_1'].watched).toBe(true);
      expect(episodes2['1_1'].watchedAt).toBeUndefined();
    });

    it('traktPaginatedRequest fetches and combines multiple pages using pagination headers', async () => {
      const page1Items = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}` }));
      const page2Items = Array.from({ length: 25 }, (_, i) => ({ id: i + 101, name: `Item ${i + 101}` }));

      (global.fetch as jest.Mock).mockImplementation((input: any) => {
        const url = String(input);
        if (url.includes('page=1')) {
          return Promise.resolve({
            headers: {
              get: (header: string) => {
                const lower = header.toLowerCase();
                if (lower === 'x-pagination-page') return '1';
                if (lower === 'x-pagination-limit') return '100';
                if (lower === 'x-pagination-page-count') return '2';
                if (lower === 'x-pagination-item-count') return '125';
                return null;
              },
            },
            json: jest.fn().mockResolvedValue(page1Items),
            ok: true,
            status: 200,
          });
        }

        if (url.includes('page=2')) {
          return Promise.resolve({
            headers: {
              get: (header: string) => {
                const lower = header.toLowerCase();
                if (lower === 'x-pagination-page') return '2';
                if (lower === 'x-pagination-limit') return '100';
                if (lower === 'x-pagination-page-count') return '2';
                if (lower === 'x-pagination-item-count') return '125';
                return null;
              },
            },
            json: jest.fn().mockResolvedValue(page2Items),
            ok: true,
            status: 200,
          });
        }

        throw new Error(`Unexpected URL: ${url}`);
      });

      const results = await __test__.traktPaginatedRequest<any>({
        accessToken: 'test-token',
        endpoint: '/sync/watched/movies',
      });

      expect(results).toHaveLength(125);
      expect(results[0].id).toBe(1);
      expect(results[124].id).toBe(125);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('traktPaginatedRequest warns when totalPages exceeds MAX_PAGINATION_PAGES', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      (global.fetch as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          headers: {
            get: (h: string) => (h.toLowerCase() === 'x-pagination-page-count' ? '75' : null),
          },
          json: jest.fn().mockResolvedValue([{ id: 1 }]),
          ok: true,
          status: 200,
        })
      );

      await __test__.traktPaginatedRequest<any>({
        accessToken: 'test-token',
        endpoint: '/sync/watched/movies',
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Total pages reported (75) exceeds MAX_PAGINATION_PAGES (50) for endpoint /sync/watched/movies')
      );
      expect(global.fetch).toHaveBeenCalledTimes(50);

      warnSpy.mockRestore();
    });

    it('traktPaginatedRequest warns when x-pagination-page-count is missing or invalid', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        headers: {
          get: () => null,
        },
        json: jest.fn().mockResolvedValue([{ id: 1 }]),
        ok: true,
        status: 200,
      });

      await __test__.traktPaginatedRequest<any>({
        accessToken: 'test-token',
        endpoint: '/sync/watched/movies',
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing x-pagination-page-count header for endpoint /sync/watched/movies')
      );

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        headers: {
          get: (h: string) => (h.toLowerCase() === 'x-pagination-page-count' ? 'not-a-number' : null),
        },
        json: jest.fn().mockResolvedValue([{ id: 1 }]),
        ok: true,
        status: 200,
      });

      await __test__.traktPaginatedRequest<any>({
        accessToken: 'test-token',
        endpoint: '/sync/watched/movies',
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid x-pagination-page-count header "not-a-number" for endpoint /sync/watched/movies')
      );

      warnSpy.mockRestore();
    });

    it('traktRequestRaw throws TraktSyncError when response is 200 OK but JSON parsing fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        headers: {
          get: () => null,
        },
        json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected token < in JSON at position 0')),
        ok: true,
        status: 200,
      });

      await expect(
        __test__.traktRequestRaw({
          accessToken: 'test-token',
          endpoint: '/sync/watched/movies',
        })
      ).rejects.toMatchObject({
        category: 'upstream_unavailable',
        message: 'Trakt returned an invalid JSON response.',
        retryable: true,
      });
    });

    it('enrichEpisodeTracking handles missing or non-array seasonData.episodes gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        headers: {
          get: () => null,
        },
        json: jest.fn().mockResolvedValue({
          episodes: null,
        }),
        ok: true,
        status: 200,
      });

      const result = await __test__.enrichEpisodeTracking(99, {
        '1_1': { watched: true },
      });

      expect(result['1_1']).toEqual({ watched: true });
    });

    it('transformRating and transformFavorite strip undefined fields', () => {
      const ratingWithUndefined = __test__.transformRating({
        movie: {
          ids: { slug: 'movie-slug', tmdb: 100, trakt: 200 },
          title: undefined as any,
          year: 2024,
        },
        rated_at: '2024-01-01T00:00:00.000Z',
        rating: 8,
        type: 'movie',
      });
      expect(ratingWithUndefined).toBeDefined();
      expect('title' in (ratingWithUndefined ?? {})).toBe(false);

      const favWithUndefined = __test__.transformFavorite({
        id: 1,
        listed_at: '2024-01-01T00:00:00.000Z',
        movie: {
          ids: { slug: 'movie-slug', tmdb: 100, trakt: 200 },
          title: undefined as any,
          year: 2024,
        },
        rank: 1,
        type: 'movie',
      });
      expect(favWithUndefined).toBeDefined();
      expect('title' in (favWithUndefined ?? {})).toBe(false);
    });

    it('end-to-end mirror sync succeeds with >100 items watch history and captures all items and episode progress', async () => {
      const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
      const batchCommit = jest.fn().mockResolvedValue(undefined);
      const listSet = jest.fn().mockResolvedValue(undefined);
      const episodeTrackingSet = jest.fn().mockResolvedValue(undefined);
      const requestedWatchedShowUrls: string[] = [];

      // Generate 120 watched movies across 2 pages
      const moviesPage1 = Array.from({ length: 100 }, (_, i) => ({
        last_updated_at: '2026-07-01T00:00:00.000Z',
        last_watched_at: '2026-07-01T00:00:00.000Z',
        movie: {
          ids: { slug: `movie-${i + 1}`, tmdb: 1000 + i + 1, trakt: 2000 + i + 1 },
          title: `Movie ${i + 1}`,
          year: 2020 + (i % 5),
        },
        plays: 1,
      }));
      const moviesPage2 = Array.from({ length: 20 }, (_, i) => ({
        last_updated_at: '2026-07-01T00:00:00.000Z',
        last_watched_at: '2026-07-01T00:00:00.000Z',
        movie: {
          ids: { slug: `movie-${i + 101}`, tmdb: 1000 + i + 101, trakt: 2000 + i + 101 },
          title: `Movie ${i + 101}`,
          year: 2024,
        },
        plays: 1,
      }));

      // Generate 5 watched shows with extended=progress season/episode data
      const watchedShows = [
        {
          last_updated_at: '2026-07-01T00:00:00.000Z',
          last_watched_at: '2026-07-01T00:00:00.000Z',
          plays: 10,
          seasons: [
            {
              episodes: [
                { last_watched_at: '2026-06-01T00:00:00.000Z', number: 1, plays: 1 },
                { last_watched_at: '2026-06-02T00:00:00.000Z', number: 2, plays: 1 },
              ],
              number: 1,
            },
            {
              episodes: [
                { last_watched_at: '2026-06-15T00:00:00.000Z', number: 1, plays: 1 },
              ],
              number: 2,
            },
          ],
          show: {
            ids: { slug: 'mega-show-1', tmdb: 5001, trakt: 6001 },
            title: 'Mega Show 1',
            year: 2021,
          },
        },
        {
          // Show with undefined seasons (defensive check)
          last_updated_at: '2026-07-01T00:00:00.000Z',
          last_watched_at: '2026-07-01T00:00:00.000Z',
          plays: 1,
          show: {
            ids: { slug: 'mega-show-2', tmdb: 5002, trakt: 6002 },
            title: 'Mega Show 2',
            year: 2022,
          },
        },
      ];

      const episodeTrackingCollection = {
        doc: jest.fn((id: string) => ({
          id,
          path: `users/user-1/episode_tracking/${id}`,
          set: episodeTrackingSet,
        })),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };

      const listsCollection = {
        doc: jest.fn((id: string) => ({
          get: jest.fn().mockResolvedValue({ data: () => undefined, exists: false }),
          id,
          path: `users/user-1/lists/${id}`,
          set: listSet,
        })),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };

      const userRef = {
        collection: jest.fn((name: string) => {
          if (name === 'traktSyncRuns') {
            return {
              doc: jest.fn((id: string) => ({ id, path: `users/user-1/traktSyncRuns/${id}` })),
            };
          }
          if (name === 'traktEnrichmentRuns') {
            return {
              doc: jest.fn((id = 'enrich-1') => ({ id, path: `users/user-1/traktEnrichmentRuns/${id}` })),
            };
          }
          if (name === 'lists') {
            return listsCollection;
          }
          if (name === 'episode_tracking') {
            return episodeTrackingCollection;
          }
          if (name === 'ratings') {
            return { get: jest.fn().mockResolvedValue({ docs: [] }) };
          }
          throw new Error(`Unexpected collection ${name}`);
        }),
        get: jest.fn().mockResolvedValue({
          data: () => ({
            traktAccessToken: 'test-token',
            traktConnected: true,
            traktSyncStatus: { runId: 'run-1' },
            traktTokenExpiresAt: MockTimestamp.fromMillis(Date.now() + 2 * 60 * 60 * 1000),
          }),
          exists: true,
        }),
        path: 'users/user-1',
      };

      firestoreFn.mockImplementation(() => ({
        batch: jest.fn(() => ({
          commit: batchCommit,
          delete: jest.fn(),
          set: batchSet,
        })),
        collection: jest.fn((name: string) => {
          if (name !== 'users') throw new Error(`Unexpected collection ${name}`);
          return { doc: jest.fn(() => userRef) };
        }),
        runTransaction: jest.fn().mockResolvedValue({
          kind: 'active',
          status: { runId: 'enrich-1', status: 'in_progress' },
          userData: {},
        }),
      }));

      (global.fetch as jest.Mock).mockImplementation((input: any) => {
        const url = String(input);

        if (url.includes('/users/settings')) {
          return Promise.resolve({
            json: jest.fn().mockResolvedValue({
              user: { ids: { slug: 'tester' }, name: 'Tester', private: false, username: 'tester', vip: false, vip_ep: false },
            }),
            ok: true,
            status: 200,
          });
        }

        if (url.includes('/sync/last_activities')) {
          return Promise.resolve({
            json: jest.fn().mockResolvedValue({}),
            ok: true,
            status: 200,
          });
        }

        if (url.includes('/sync/watched/movies')) {
          if (url.includes('page=2')) {
            return Promise.resolve({
              headers: {
                get: (h: string) => (h.toLowerCase() === 'x-pagination-page-count' ? '2' : null),
              },
              json: jest.fn().mockResolvedValue(moviesPage2),
              ok: true,
              status: 200,
            });
          }
          return Promise.resolve({
            headers: {
              get: (h: string) => (h.toLowerCase() === 'x-pagination-page-count' ? '2' : null),
            },
            json: jest.fn().mockResolvedValue(moviesPage1),
            ok: true,
            status: 200,
          });
        }

        if (url.includes('/sync/watched/shows')) {
          requestedWatchedShowUrls.push(url);
          return Promise.resolve({
            headers: {
              get: (h: string) => (h.toLowerCase() === 'x-pagination-page-count' ? '1' : null),
            },
            json: jest.fn().mockResolvedValue(watchedShows),
            ok: true,
            status: 200,
          });
        }

        if (url.includes('/sync/ratings') || url.includes('/sync/watchlist') || url.includes('/sync/favorites') || url.includes('/users/tester/lists')) {
          return Promise.resolve({
            headers: {
              get: () => '1',
            },
            json: jest.fn().mockResolvedValue([]),
            ok: true,
            status: 200,
          });
        }

        if (url.includes('api.themoviedb.org')) {
          return Promise.resolve({
            json: jest.fn().mockResolvedValue({ id: 5001, name: 'Show' }),
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

      // Verify extended=progress was requested on all watched-show requests
      expect(requestedWatchedShowUrls.length).toBeGreaterThan(0);
      requestedWatchedShowUrls.forEach((url) => {
        expect(url).toContain('extended=progress');
      });

      // Verify sync completed with all 120 movies + 2 shows = 122 total items and 3 episodes
      const completedWrite = batchSet.mock.calls
        .map(([_ref, data]) => ('traktSyncStatus' in data ? data.traktSyncStatus : data))
        .find((data) => data?.status === 'completed') as any;

      expect(completedWrite).toBeDefined();
      expect(completedWrite.status).toBe('completed');
      expect(completedWrite.itemsSynced.movies).toBe(120);
      expect(completedWrite.itemsSynced.shows).toBe(2);
      expect(completedWrite.itemsSynced.episodes).toBe(3);

      // Verify already-watched list contains all 120 movies + 2 shows
      const alreadyWatchedCall = listSet.mock.calls.find(
        ([data]) => data?.id === 'already-watched'
      );
      expect(alreadyWatchedCall).toBeDefined();
      const alreadyWatchedItems = alreadyWatchedCall[0].items;
      expect(Object.keys(alreadyWatchedItems)).toHaveLength(122);
    });
  });
});


describe('Trakt OAuth invalid_grant handling', () => {
  const mockOAuthErrorResponse = (status: number, body: string) => {
    (global.fetch as jest.Mock).mockResolvedValue({
      headers: { get: () => null },
      ok: false,
      status,
      text: jest.fn().mockResolvedValue(body),
    });
  };

  const mockUserTransaction = (storedRefreshToken: string | undefined) => {
    const transactionGet = jest.fn().mockResolvedValue({
      data: () => (storedRefreshToken === undefined ? {} : { traktRefreshToken: storedRefreshToken }),
      exists: true,
    });
    const transactionSet = jest.fn();
    return { transactionGet, transactionSet };
  };

  it('sends the code exchange and the refresh to auth.trakt.tv/oauth/token with the existing body', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      headers: { get: () => null },
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({ access_token: 'access', created_at: 1, expires_in: 3600, refresh_token: 'refresh' })
      ),
    });

    await exchangeAuthorizationCode('code-1');
    await refreshAccessToken('refresh-1');

    const calls = (global.fetch as jest.Mock).mock.calls as [string, RequestInit][];
    expect(calls.map(([url]) => url)).toEqual([
      'https://auth.trakt.tv/oauth/token',
      'https://auth.trakt.tv/oauth/token',
    ]);
    expect(JSON.parse(calls[0][1].body as string)).toEqual({
      client_id: 'test-secret',
      client_secret: 'test-secret',
      code: 'code-1',
      grant_type: 'authorization_code',
      redirect_uri: 'test-secret',
    });
    expect(JSON.parse(calls[1][1].body as string)).toEqual({
      client_id: 'test-secret',
      client_secret: 'test-secret',
      grant_type: 'refresh_token',
      redirect_uri: 'test-secret',
      refresh_token: 'refresh-1',
    });
    calls.forEach(([, init]) =>
      expect(init.headers).toMatchObject({
        'Content-Type': 'application/json',
        'trakt-api-key': 'test-secret',
        'trakt-api-version': '2',
      })
    );
  });

  it('builds the authorize URL on auth.trakt.tv with the existing query params', async () => {
    const transactionGet = jest.fn().mockResolvedValue({ data: () => ({}), exists: true });
    const transactionSet = jest.fn();
    firestoreFn.mockImplementation(() => ({
      collection: jest.fn((name: string) => ({
        doc: jest.fn((id: string) => ({ path: `${name}/${id}` })),
      })),
      runTransaction: jest.fn(async (callback: any) => callback({ get: transactionGet, set: transactionSet })),
    }));
    const nowMillis = 1_800_000_000_000;
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(nowMillis);

    let authUrl: string;
    try {
      ({ authUrl } = await createOAuthState('user-1'));
    } finally {
      dateNowSpy.mockRestore();
    }
    const url = new URL(authUrl);
    const state = url.searchParams.get('state');

    expect(`${url.origin}${url.pathname}`).toBe('https://auth.trakt.tv/oauth/authorize');
    expect([...url.searchParams.keys()]).toEqual(['response_type', 'client_id', 'redirect_uri', 'state']);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(state).toBeTruthy();

    const stateWrite = transactionSet.mock.calls.find(([ref]) => ref.path.startsWith('traktOAuthStates/'));
    expect(stateWrite).toBeDefined();
    const [stateRef, stateDoc, stateOptions] = stateWrite!;
    expect(stateRef.path).toBe(`traktOAuthStates/${state}`);
    expect(stateDoc).toMatchObject({ used: false, userId: 'user-1' });
    expect(stateDoc.expiresAt).toBeInstanceOf(MockTimestamp);
    expect(stateDoc.expiresAt.toMillis()).toBeGreaterThan(nowMillis);
    expect(stateDoc.expiresAt.toMillis()).toBe(nowMillis + TRAKT_OAUTH_STATE_TTL_MS);
    expect(stateOptions).toEqual({ merge: true });
  });

  it('throws an invalid_grant OAuth error with the Trakt error details', async () => {
    mockOAuthErrorResponse(400, JSON.stringify({ error: 'invalid_grant', error_description: 'session not found' }));

    const error = await requestOAuthToken({ grant_type: 'refresh_token' }, 'refresh').catch((caught) => caught);

    expect(error).toBeInstanceOf(TraktOAuthError);
    expect(error).toMatchObject({
      oauthError: 'invalid_grant',
      oauthErrorDescription: 'session not found',
      reason: 'invalid_grant',
      statusCode: 400,
    });
  });

  it('keeps other 400 OAuth errors as invalid_oauth while recording their details', async () => {
    mockOAuthErrorResponse(400, JSON.stringify({ error: 'invalid_client', error_description: 'bad client' }));

    const error = await requestOAuthToken({ grant_type: 'refresh_token' }, 'refresh').catch((caught) => caught);

    expect(error).toMatchObject({
      oauthError: 'invalid_client',
      oauthErrorDescription: 'bad client',
      reason: 'invalid_oauth',
    });
  });

  it('maps invalid_grant to a non-retryable reauth_required sync error', () => {
    const normalized = normalizeSyncError(
      new TraktOAuthError('rejected', 'invalid_grant', {
        oauthError: 'invalid_grant',
        oauthErrorDescription: 'session not found',
        statusCode: 400,
      })
    );

    expect(normalized).toMatchObject({
      category: 'reauth_required',
      oauthError: 'invalid_grant',
      oauthErrorDescription: 'session not found',
      retryable: false,
    });
  });

  it('clears the stored tokens when the stored refresh token is the rejected one', async () => {
    const { transactionGet, transactionSet } = mockUserTransaction('refresh-1');
    firestoreFn.mockImplementation(() => ({
      collection: jest.fn(() => ({ doc: jest.fn(() => ({ path: 'users/user-1' })) })),
      runTransaction: jest.fn(async (callback: any) => callback({ get: transactionGet, set: transactionSet })),
    }));

    await expect(clearTraktTokensIfRefreshTokenUnchanged('user-1', 'refresh-1')).resolves.toBe(true);
    expect(transactionSet).toHaveBeenCalledWith(
      { path: 'users/user-1' },
      {
        traktAccessToken: 'FIELD_DELETE',
        traktConnected: false,
        traktReauthRequired: true,
        traktRefreshToken: 'FIELD_DELETE',
        traktTokenExpiresAt: 'FIELD_DELETE',
      },
      { merge: true }
    );
  });

  it('does not clear anything when another run already stored a new refresh token', async () => {
    const { transactionGet, transactionSet } = mockUserTransaction('refresh-2');
    firestoreFn.mockImplementation(() => ({
      collection: jest.fn(() => ({ doc: jest.fn(() => ({ path: 'users/user-1' })) })),
      runTransaction: jest.fn(async (callback: any) => callback({ get: transactionGet, set: transactionSet })),
    }));

    await expect(clearTraktTokensIfRefreshTokenUnchanged('user-1', 'refresh-1')).resolves.toBe(false);
    expect(transactionSet).not.toHaveBeenCalled();
  });

  describe('runTraktSync', () => {
    const setupRunTraktSync = (storedRefreshTokenAtFailure: string, { clearError }: { clearError?: Error } = {}) => {
      const batchSet = jest.fn();
      const { transactionGet, transactionSet } = mockUserTransaction(storedRefreshTokenAtFailure);
      const userRef = {
        collection: jest.fn(() => ({
          doc: jest.fn((id: string) => ({ id, path: `users/user-1/traktSyncRuns/${id}` })),
        })),
        get: jest.fn().mockResolvedValue({
          data: () => ({
            traktAccessToken: 'access-1',
            traktConnected: true,
            traktRefreshToken: 'refresh-1',
            traktSyncStatus: { runId: 'run-1' },
            traktTokenExpiresAt: MockTimestamp.fromMillis(Date.now() + 1000),
          }),
          exists: true,
        }),
        path: 'users/user-1',
      };

      firestoreFn.mockImplementation(() => ({
        batch: jest.fn(() => ({ commit: jest.fn().mockResolvedValue(undefined), set: batchSet })),
        collection: jest.fn(() => ({ doc: jest.fn(() => userRef) })),
        runTransaction: jest.fn(async (callback: any) => {
          if (clearError) {
            throw clearError;
          }
          return callback({ get: transactionGet, set: transactionSet });
        }),
      }));
      mockOAuthErrorResponse(400, JSON.stringify({ error: 'invalid_grant', error_description: 'session not found' }));

      const getFailedStatus = () =>
        batchSet.mock.calls
          .map(([, data]) => data?.traktSyncStatus)
          .filter((status) => status?.status === 'failed')
          .pop();

      return { getFailedStatus, transactionSet };
    };

    const runSync = () =>
      (runTraktSync as any)({
        data: { runId: 'run-1', userId: 'user-1' },
        retryCount: 0,
        retryReason: undefined,
      });

    it('disconnects and records reauth_required when the rejected refresh token is still stored', async () => {
      const { getFailedStatus, transactionSet } = setupRunTraktSync('refresh-1');

      await expect(runSync()).resolves.toBeUndefined();

      expect(transactionSet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ traktConnected: false, traktRefreshToken: 'FIELD_DELETE' }),
        { merge: true }
      );
      expect(getFailedStatus()).toMatchObject({
        diagnostics: { oauthError: 'invalid_grant', oauthErrorDescription: 'session not found' },
        errorCategory: 'reauth_required',
      });
    });

    it('keeps the connection and records a normal failure when the refresh token already changed', async () => {
      const { getFailedStatus, transactionSet } = setupRunTraktSync('refresh-2');

      await expect(runSync()).resolves.toBeUndefined();

      expect(transactionSet).not.toHaveBeenCalled();
      expect(getFailedStatus()).toMatchObject({ errorCategory: 'auth_invalid' });
    });

    it('keeps reauth_required and logs the error when clearing the tokens throws', async () => {
      const clearError = new Error('firestore unavailable');
      const { getFailedStatus, transactionSet } = setupRunTraktSync('refresh-1', { clearError });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      try {
        await expect(runSync()).resolves.toBeUndefined();

        expect(transactionSet).not.toHaveBeenCalled();
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[TraktSync] Failed to clear rejected Trakt tokens:',
          expect.objectContaining({ clearError, runId: 'run-1', userId: 'user-1' })
        );
        expect(getFailedStatus()).toMatchObject({ errorCategory: 'reauth_required' });
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });
  });

  describe('traktReauthRequired flag', () => {
    // In-memory users/user-1 doc: merge writes apply to it and 'FIELD_DELETE' removes a field.
    const setupStatefulUserDoc = (
      initialDoc: Record<string, unknown>,
      { failFirstFailedStatusWrite = false }: { failFirstFailedStatusWrite?: boolean } = {}
    ) => {
      const userDoc: Record<string, unknown> = { ...initialDoc };
      const committedFailedStatuses: Record<string, unknown>[] = [];
      let shouldFailNextFailedStatusWrite = failFirstFailedStatusWrite;

      const applyMerge = (data: Record<string, unknown>) => {
        Object.entries(data).forEach(([key, value]) => {
          if (value === 'FIELD_DELETE') {
            delete userDoc[key];
          } else {
            userDoc[key] = value;
          }
        });
      };
      const snapshot = () => ({ data: () => ({ ...userDoc }), exists: true });

      const userRef = {
        collection: jest.fn(() => ({
          doc: jest.fn((id: string) => ({ id, path: `users/user-1/traktSyncRuns/${id}` })),
        })),
        get: jest.fn(async () => snapshot()),
        path: 'users/user-1',
      };

      firestoreFn.mockImplementation(() => ({
        batch: jest.fn(() => {
          const pendingSets: [unknown, Record<string, unknown>][] = [];
          return {
            commit: jest.fn(async () => {
              const userWrite = pendingSets.find(([ref]) => ref === userRef)?.[1];
              const status = userWrite?.traktSyncStatus as Record<string, unknown> | undefined;
              if (status?.status === 'failed' && shouldFailNextFailedStatusWrite) {
                shouldFailNextFailedStatusWrite = false;
                throw new Error('status write failed');
              }
              if (userWrite) {
                applyMerge(userWrite);
              }
              if (status?.status === 'failed') {
                committedFailedStatuses.push(status);
              }
            }),
            set: jest.fn((ref: unknown, data: Record<string, unknown>) => {
              pendingSets.push([ref, data]);
            }),
          };
        }),
        collection: jest.fn(() => ({ doc: jest.fn(() => userRef) })),
        runTransaction: jest.fn(async (callback: any) =>
          callback({
            get: jest.fn(async () => snapshot()),
            set: jest.fn((_ref: unknown, data: Record<string, unknown>) => applyMerge(data)),
          })
        ),
      }));

      return { committedFailedStatuses, userDoc };
    };

    const runSyncAttempt = (retryCount: number) =>
      (runTraktSync as any)({
        data: { runId: 'run-1', userId: 'user-1' },
        retryCount,
        retryReason: undefined,
      });

    it('keeps reauth_required when the status write fails after the clear and the task retries', async () => {
      const { committedFailedStatuses, userDoc } = setupStatefulUserDoc(
        {
          traktAccessToken: 'access-1',
          traktConnected: true,
          traktRefreshToken: 'refresh-1',
          traktSyncStatus: { runId: 'run-1' },
          traktTokenExpiresAt: MockTimestamp.fromMillis(Date.now() + 1000),
        },
        { failFirstFailedStatusWrite: true }
      );
      mockOAuthErrorResponse(400, JSON.stringify({ error: 'invalid_grant', error_description: 'session not found' }));
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      try {
        await expect(runSyncAttempt(0)).rejects.toThrow('status write failed');

        expect(userDoc).toMatchObject({ traktConnected: false, traktReauthRequired: true });
        expect(userDoc).not.toHaveProperty('traktAccessToken');
        expect(userDoc).not.toHaveProperty('traktRefreshToken');
        expect(userDoc).not.toHaveProperty('traktTokenExpiresAt');
        expect(committedFailedStatuses).toHaveLength(0);

        await expect(runSyncAttempt(1)).resolves.toBeUndefined();

        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(committedFailedStatuses).toHaveLength(1);
        expect(committedFailedStatuses[0]).toMatchObject({
          errorCategory: 'reauth_required',
          errorMessage: TRAKT_INVALID_GRANT_MESSAGE,
          status: 'failed',
        });
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });

    it('still records auth_invalid for a disconnected user without the flag', async () => {
      const { committedFailedStatuses } = setupStatefulUserDoc({
        traktConnected: false,
        traktSyncStatus: { runId: 'run-1' },
      });

      await expect(runSyncAttempt(0)).resolves.toBeUndefined();

      expect(global.fetch).not.toHaveBeenCalled();
      expect(committedFailedStatuses).toHaveLength(1);
      expect(committedFailedStatuses[0]).toMatchObject({
        errorCategory: 'auth_invalid',
        errorMessage: 'Trakt is not connected for this user.',
        status: 'failed',
      });
    });

    it('removes the flag on POST /disconnect', async () => {
      const userSet = jest.fn().mockResolvedValue(undefined);
      firestoreFn.mockImplementation(() => ({
        collection: jest.fn(() => ({ doc: jest.fn(() => ({ path: 'users/user-1', set: userSet })) })),
      }));
      const response = createResponse();

      await (traktApi as any)(
        {
          body: {},
          header: (name: string) => (name.toLowerCase() === 'authorization' ? 'Bearer token' : undefined),
          method: 'POST',
          path: '/disconnect',
        },
        response
      );

      expect(response.status).toHaveBeenCalledWith(200);
      expect(userSet).toHaveBeenCalledWith(
        expect.objectContaining({ traktConnected: false, traktReauthRequired: 'FIELD_DELETE' }),
        { merge: true }
      );
    });
  });
});

describe('Trakt list item enrichment', () => {
  it('only treats never-enriched items as needing TMDB data', () => {
    expect(needsMediaEnrichment({ id: 1, media_type: 'movie', title: 'From Trakt' })).toBe(true);
    expect(
      needsMediaEnrichment({ id: 1, media_type: 'movie', poster_path: null, vote_average: 0 })
    ).toBe(false);
    expect(needsMediaEnrichment({ id: 'x', media_type: 'movie' })).toBe(false);
    // Enriched before genre ids were read correctly: looked up again to fill them in.
    expect(
      needsMediaEnrichment({ id: 1, media_type: 'movie', poster_path: '/p.jpg', vote_average: 7, genre_ids: [] })
    ).toBe(true);
    expect(
      needsMediaEnrichment({ id: 1, media_type: 'movie', poster_path: '/p.jpg', vote_average: 7, genre_ids: [18] })
    ).toBe(false);
    // A complete season (as the app saves it, or after enrichment) isn't looked up again, even
    // when its show has no genres.
    expect(
      needsMediaEnrichment({
        genre_ids: [],
        id: 1,
        media_type: 'season',
        poster_path: null,
        season_name: 'Season 2',
        season_number: 2,
      })
    ).toBe(false);
  });

  it('reads genre ids from the genres TMDB details actually return', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      headers: { get: () => null },
      json: jest.fn().mockResolvedValue({
        genres: [{ id: 18, name: 'Drama' }, { id: 80, name: 'Crime' }],
        poster_path: '/p.jpg',
        release_date: '2008-07-18',
        title: 'The Dark Knight',
        vote_average: 8.5,
      }),
      ok: true,
      status: 200,
    });

    const enriched = await enrichMediaItem({ id: 155, media_type: 'movie', title: 'The Dark Knight' });

    expect(enriched).toMatchObject({ genre_ids: [18, 80], poster_path: '/p.jpg', vote_average: 8.5 });
  });
});

describe('Trakt sync batching', () => {
  it('splits large rating syncs into batches under the 500-write limit', async () => {
    const commits: number[] = [];
    firestoreFn.mockImplementation(() => ({
      batch: jest.fn(() => {
        let writes = 0;
        return {
          set: jest.fn(() => {
            writes += 1;
          }),
          commit: jest.fn(async () => {
            commits.push(writes);
          }),
        };
      }),
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          collection: jest.fn(() => ({
            doc: jest.fn((id: string) => ({ id })),
            get: jest.fn().mockResolvedValue({ docs: [] }),
          })),
        })),
      })),
    }));
    const ratings = Array.from({ length: 950 }, (_, i) => ({
      movie: { ids: { tmdb: i + 1, trakt: i + 1 }, title: `Movie ${i}`, year: 2000 },
      rated_at: '2024-01-01T00:00:00.000Z',
      rating: 7,
      type: 'movie',
    }));

    const result = await reconcileRatings('user-1', ratings as any);

    expect(result.changedCount).toBe(950);
    expect(commits.every((size) => size <= 400)).toBe(true);
    expect(commits.reduce((total, size) => total + size, 0)).toBe(950);
  });
});

describe('enrichment on a full list document', () => {
  const movieItem = (id: number, extra: Record<string, unknown> = {}) => ({
    id,
    media_type: 'movie',
    title: `Movie ${id}`,
    ...extra,
  });
  const singlePage = (items: Record<string, Record<string, unknown>>) => ({
    items,
    layout: { overflowItemPages: {}, pageCount: 0, pageSizes: [Object.keys(items).length] },
  });
  const manyItems = (count: number, extra: Record<string, unknown> = {}) =>
    Object.fromEntries(
      Array.from({ length: count }, (_, i) => [`movie-${i + 1}`, movieItem(i + 1, extra)])
    );

  it('updates items in place while the list document has room', () => {
    const list = singlePage(manyItems(10));
    const result = planEnrichmentRelocation(list, { 'movie-1': movieItem(1, { poster_path: '/p' }) });

    expect(Object.keys(result.itemsInPlace)).toEqual(['movie-1']);
    expect(result.itemsToMove).toEqual({});
    expect(result.removeFromListDocKeys).toEqual([]);
  });

  it('moves items off a document holding more than a page', () => {
    const list = singlePage(manyItems(2500));
    const result = planEnrichmentRelocation(list, { 'movie-7': movieItem(7, { poster_path: '/p' }) });

    expect(Object.keys(result.itemsToMove)).toEqual(['movie-7']);
    expect(result.removeFromListDocKeys).toEqual(['movie-7']);
  });

  it('moves items off a document under 2,000 items that enrichment would bring near 1 MiB', () => {
    const heavy = { overview: 'x'.repeat(450) };
    const list = singlePage(manyItems(1900, heavy));
    const result = planEnrichmentRelocation(list, {
      'movie-3': movieItem(3, { ...heavy, poster_path: '/p' }),
    });

    expect(Object.keys(result.itemsToMove)).toEqual(['movie-3']);
  });

  it('moves a legacy numeric key under its canonical key', () => {
    const list = singlePage({ ...manyItems(2500), '900001': movieItem(900001) });
    const result = planEnrichmentRelocation(list, {
      '900001': movieItem(900001, { poster_path: '/p' }),
    });

    expect(result.itemsToMove).toEqual({
      'movie-900001': expect.objectContaining({ id: 900001, poster_path: '/p' }),
    });
    expect(result.removeFromListDocKeys).toEqual(['900001']);
    expect(result.itemsInPlace).toEqual({});
  });

  it('keeps the canonical copy and just drops a legacy duplicate with nothing to add', () => {
    const list = singlePage({ ...manyItems(2500, { poster_path: '/c' }), '5': movieItem(5) });
    const result = planEnrichmentRelocation(list, { '5': movieItem(5, { poster_path: '/p' }) });

    expect(result.itemsToMove).toEqual({});
    expect(result.itemsInPlace).toEqual({});
    expect(result.removeFromListDocKeys).toEqual(['5']);
  });

  it('moves the canonical copy with fields only the legacy copy had, before the legacy one goes', () => {
    const list = singlePage({
      ...manyItems(2500),
      '5': movieItem(5, { addedAt: 111, title: 'Legacy title' }),
    });
    const result = planEnrichmentRelocation(list, { '5': movieItem(5, { addedAt: 111, poster_path: '/p' }) });

    // Written to a page (with addedAt) by the relocation, which runs before any removal.
    expect(result.itemsToMove['movie-5']).toEqual(
      expect.objectContaining({ addedAt: 111, title: 'Movie 5', poster_path: '/p' })
    );
    expect(result.itemsInPlace).toEqual({});
    expect(result.removeFromListDocKeys).toEqual(['5', 'movie-5']);
  });

  it('updates a canonical copy already on a page in place with the legacy-only fields', () => {
    const list = {
      items: { ...manyItems(2500), '5': movieItem(5, { addedAt: 111 }) },
      layout: { overflowItemPages: { 'movie-5': 1 }, pageCount: 1, pageSizes: [2500, 1] },
    };
    const result = planEnrichmentRelocation(list, { '5': movieItem(5, { addedAt: 111, poster_path: '/p' }) });

    expect(result.itemsInPlace['movie-5']).toEqual(expect.objectContaining({ addedAt: 111 }));
    expect(result.itemsToMove).toEqual({});
    expect(result.removeFromListDocKeys).toEqual(['5']);
  });

  it('removes stale document copies of items already on a page', () => {
    const list = { ...singlePage(manyItems(10)), duplicateDocKeys: ['movie-3'] };
    const result = planEnrichmentRelocation(list, {});

    expect(result.removeFromListDocKeys).toEqual(['movie-3']);
  });
});

describe('reconcileManagedList with season entries', () => {
  const seasonItem = (seasonNumber: number) => ({
    addedAt: new Date('2026-01-02T00:00:00.000Z').getTime(),
    id: 1396,
    media_type: 'season',
    name: `Breaking Bad · Season ${seasonNumber}`,
    season_number: seasonNumber,
    show_name: 'Breaking Bad',
    title: `Breaking Bad · Season ${seasonNumber}`,
  });

  it('replaces a folded show with its seasons in a Trakt custom list', async () => {
    const listSet = jest.fn().mockResolvedValue(undefined);

    const result = await (__test__ as any).reconcileManagedList(
      'user-1',
      'trakt_77',
      { 'season-1396-2': seasonItem(2), 'season-1396-0': seasonItem(0) },
      { name: 'Faves' },
      createDocSnapshotWithSet(
        'users/user-1/lists/trakt_77',
        {
          items: {
            // What earlier syncs wrote for those seasons: the show itself.
            'tv-1396': {
              addedAt: new Date('2026-01-02T00:00:00.000Z').getTime(),
              id: 1396,
              media_type: 'tv',
              title: 'Breaking Bad',
            },
          },
          metadata: { itemCount: 1, needsEnrichment: false },
          name: 'Faves',
        },
        listSet
      ),
      { preserveLocalItems: false, recencyField: 'addedAt' }
    );

    expect(result).toMatchObject({
      changedMediaTypes: ['tv'],
      didRemoteChange: true,
      shouldEnrich: true,
    });
    const written = listSet.mock.calls[0][0].items;
    expect(written['tv-1396']).toBe('FIELD_DELETE');
    expect(written['season-1396-2']).toEqual(
      expect.objectContaining({ media_type: 'season', season_number: 2 })
    );
    expect(written['season-1396-0']).toEqual(
      expect.objectContaining({ media_type: 'season', season_number: 0 })
    );
  });

  it('never clears a numeric key for a season (it belongs to the show or a movie)', async () => {
    const listSet = jest.fn().mockResolvedValue(undefined);
    const legacyMovie = { addedAt: 1, id: 1396, media_type: 'movie', title: 'A Movie' };

    await (__test__ as any).reconcileManagedList(
      'user-1',
      'watchlist',
      { 'season-1396-1': seasonItem(1) },
      { id: 'watchlist', name: 'Should Watch' },
      createDocSnapshotWithSet(
        'users/user-1/lists/watchlist',
        {
          items: { '1396': legacyMovie },
          metadata: { itemCount: 1, needsEnrichment: false },
          name: 'Should Watch',
        },
        listSet
      ),
      { preserveLocalItems: true, recencyField: 'addedAt' }
    );

    const written = listSet.mock.calls[0][0].items;
    expect(written).toHaveProperty(['season-1396-1']);
    expect(written).not.toHaveProperty('1396');
  });

  it('leaves an unchanged season alone on the next sync', async () => {
    const listSet = jest.fn().mockResolvedValue(undefined);
    const enriched = {
      ...seasonItem(2),
      poster_path: '/s2.jpg',
      season_name: 'Season 2',
      vote_average: 8.2,
    };

    const result = await (__test__ as any).reconcileManagedList(
      'user-1',
      'trakt_77',
      { 'season-1396-2': seasonItem(2) },
      { name: 'Faves' },
      createDocSnapshotWithSet(
        'users/user-1/lists/trakt_77',
        {
          items: { 'season-1396-2': enriched },
          metadata: { itemCount: 1, needsEnrichment: false },
          name: 'Faves',
        },
        listSet
      ),
      { preserveLocalItems: false, recencyField: 'addedAt' }
    );

    expect(result).toMatchObject({ changedCount: 0, didRemoteChange: false, didWrite: false });
    expect(listSet).not.toHaveBeenCalled();
  });
});

describe('watchlist cleanup and old numeric keys', () => {
  const seasonListedAt = new Date('2025-01-26T07:45:16.000Z').getTime();
  const remoteSeason = {
    'season-1396-2': {
      addedAt: seasonListedAt,
      id: 1396,
      media_type: 'season',
      season_number: 2,
      title: 'Breaking Bad · Season 2',
    },
  };
  const foldedShow = { addedAt: seasonListedAt, id: 1396, media_type: 'tv', title: 'Breaking Bad' };

  const reconcileWatchlist = async (items: Record<string, unknown>) => {
    const listSet = jest.fn().mockResolvedValue(undefined);
    await (__test__ as any).reconcileManagedList(
      'user-1',
      'watchlist',
      remoteSeason,
      { id: 'watchlist', name: 'Should Watch' },
      createDocSnapshotWithSet(
        'users/user-1/lists/watchlist',
        { items, metadata: { itemCount: 2, needsEnrichment: false }, name: 'Should Watch' },
        listSet
      ),
      { preserveLocalItems: true, recencyField: 'addedAt', removeFoldedSeasonShows: true }
    );
    return listSet.mock.calls[0][0].items;
  };

  it('keeps a movie stored under the same number as the folded show', async () => {
    const written = await reconcileWatchlist({
      'tv-1396': foldedShow,
      // An old-format movie entry that happens to share the show's TMDB number.
      '1396': { addedAt: 5, id: 1396, media_type: 'movie', title: 'A Movie' },
    });

    expect(written['tv-1396']).toBe('FIELD_DELETE');
    expect(written).not.toHaveProperty('1396');
  });

  it('keeps a movie stored under the number of a show Trakt sends', async () => {
    const listSet = jest.fn().mockResolvedValue(undefined);
    await (__test__ as any).reconcileManagedList(
      'user-1',
      'watchlist',
      { 'tv-1396': { addedAt: 9, id: 1396, media_type: 'tv', title: 'Breaking Bad' } },
      { id: 'watchlist', name: 'Should Watch' },
      createDocSnapshotWithSet(
        'users/user-1/lists/watchlist',
        {
          items: { '1396': { addedAt: 5, id: 1396, media_type: 'movie', title: 'A Movie' } },
          metadata: { itemCount: 1, needsEnrichment: false },
          name: 'Should Watch',
        },
        listSet
      ),
      { preserveLocalItems: true, recencyField: 'addedAt' }
    );

    const written = listSet.mock.calls[0][0].items;
    expect(written['tv-1396']).toEqual(expect.objectContaining({ media_type: 'tv' }));
    expect(written).not.toHaveProperty('1396');
  });

  it('removes the folded show when it is stored under its old numeric key', async () => {
    const written = await reconcileWatchlist({ '1396': foldedShow });

    expect(written['1396']).toBe('FIELD_DELETE');
  });
});

describe('one-time re-read of the watchlist and lists', () => {
  const activities = {
    episodes: { watched_at: '2024-01-03T00:00:00.000Z' },
    favorites: { updated_at: '2024-01-04T00:00:00.000Z' },
    lists: { updated_at: '2024-01-05T00:00:00.000Z' },
    movies: { rated_at: '2024-01-02T00:00:00.000Z', watched_at: '2024-01-01T00:00:00.000Z' },
    shows: { rated_at: '2024-01-02T00:00:00.000Z', watched_at: '2024-01-03T00:00:00.000Z' },
    watchlist: { updated_at: '2024-01-04T00:00:00.000Z' },
  };

  it('re-reads only the watchlist and lists for a sync state from before seasons', () => {
    expect(
      getSyncSteps({
        bootstrap: false,
        lastActivities: activities,
        listsSchemaVersion: undefined,
        previousActivities: activities,
      })
    ).toEqual({
      forceListResync: true,
      shouldSyncCustomLists: true,
      shouldSyncFavorites: false,
      shouldSyncRatings: false,
      shouldSyncWatched: false,
      shouldSyncWatchlist: true,
    });
  });

  it('re-reads the watchlist and lists once more for a sync state from before episodes', () => {
    expect(
      getSyncSteps({
        bootstrap: false,
        lastActivities: activities,
        listsSchemaVersion: 1,
        previousActivities: activities,
      })
    ).toMatchObject({
      forceListResync: true,
      shouldSyncCustomLists: true,
      shouldSyncFavorites: false,
      shouldSyncRatings: false,
      shouldSyncWatched: false,
      shouldSyncWatchlist: true,
    });
    expect(TRAKT_LISTS_SCHEMA_VERSION).toBe(2);
  });

  it('stays incremental once the lists have been re-read', () => {
    expect(
      getSyncSteps({
        bootstrap: false,
        lastActivities: activities,
        listsSchemaVersion: TRAKT_LISTS_SCHEMA_VERSION,
        previousActivities: activities,
      })
    ).toMatchObject({
      forceListResync: false,
      shouldSyncCustomLists: false,
      shouldSyncWatchlist: false,
    });
  });

  it('still syncs a list group Trakt reports as changed', () => {
    expect(
      getSyncSteps({
        bootstrap: false,
        lastActivities: { ...activities, watchlist: { updated_at: '2024-02-01T00:00:00.000Z' } },
        listsSchemaVersion: TRAKT_LISTS_SCHEMA_VERSION,
        previousActivities: activities,
      })
    ).toMatchObject({ shouldSyncCustomLists: false, shouldSyncWatchlist: true });
  });
});

describe('watchlist cleanup of shows folded from seasons', () => {
  it('removes the folded show and keeps everything else', async () => {
    const listSet = jest.fn().mockResolvedValue(undefined);
    const seasonListedAt = new Date('2025-01-26T07:45:16.000Z').getTime();

    const result = await (__test__ as any).reconcileManagedList(
      'user-1',
      'watchlist',
      {
        'season-1396-2': {
          addedAt: seasonListedAt,
          id: 1396,
          media_type: 'season',
          season_number: 2,
          title: 'Breaking Bad · Season 2',
        },
      },
      { id: 'watchlist', name: 'Should Watch' },
      createDocSnapshotWithSet(
        'users/user-1/lists/watchlist',
        {
          items: {
            // Written by an earlier sync for Season 2: the show, at the season's time.
            'tv-1396': { addedAt: seasonListedAt, id: 1396, media_type: 'tv', title: 'Breaking Bad' },
            // Added in ShowSeek.
            'movie-27205': { addedAt: 5, id: 27205, media_type: 'movie', title: 'Inception' },
          },
          metadata: { itemCount: 2, needsEnrichment: false },
          name: 'Should Watch',
        },
        listSet
      ),
      { preserveLocalItems: true, recencyField: 'addedAt', removeFoldedSeasonShows: true }
    );

    const write = listSet.mock.calls[0][0];
    expect(write.items['tv-1396']).toBe('FIELD_DELETE');
    expect(write.items).not.toHaveProperty(['movie-27205']);
    expect(write.items['season-1396-2']).toEqual(expect.objectContaining({ media_type: 'season' }));
    expect(write.metadata.itemCount).toBe(2);
    expect(result.didRemoteChange).toBe(true);
  });
});

describe('enriching season entries', () => {
  const tmdbResponse = (body: unknown, status = 200) => ({
    headers: { get: () => null },
    json: jest.fn().mockResolvedValue(body),
    ok: status < 400,
    status,
  });
  const syncedSeason = (seasonNumber: number) => ({
    addedAt: 1,
    id: 1396,
    media_type: 'season',
    name: `Breaking Bad · Season ${seasonNumber}`,
    season_number: seasonNumber,
    show_name: 'Breaking Bad',
    title: `Breaking Bad · Season ${seasonNumber}`,
  });
  const show = {
    first_air_date: '2008-01-20',
    genres: [{ id: 18 }, { id: 80 }],
    name: 'Breaking Bad',
    poster_path: '/show.jpg',
    vote_average: 8.9,
  };

  it('flags synced seasons, but not seasons the app saved complete', () => {
    expect(needsMediaEnrichment(syncedSeason(2))).toBe(true);
    expect(
      needsMediaEnrichment({ ...syncedSeason(2), poster_path: null, season_name: 'Season 2' })
    ).toBe(false);
    expect(needsMediaEnrichment({ id: 1396, media_type: 'season' })).toBe(false);
  });

  it("fills in a show's seasons from one TMDB call", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      tmdbResponse({
        ...show,
        'season/0': { air_date: null, episodes: [], name: 'Specials', poster_path: null },
        'season/2': {
          air_date: '2009-03-08',
          episodes: [{ runtime: 47 }, { runtime: null }, { runtime: 48 }],
          name: 'Season 2',
          poster_path: '/s2.jpg',
          vote_average: 8.4,
        },
      })
    );

    const enriched = await enrichMediaItems({
      'season-1396-2': syncedSeason(2),
      'season-1396-0': syncedSeason(0),
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain(
      '/tv/1396?append_to_response=season/2,season/0'
    );
    expect(enriched['season-1396-2']).toMatchObject({
      first_air_date: '2009-03-08',
      genre_ids: [18, 80],
      poster_path: '/s2.jpg',
      release_date: '2009-03-08',
      runtimeMinutes: 95,
      season_name: 'Season 2',
      seasonRuntimeMinutes: 95,
      // The synced title stays, so the next sync doesn't see a change.
      title: 'Breaking Bad · Season 2',
      vote_average: 8.4,
    });
    expect(enriched['season-1396-0']).toMatchObject({
      poster_path: '/show.jpg',
      season_name: 'Specials',
      vote_average: 8.9,
    });
    expect(enriched['season-1396-0']).not.toHaveProperty('seasonRuntimeMinutes');
  });

  it("gives a season TMDB doesn't have the show's details, so it isn't looked up again", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(tmdbResponse(show));

    const enriched = await enrichMediaItem(syncedSeason(7));

    expect(enriched).toMatchObject({
      genre_ids: [18, 80],
      poster_path: '/show.jpg',
      season_name: 'Season 7',
      vote_average: 8.9,
    });
    expect(needsMediaEnrichment(enriched)).toBe(false);
  });

  it('falls back to separate calls when the combined call finds nothing', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(tmdbResponse({}, 404))
      .mockResolvedValueOnce(tmdbResponse(show))
      .mockResolvedValueOnce(tmdbResponse({ name: 'Season 3', poster_path: '/s3.jpg' }));

    const enriched = await enrichMediaItem(syncedSeason(3));

    expect((global.fetch as jest.Mock).mock.calls.map(([url]) => url.split('?')[0])).toEqual([
      expect.stringContaining('/tv/1396'),
      expect.stringContaining('/tv/1396'),
      expect.stringContaining('/tv/1396/season/3'),
    ]);
    expect(enriched).toMatchObject({ poster_path: '/s3.jpg', season_name: 'Season 3' });
  });

  it('moves season entries off a full list document like other entries', () => {
    const items = Object.fromEntries(
      Array.from({ length: 2500 }, (_, i) => [
        `movie-${i + 1}`,
        { id: i + 1, media_type: 'movie', title: `Movie ${i + 1}` },
      ])
    );
    const list = {
      items: { ...items, 'season-1396-2': syncedSeason(2) },
      layout: { overflowItemPages: {}, pageCount: 0, pageSizes: [2501] },
    };

    const result = planEnrichmentRelocation(list, {
      'season-1396-2': { ...syncedSeason(2), poster_path: '/s2.jpg', season_name: 'Season 2' },
    });

    expect(Object.keys(result.itemsToMove)).toEqual(['season-1396-2']);
    expect(result.removeFromListDocKeys).toEqual(['season-1396-2']);
  });
});

describe('Trakt episode entries', () => {
  const {
    buildWatchlistItemsMap,
    getTraktEpisodeRef,
    transformListItem,
  } = require('@/functions/src/trakt') as typeof import('@/functions/src/trakt');
  const { alignTraktEpisodeNumbers } =
    require('@/functions/src/trakt/episodeNumbers') as typeof import('@/functions/src/trakt/episodeNumbers');

  const show = { ids: { slug: 'breaking-bad', tmdb: 1396, trakt: 1 }, title: 'Breaking Bad', year: 2008 };
  const episodeEntry = (
    season: number,
    number: number,
    ids: Record<string, unknown> = { slug: 'e', trakt: 5 },
    listedAt = '2025-12-22T16:33:54.000Z'
  ) => ({
    episode: { ids, number, season, title: 'Phoenix' },
    id: 9,
    listed_at: listedAt,
    rank: 8,
    show,
    type: 'episode' as const,
  });

  describe('getTraktEpisodeRef', () => {
    it('reads the numbers of an episode entry, including zeros', () => {
      expect(getTraktEpisodeRef(episodeEntry(2, 12))).toEqual({ seasonNumber: 2, episodeNumber: 12 });
      expect(getTraktEpisodeRef(episodeEntry(0, 0))).toEqual({ seasonNumber: 0, episodeNumber: 0 });
    });

    it('ignores other entry types and episodes without usable numbers', () => {
      expect(getTraktEpisodeRef({ show, type: 'show' } as any)).toBeUndefined();
      expect(getTraktEpisodeRef({ ...episodeEntry(2, 12), type: 'show' })).toBeUndefined();
      expect(
        getTraktEpisodeRef({ episode: { number: 1.5, season: 2 }, type: 'episode' })
      ).toBeUndefined();
      expect(getTraktEpisodeRef({ episode: { season: 2 } })).toBeUndefined();
    });
  });

  it('keeps a watchlist episode as an episode entry, without an episode name', () => {
    const items = buildWatchlistItemsMap([
      episodeEntry(2, 12) as any,
      { id: 1, listed_at: '2025-01-01T00:00:00.000Z', rank: 1, show, type: 'show' },
    ]);

    expect(Object.keys(items).sort()).toEqual(['episode-1396-2-12', 'tv-1396']);
    expect(items['episode-1396-2-12']).toEqual({
      addedAt: new Date('2025-12-22T16:33:54.000Z').getTime(),
      episode_number: 12,
      id: 1396,
      media_type: 'episode',
      name: 'Breaking Bad · S2E12 · Phoenix',
      season_number: 2,
      show_name: 'Breaking Bad',
      title: 'Breaking Bad · S2E12 · Phoenix',
    });
  });

  it('transforms a custom list episode into an episode entry', () => {
    expect(transformListItem(episodeEntry(2, 12) as any)).toEqual({
      addedAt: new Date('2025-12-22T16:33:54.000Z').getTime(),
      episodeNumber: 12,
      mediaType: 'episode',
      seasonNumber: 2,
      showName: 'Breaking Bad',
      title: 'Breaking Bad · S2E12 · Phoenix',
      tmdbId: 1396,
    });
  });

  it('removes a watchlist show an earlier sync folded from an episode', async () => {
    const listSet = jest.fn().mockResolvedValue(undefined);
    const listedAt = new Date('2025-12-22T16:33:54.000Z').getTime();

    await (__test__ as any).reconcileManagedList(
      'user-1',
      'watchlist',
      buildWatchlistItemsMap([episodeEntry(2, 12) as any]),
      { id: 'watchlist', name: 'Should Watch' },
      createDocSnapshotWithSet(
        'users/user-1/lists/watchlist',
        {
          items: {
            // Written by an earlier sync for S2E12: the show, at the episode's time.
            'tv-1396': { addedAt: listedAt, id: 1396, media_type: 'tv', title: 'Breaking Bad' },
            'movie-27205': { addedAt: 5, id: 27205, media_type: 'movie', title: 'Inception' },
          },
          metadata: { itemCount: 2, needsEnrichment: false },
          name: 'Should Watch',
        },
        listSet
      ),
      { preserveLocalItems: true, recencyField: 'addedAt', removeFoldedSeasonShows: true }
    );

    const write = listSet.mock.calls[0][0];
    expect(write.items['tv-1396']).toBe('FIELD_DELETE');
    expect(write.items).not.toHaveProperty(['movie-27205']);
    expect(write.items['episode-1396-2-12']).toEqual(
      expect.objectContaining({ media_type: 'episode', episode_number: 12 })
    );
    expect(write.metadata.needsEnrichment).toBe(true);
  });

  describe('alignTraktEpisodeNumbers', () => {
    const lookup = (
      seasons: Record<string, { episodes: { id?: number; episode_number?: number; season_number?: number }[] } | null>,
      finds: Record<string, unknown> = {}
    ) => ({
      getSeason: jest.fn(async (tvId: number, s: number) => seasons[`${tvId}:${s}`] ?? null),
      findEpisode: jest.fn(async (id: string) => (finds[id] as any) ?? null),
    });

    it('makes no request without episode entries', async () => {
      const deps = lookup({});
      const items = [{ id: 1, listed_at: 'x', rank: 1, show, type: 'show' as const }];
      expect(await alignTraktEpisodeNumbers(items, { lookup: deps })).toBe(items);
      expect(deps.getSeason).not.toHaveBeenCalled();
    });

    it("keeps numbers TMDB confirms, with one season request per show and season", async () => {
      const deps = lookup({
        '1396:2': { episodes: [{ id: 62103, episode_number: 12 }, { id: 62104, episode_number: 13 }] },
      });
      const items = [episodeEntry(2, 12, { tmdb: 62103 }), episodeEntry(2, 13)];

      const aligned = await alignTraktEpisodeNumbers(items, { lookup: deps });

      expect(aligned).toEqual(items);
      expect(deps.getSeason).toHaveBeenCalledTimes(1);
      expect(deps.findEpisode).not.toHaveBeenCalled();
    });

    it("takes TMDB's numbers for Trakt's TMDB episode ID within the season", async () => {
      const deps = lookup({ '1396:1': { episodes: [{ id: 777, episode_number: 3, season_number: 1 }] } });

      const [aligned] = await alignTraktEpisodeNumbers([episodeEntry(1, 26, { tmdb: 777 })], { lookup: deps });

      expect(aligned.episode).toMatchObject({ number: 3, season: 1, title: 'Phoenix' });
    });

    it('finds an episode TMDB numbers differently by its TVDB, then IMDb, ID', async () => {
      const deps = lookup(
        { '1396:1': { episodes: [{ id: 1, episode_number: 1 }] } },
        {
          '4242': { tv_episode_results: [{ show_id: 999, season_number: 5, episode_number: 5 }] },
          tt42: { tv_episode_results: [{ show_id: 1396, season_number: 3, episode_number: 2 }] },
        }
      );

      const [aligned] = await alignTraktEpisodeNumbers(
        [episodeEntry(1, 64, { imdb: 'tt42', tvdb: 4242 })],
        { lookup: deps }
      );

      // The TVDB match belongs to another show, so the IMDb one is used.
      expect(deps.findEpisode.mock.calls).toEqual([
        ['4242', 'tvdb_id'],
        ['tt42', 'imdb_id'],
      ]);
      expect(aligned.episode).toMatchObject({ number: 2, season: 3 });
    });

    const asShow = (item: ReturnType<typeof episodeEntry>) => {
      const { episode: _episode, ...rest } = item;
      return { ...rest, type: 'show' };
    };

    it('saves an episode TMDB has nowhere as its show, so it always opens', async () => {
      const deps = lookup({ '1396:9': { episodes: [{ id: 5, episode_number: 2 }] } });
      const item = episodeEntry(9, 1, { tvdb: 1 });

      expect(await alignTraktEpisodeNumbers([item], { lookup: deps })).toEqual([asShow(item)]);
    });

    it("keeps Trakt's numbers when TMDB has an episode there and nothing says otherwise", async () => {
      const deps = lookup({ '1396:2': { episodes: [{ id: 999, episode_number: 12 }] } });
      // Trakt's TMDB ID isn't in the season and /find knows nothing better.
      const item = episodeEntry(2, 12, { tmdb: 62103, tvdb: 7 });

      expect(await alignTraktEpisodeNumbers([item], { lookup: deps })).toEqual([item]);
      expect(deps.findEpisode).toHaveBeenCalledWith('7', 'tvdb_id');
    });

    it('drops the show entry when Trakt lists the show itself, or another episode became it', async () => {
      const deps = lookup({});
      const showItem = { id: 1, listed_at: 'x', rank: 1, show, type: 'show' as const };
      const missingA = episodeEntry(9, 1);
      const missingB = episodeEntry(9, 2);

      expect(await alignTraktEpisodeNumbers([missingA, missingB], { lookup: deps })).toEqual([asShow(missingA)]);
      expect(await alignTraktEpisodeNumbers([missingA, showItem], { lookup: deps })).toEqual([showItem]);
    });

    it('retries a rate-limited lookup before giving up', async () => {
      const { TraktSyncError: SyncError } = require('@/functions/src/trakt/types');
      const getSeason = jest
        .fn()
        .mockRejectedValueOnce(
          new SyncError('rate limited', 'rate_limited', true, { retryAfterSeconds: 0 })
        )
        .mockResolvedValueOnce({ episodes: [{ id: 62103, episode_number: 12 }] });
      const item = episodeEntry(2, 12, { tmdb: 62103 });

      expect(
        await alignTraktEpisodeNumbers([item], { lookup: { getSeason, findEpisode: jest.fn() } })
      ).toEqual([item]);
      expect(getSeason).toHaveBeenCalledTimes(2);
    });

    it('saves episodes as their show once a lookup fails or the budget runs out', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const failing = {
        getSeason: jest.fn(async () => {
          throw new Error('TMDB is down');
        }),
        findEpisode: jest.fn(async () => null),
      };
      const items = [episodeEntry(1, 64, { tvdb: 1 }), episodeEntry(2, 5, { tvdb: 2 })];

      // Both become the same show, kept once.
      expect(await alignTraktEpisodeNumbers(items, { lookup: failing })).toEqual([asShow(items[0])]);
      expect(failing.getSeason).toHaveBeenCalledTimes(1);
      expect(failing.findEpisode).not.toHaveBeenCalled();

      // The first episode is confirmed; the budget then runs out, so the second is the show.
      const budgeted = lookup({ '1396:1': { episodes: [{ id: 1, episode_number: 64 }] } });
      expect(await alignTraktEpisodeNumbers(items, { lookup: budgeted, maxLookups: 1 })).toEqual([
        items[0],
        asShow(items[1]),
      ]);
      expect(budgeted.getSeason).toHaveBeenCalledTimes(1);
      warnSpy.mockRestore();
    });

    it('saves every episode as its show, with no TMDB request, when episodes are off', async () => {
      const deps = lookup({ '1396:2': { episodes: [{ id: 62103, episode_number: 12 }] } });
      const item = episodeEntry(2, 12, { tmdb: 62103 });

      expect(
        await alignTraktEpisodeNumbers([item], { keepEpisodes: false, lookup: deps })
      ).toEqual([asShow(item)]);
      expect(deps.getSeason).not.toHaveBeenCalled();
    });

    it('turns a show entry folded from an unconfirmed episode into the episode once confirmed', async () => {
      const listSet = jest.fn().mockResolvedValue(undefined);
      const item = episodeEntry(2, 12, { tmdb: 62103 });
      const listedAt = new Date(item.listed_at).getTime();
      const confirmed = await alignTraktEpisodeNumbers([item], {
        lookup: lookup({ '1396:2': { episodes: [{ id: 62103, episode_number: 12 }] } }),
      });

      await (__test__ as any).reconcileManagedList(
        'user-1',
        'watchlist',
        buildWatchlistItemsMap(confirmed as any),
        { id: 'watchlist', name: 'Should Watch' },
        createDocSnapshotWithSet(
          'users/user-1/lists/watchlist',
          {
            // Saved as the show by an earlier sync that couldn't confirm the episode.
            items: { 'tv-1396': { addedAt: listedAt, id: 1396, media_type: 'tv' } },
            metadata: { itemCount: 1, needsEnrichment: false },
            name: 'Should Watch',
          },
          listSet
        ),
        { preserveLocalItems: true, recencyField: 'addedAt', removeFoldedSeasonShows: true }
      );

      const write = listSet.mock.calls[0][0];
      expect(write.items['tv-1396']).toBe('FIELD_DELETE');
      expect(write.items['episode-1396-2-12']).toEqual(
        expect.objectContaining({ media_type: 'episode' })
      );
    });
  });

  describe('enriching episode entries', () => {
    const tmdbResponse = (body: unknown, status = 200) => ({
      headers: { get: () => null },
      json: jest.fn().mockResolvedValue(body),
      ok: status < 400,
      status,
    });
    const syncedEpisode = (s: number, e: number) => ({
      addedAt: 1,
      episode_number: e,
      id: 1396,
      media_type: 'episode',
      name: `Breaking Bad · S${s}E${e}`,
      season_number: s,
      show_name: 'Breaking Bad',
      title: `Breaking Bad · S${s}E${e}`,
    });
    const tmdbShow = {
      first_air_date: '2008-01-20',
      genres: [{ id: 18 }],
      name: 'Breaking Bad',
      poster_path: '/show.jpg',
      vote_average: 8.9,
    };

    it('flags synced episodes, but not episodes the app saved complete', () => {
      expect(needsMediaEnrichment(syncedEpisode(2, 12))).toBe(true);
      expect(
        needsMediaEnrichment({ ...syncedEpisode(2, 12), poster_path: null, episode_name: 'Phoenix' })
      ).toBe(false);
      expect(needsMediaEnrichment({ id: 1396, media_type: 'episode', season_number: 2 })).toBe(false);
    });

    it("fills in a show's episodes and seasons from one TMDB call", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        tmdbResponse({
          ...tmdbShow,
          'season/2': {
            air_date: '2009-03-08',
            episodes: [
              {
                air_date: '2009-05-24',
                episode_number: 12,
                name: 'Phoenix',
                runtime: 47,
                still_path: '/phoenix.jpg',
                vote_average: 9.1,
              },
            ],
            name: 'Season 2',
            poster_path: '/s2.jpg',
          },
        })
      );

      const enriched = await enrichMediaItems({
        'episode-1396-2-12': syncedEpisode(2, 12),
        'episode-1396-2-99': syncedEpisode(2, 99),
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain(
        '/tv/1396?append_to_response=season/2'
      );
      expect(enriched['episode-1396-2-12']).toMatchObject({
        episode_name: 'Phoenix',
        episodeRuntimeMinutes: 47,
        first_air_date: '2009-05-24',
        genre_ids: [18],
        poster_path: '/s2.jpg',
        release_date: '2009-05-24',
        runtimeMinutes: 47,
        still_path: '/phoenix.jpg',
        // The synced title stays, so the next sync doesn't see a change.
        title: 'Breaking Bad · S2E12',
        vote_average: 9.1,
      });
      // An episode TMDB doesn't have gets the show's details, so it isn't looked up again.
      expect(enriched['episode-1396-2-99']).toMatchObject({
        episode_name: 'Episode 99',
        poster_path: '/s2.jpg',
        still_path: null,
        vote_average: 8.9,
      });
      expect(needsMediaEnrichment(enriched['episode-1396-2-99'])).toBe(false);
    });
  });
});

describe('episode list entries rollout', () => {
  const { canHaveEpisodeListEntries } =
    require('@/functions/src/episodeListRollout') as typeof import('@/functions/src/episodeListRollout');
  const { getTraktListsSchemaVersion } =
    require('@/functions/src/trakt/sync') as typeof import('@/functions/src/trakt/sync');
  const { prepareTraktEpisodeEntries } =
    require('@/functions/src/trakt/episodeNumbers') as typeof import('@/functions/src/trakt/episodeNumbers');
  const originalValue = process.env.EPISODE_LIST_ENTRIES_UIDS;

  afterEach(() => {
    if (originalValue === undefined) delete process.env.EPISODE_LIST_ENTRIES_UIDS;
    else process.env.EPISODE_LIST_ENTRIES_UIDS = originalValue;
  });

  it('is on only for listed accounts, or everyone with *', () => {
    delete process.env.EPISODE_LIST_ENTRIES_UIDS;
    expect(canHaveEpisodeListEntries('tester')).toBe(false);

    process.env.EPISODE_LIST_ENTRIES_UIDS = ' other , tester ';
    expect(canHaveEpisodeListEntries('tester')).toBe(true);
    expect(canHaveEpisodeListEntries('someone-else')).toBe(false);

    process.env.EPISODE_LIST_ENTRIES_UIDS = '*';
    expect(canHaveEpisodeListEntries('someone-else')).toBe(true);
  });

  it('keeps everyone else on the seasons-only lists schema, so they re-read at release', () => {
    process.env.EPISODE_LIST_ENTRIES_UIDS = 'tester';
    expect(getTraktListsSchemaVersion('tester')).toBe(TRAKT_LISTS_SCHEMA_VERSION);
    expect(getTraktListsSchemaVersion('someone-else')).toBe(1);

    const activities = { lists: { updated_at: 'a' }, watchlist: { updated_at: 'b' } };
    // A user already re-read for seasons stays incremental while episodes are off for them.
    expect(
      getSyncSteps({
        bootstrap: false,
        lastActivities: activities,
        listsSchemaVersion: 1,
        previousActivities: activities,
        targetListsSchemaVersion: getTraktListsSchemaVersion('someone-else'),
      })
    ).toMatchObject({ forceListResync: false });
    // The tester's lists are re-read once for episodes.
    expect(
      getSyncSteps({
        bootstrap: false,
        lastActivities: activities,
        listsSchemaVersion: 1,
        previousActivities: activities,
        targetListsSchemaVersion: getTraktListsSchemaVersion('tester'),
      })
    ).toMatchObject({ forceListResync: true });
  });

  it("saves other accounts' Trakt episodes as their show without calling TMDB", async () => {
    process.env.EPISODE_LIST_ENTRIES_UIDS = 'tester';
    const show = { ids: { slug: 'bb', tmdb: 1396, trakt: 1 }, title: 'Breaking Bad', year: 2008 };
    const episode = {
      episode: { ids: { slug: 'e', tmdb: 62103, trakt: 5 }, number: 12, season: 2, title: 'Phoenix' },
      id: 9,
      listed_at: '2025-12-22T16:33:54.000Z',
      rank: 1,
      show,
      type: 'episode' as const,
    };
    (global.fetch as jest.Mock).mockClear();

    const [prepared] = await prepareTraktEpisodeEntries('someone-else', [episode]);

    expect(prepared).toMatchObject({ show, type: 'show' });
    expect(prepared).not.toHaveProperty('episode');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
