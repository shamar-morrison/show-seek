/**
 * Trakt POST /sync endpoint: queueing, manual and upstream cooldowns, tester bypass,
 * active zip imports and CORS.
 */
jest.mock(
  'firebase-functions/params',
  () => jest.requireActual('./helpers/traktHarness').paramsModule,
  { virtual: true }
);
jest.mock(
  'firebase-functions/v2/https',
  () => jest.requireActual('./helpers/traktHarness').httpsModule,
  { virtual: true }
);
jest.mock(
  'firebase-functions/v2/tasks',
  () => jest.requireActual('./helpers/traktHarness').tasksModule,
  { virtual: true }
);
jest.mock(
  'firebase-admin/firestore',
  () => jest.requireActual('./helpers/traktHarness').firestoreModule,
  { virtual: true }
);
jest.mock(
  'firebase-admin/functions',
  () => jest.requireActual('./helpers/traktHarness').functionsModule,
  { virtual: true }
);
jest.mock(
  'firebase-admin',
  () => jest.requireActual('./helpers/traktHarness').firebaseAdminModule,
  { virtual: true }
);

import { traktApi } from '@/functions/src/trakt';
import {
  assertNoUndefined,
  createResponse,
  DAY_MS,
  firestoreFn,
  mockEnqueue,
  MockTimestamp,
  mockVerifyIdToken,
  resetTraktMocks,
} from './helpers/traktHarness';

beforeEach(resetTraktMocks);

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
