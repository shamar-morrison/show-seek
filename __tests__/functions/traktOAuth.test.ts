/**
 * Trakt OAuth: token exchange requests and invalid_grant handling.
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

import {
  clearTraktTokensIfRefreshTokenUnchanged,
  createOAuthState,
  exchangeAuthorizationCode,
  normalizeSyncError,
  refreshAccessToken,
  requestOAuthToken,
  runTraktSync,
  TRAKT_INVALID_GRANT_MESSAGE,
  TRAKT_OAUTH_STATE_TTL_MS,
  traktApi,
  traktCallback,
  TraktOAuthError,
} from '@/functions/src/trakt';
import {
  createResponse,
  firestoreFn,
  MockTimestamp,
  resetTraktMocks,
} from './helpers/traktHarness';

beforeEach(resetTraktMocks);

describe('Trakt sync Firestore sanitization', () => {
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
