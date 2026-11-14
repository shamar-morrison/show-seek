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
  cloneData,
  createResponse,
  DAY_MS,
  firestoreFn,
  mockEnqueue,
  MockTimestamp,
  mockVerifyIdToken,
  resetTraktMocks,
} from './helpers/traktHarness';

beforeEach(resetTraktMocks);

const connectedUser = (extra: Record<string, unknown> = {}) => ({
  traktAccessToken: 'token',
  traktConnected: true,
  ...extra,
});

const completedSyncStatus = (nextAllowedSyncAt: MockTimestamp) => ({
  lastSyncedAt: MockTimestamp.fromMillis(Date.now() - 30_000),
  nextAllowedSyncAt,
  runId: 'completed-run',
  status: 'completed',
});

const rateLimitedSyncStatus = (nextAllowedSyncAt: MockTimestamp) => ({
  errorCategory: 'rate_limited',
  lastSyncedAt: MockTimestamp.fromMillis(Date.now() - 30_000),
  nextAllowedSyncAt,
  runId: 'failed-run',
  status: 'failed',
});

/** Serves `userData` from the sync transaction and records its writes. */
const mockSyncTransaction = (userData: Record<string, unknown>, uid = 'user-1') => {
  const transactionSet = jest.fn((_ref: unknown, data: unknown) => assertNoUndefined(data));
  const userRef = {
    collection: jest.fn((name: string) => {
      if (name !== 'traktSyncRuns') {
        throw new Error(`Unexpected subcollection ${name}`);
      }

      return {
        doc: jest.fn((id?: string) => ({
          id: id ?? 'run-1',
          path: `users/${uid}/traktSyncRuns/${id ?? 'run-1'}`,
        })),
      };
    }),
    path: `users/${uid}`,
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
        get: jest.fn().mockResolvedValue({ data: () => cloneData(userData) }),
        set: transactionSet,
      })
    ),
  }));

  return { transactionSet };
};

const postSync = async ({ devSync = false } = {}) => {
  const response = createResponse();

  await (traktApi as any)(
    {
      body: {},
      header: (name: string) => {
        const normalized = name.toLowerCase();
        if (normalized === 'authorization') return 'Bearer token';
        if (devSync && normalized === 'x-showseek-dev-sync') return 'true';
        return undefined;
      },
      method: 'POST',
      path: '/sync',
    },
    response
  );

  return response;
};

const withFunctionsEmulator = async <T>(run: () => Promise<T>): Promise<T> => {
  const originalFunctionsEmulator = process.env.FUNCTIONS_EMULATOR;
  process.env.FUNCTIONS_EMULATOR = 'true';

  try {
    return await run();
  } finally {
    if (originalFunctionsEmulator === undefined) {
      delete process.env.FUNCTIONS_EMULATOR;
    } else {
      process.env.FUNCTIONS_EMULATOR = originalFunctionsEmulator;
    }
  }
};

const expectQueued = (
  response: ReturnType<typeof createResponse>,
  transactionSet: jest.Mock,
  userId = 'user-1'
) => {
  expect(transactionSet).toHaveBeenCalledTimes(2);
  expect(mockEnqueue).toHaveBeenCalledWith(
    { runId: 'run-1', userId },
    expect.objectContaining({ id: 'run-1' })
  );
  expect(response.status).toHaveBeenCalledWith(202);
};

const expectCooldownRejected = (
  response: ReturnType<typeof createResponse>,
  transactionSet: jest.Mock,
  nextAllowedSyncAt: MockTimestamp
) => {
  expect(transactionSet).not.toHaveBeenCalled();
  expect(mockEnqueue).not.toHaveBeenCalled();
  expect(response.status).toHaveBeenCalledWith(429);
  expect(response.json).toHaveBeenCalledWith(
    expect.objectContaining({
      errorCategory: 'rate_limited',
      nextAllowedSyncAt: nextAllowedSyncAt.toDate().toISOString(),
    })
  );
};

describe('Trakt sync Firestore sanitization', () => {
  it('queues a first-time sync without writing undefined lastSyncedAt values', async () => {
    const { transactionSet } = mockSyncTransaction(connectedUser());

    const response = await postSync();

    expectQueued(response, transactionSet);
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
    const { transactionSet } = mockSyncTransaction(
      connectedUser({
        traktZipImportStatus: {
          createdAt: recentTime,
          id: 'zip_1',
          status: 'pending',
          updatedAt: recentTime,
        },
      })
    );

    const response = await postSync();

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
    const { transactionSet } = mockSyncTransaction(
      connectedUser({
        traktZipImportStatus: {
          createdAt: staleTime,
          id: 'zip_stale',
          status: 'pending',
          updatedAt: staleTime,
        },
      })
    );

    const response = await postSync();

    expectQueued(response, transactionSet);
  });

  it('allows a new sync after a non-rate-limited failure even if a cooldown timestamp still exists', async () => {
    const { transactionSet } = mockSyncTransaction(
      connectedUser({
        traktSyncStatus: {
          errorCategory: 'upstream_unavailable',
          nextAllowedSyncAt: MockTimestamp.fromMillis(Date.now() + 60_000),
          runId: 'failed-run',
          status: 'failed',
        },
      })
    );

    const response = await postSync();

    expect(mockEnqueue).toHaveBeenCalledWith(
      { runId: 'run-1', userId: 'user-1' },
      expect.objectContaining({ id: 'run-1' })
    );
    expect(response.status).toHaveBeenCalledWith(202);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-1', status: 'queued' })
    );

    const userStatusWriteCall = transactionSet.mock.calls.find(
      ([_ref, data]) => data && typeof data === 'object' && 'traktSyncStatus' in data
    ) as [unknown, { traktSyncStatus: Record<string, unknown> }] | undefined;

    expect(userStatusWriteCall?.[1].traktSyncStatus).toBeDefined();
    expect(userStatusWriteCall?.[1].traktSyncStatus.nextAllowedSyncAt).toBeUndefined();
  });

  it('keeps the manual cooldown after a successful sync until the next allowed time', async () => {
    const futureCooldown = MockTimestamp.fromMillis(Date.now() + DAY_MS);
    const { transactionSet } = mockSyncTransaction(
      connectedUser({ traktSyncStatus: completedSyncStatus(futureCooldown) })
    );

    const response = await postSync();

    expectCooldownRejected(response, transactionSet, futureCooldown);
  });

  it('bypasses the manual sync cooldown in the functions emulator when the dev header is present', async () => {
    const futureCooldown = MockTimestamp.fromMillis(Date.now() + DAY_MS);
    const { transactionSet } = mockSyncTransaction(
      connectedUser({ traktSyncStatus: completedSyncStatus(futureCooldown) })
    );

    const response = await withFunctionsEmulator(() => postSync({ devSync: true }));

    expectQueued(response, transactionSet);
  });

  it('bypasses the manual sync cooldown on deployed functions for allowlisted testers when the dev header is present', async () => {
    process.env.TRAKT_SYNC_BYPASS_UIDS = 'tester-1, tester-2';
    mockVerifyIdToken.mockResolvedValue({ uid: 'tester-1' });

    const futureCooldown = MockTimestamp.fromMillis(Date.now() + DAY_MS);
    const { transactionSet } = mockSyncTransaction(
      connectedUser({ traktSyncStatus: completedSyncStatus(futureCooldown) }),
      'tester-1'
    );
    const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);

    try {
      const response = await postSync({ devSync: true });

      expectQueued(response, transactionSet, 'tester-1');
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
    const { transactionSet } = mockSyncTransaction(
      connectedUser({ traktSyncStatus: completedSyncStatus(futureCooldown) }),
      'tester-1'
    );

    const response = await postSync({ devSync: true });

    expectCooldownRejected(response, transactionSet, futureCooldown);
  });

  it('keeps the manual cooldown on deployed functions for allowlisted testers when the dev header is absent', async () => {
    process.env.TRAKT_SYNC_BYPASS_UIDS = 'tester-1';
    mockVerifyIdToken.mockResolvedValue({ uid: 'tester-1' });

    const futureCooldown = MockTimestamp.fromMillis(Date.now() + DAY_MS);
    const { transactionSet } = mockSyncTransaction(
      connectedUser({ traktSyncStatus: completedSyncStatus(futureCooldown) }),
      'tester-1'
    );

    const response = await postSync();

    expectCooldownRejected(response, transactionSet, futureCooldown);
  });

  it('keeps upstream rate-limit cooldowns enforced in the functions emulator even when the dev header is present', async () => {
    const futureCooldown = MockTimestamp.fromMillis(Date.now() + DAY_MS);
    const { transactionSet } = mockSyncTransaction(
      connectedUser({ traktSyncStatus: rateLimitedSyncStatus(futureCooldown) })
    );

    const response = await withFunctionsEmulator(() => postSync({ devSync: true }));

    expectCooldownRejected(response, transactionSet, futureCooldown);
  });

  it('keeps upstream rate-limit cooldowns enforced on deployed functions for allowlisted testers', async () => {
    process.env.TRAKT_SYNC_BYPASS_UIDS = 'tester-1';
    mockVerifyIdToken.mockResolvedValue({ uid: 'tester-1' });

    const futureCooldown = MockTimestamp.fromMillis(Date.now() + DAY_MS);
    const { transactionSet } = mockSyncTransaction(
      connectedUser({ traktSyncStatus: rateLimitedSyncStatus(futureCooldown) }),
      'tester-1'
    );

    const response = await postSync({ devSync: true });

    expectCooldownRejected(response, transactionSet, futureCooldown);
  });

  it('reflects allowed origins for CORS preflight requests', async () => {
    process.env.TRAKT_ALLOWED_ORIGINS = 'https://allowed.example, https://other.example';
    const response = createResponse();

    await (traktApi as any)(
      {
        header: (name: string) =>
          name.toLowerCase() === 'origin' ? 'https://allowed.example' : undefined,
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
        header: (name: string) =>
          name.toLowerCase() === 'origin' ? 'https://blocked.example' : undefined,
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
