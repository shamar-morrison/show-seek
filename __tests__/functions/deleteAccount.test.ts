let secretValues: Record<string, string> = {
  TRAKT_BACKEND_URL: 'https://trakt-proxy.example.com',
  TRAKT_INTERNAL_DELETE_AUTH: 'secret-token',
};

const mockDefineSecret = jest.fn((name: string) => ({
  value: () => secretValues[name] ?? '',
}));
const mockDeleteUser = jest.fn();
const firestoreFn: any = jest.fn();

jest.mock(
  'firebase-functions/params',
  () => ({
    defineSecret: mockDefineSecret,
  }),
  { virtual: true }
);

jest.mock(
  'firebase-admin',
  () => ({
    initializeApp: jest.fn(),
    auth: jest.fn(() => ({
      deleteUser: mockDeleteUser,
    })),
    firestore: firestoreFn,
  }),
  { virtual: true }
);

import { deleteAccountHandler } from '@/functions/src/accountDeletion';

const mockFetch = jest.fn();
const mockRecursiveDelete = jest.fn();
const mockBulkWriterDelete = jest.fn();
const mockBulkWriterClose = jest.fn();
const mockWhereGet = jest.fn();

const createTimeoutError = () => {
  const error = new Error('timed out');
  error.name = 'TimeoutError';
  return error;
};

beforeAll(() => {
  Object.defineProperty(global, 'fetch', {
    configurable: true,
    value: mockFetch,
    writable: true,
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  secretValues = {
    TRAKT_BACKEND_URL: 'https://trakt-proxy.example.com',
    TRAKT_INTERNAL_DELETE_AUTH: 'secret-token',
  };

  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    text: jest.fn().mockResolvedValue(''),
  });
  mockDeleteUser.mockResolvedValue(undefined);
  mockRecursiveDelete.mockResolvedValue(undefined);
  mockBulkWriterClose.mockResolvedValue(undefined);
  mockWhereGet.mockResolvedValue({
    docs: [],
    empty: true,
  });

  const mockBulkWriter = {
    close: mockBulkWriterClose,
    delete: mockBulkWriterDelete,
  };

  const mockUsersDocRef = { path: 'users/user-1' };
  const mockUsersCollection = {
    doc: jest.fn(() => mockUsersDocRef),
  };
  const mockWebhookCollection = {
    where: jest.fn(() => ({
      get: mockWhereGet,
    })),
  };

  firestoreFn.mockImplementation(() => ({
    bulkWriter: jest.fn(() => mockBulkWriter),
    collection: jest.fn((name: string) => {
      if (name === 'users') {
        return mockUsersCollection;
      }

      if (name === 'revenuecatWebhookEvents') {
        return mockWebhookCollection;
      }

      throw new Error(`Unexpected collection ${name}`);
    }),
    recursiveDelete: mockRecursiveDelete,
  }));
});

describe('deleteAccountHandler', () => {
  it('rejects unauthenticated callers', async () => {
    await expect(deleteAccountHandler({ auth: undefined })).rejects.toMatchObject({
      code: 'unauthenticated',
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('deletes Trakt data, Firestore data, and the auth user for a member account', async () => {
    await expect(
      deleteAccountHandler({
        auth: { uid: 'user-1' },
      })
    ).resolves.toEqual({ success: true });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://trakt-proxy.example.com/api/trakt/delete-user',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer secret-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: 'user-1' }),
        signal: expect.any(Object),
      })
    );
    expect(mockFetch.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(mockRecursiveDelete).toHaveBeenCalledTimes(1);
    expect(mockDeleteUser).toHaveBeenCalledWith('user-1');
    expect(mockFetch.mock.invocationCallOrder[0]).toBeLessThan(
      mockRecursiveDelete.mock.invocationCallOrder[0]
    );
    expect(mockRecursiveDelete.mock.invocationCallOrder[0]).toBeLessThan(
      mockDeleteUser.mock.invocationCallOrder[0]
    );
  });

  it('allows anonymous Firebase accounts to delete successfully', async () => {
    await expect(
      deleteAccountHandler({
        auth: { uid: 'anon-user' },
      })
    ).resolves.toEqual({ success: true });

    expect(mockDeleteUser).toHaveBeenCalledWith('anon-user');
  });

  it('prevents Firestore and auth deletion when Trakt cleanup fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValue('backend down'),
    });

    await expect(
      deleteAccountHandler({
        auth: { uid: 'user-1' },
      })
    ).rejects.toMatchObject({
      code: 'internal',
      message: 'Trakt account cleanup failed with status 500.',
    });

    expect(mockRecursiveDelete).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('returns a retryable timeout error when Trakt cleanup hangs and skips further deletion', async () => {
    mockFetch.mockRejectedValue(createTimeoutError());

    await expect(
      deleteAccountHandler({
        auth: { uid: 'user-1' },
      })
    ).rejects.toMatchObject({
      code: 'unavailable',
      message: 'Trakt account cleanup timed out. Please retry.',
      details: {
        endpoint: 'https://trakt-proxy.example.com/api/trakt/delete-user',
        timeoutMs: 15000,
      },
    });

    expect(mockRecursiveDelete).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('returns a retryable unavailable error when Trakt cleanup fails due to a network TypeError', async () => {
    mockFetch.mockRejectedValue(new TypeError('fetch failed'));

    await expect(
      deleteAccountHandler({
        auth: { uid: 'user-1' },
      })
    ).rejects.toMatchObject({
      code: 'unavailable',
      message: 'Trakt account cleanup failed due to network error. Please retry.',
      details: {
        endpoint: 'https://trakt-proxy.example.com/api/trakt/delete-user',
        timeoutMs: 15000,
        networkError: 'TypeError: fetch failed',
      },
    });

    expect(mockRecursiveDelete).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('treats an already-missing auth user as a successful retry', async () => {
    mockDeleteUser.mockRejectedValue({
      code: 'auth/user-not-found',
    });

    await expect(
      deleteAccountHandler({
        auth: { uid: 'user-1' },
      })
    ).resolves.toEqual({ success: true });

    expect(mockRecursiveDelete).toHaveBeenCalledTimes(1);
    expect(mockDeleteUser).toHaveBeenCalledWith('user-1');
  });

  it('deletes matching RevenueCat webhook event records alongside the account', async () => {
    const firstRef = { id: 'evt-1' };
    const secondRef = { id: 'evt-2' };
    mockWhereGet.mockResolvedValue({
      docs: [{ ref: firstRef }, { ref: secondRef }],
      empty: false,
    });

    await expect(
      deleteAccountHandler({
        auth: { uid: 'user-1' },
      })
    ).resolves.toEqual({ success: true });

    expect(mockBulkWriterDelete).toHaveBeenNthCalledWith(1, firstRef);
    expect(mockBulkWriterDelete).toHaveBeenNthCalledWith(2, secondRef);
    expect(mockBulkWriterClose).toHaveBeenCalledTimes(1);
  });
});
