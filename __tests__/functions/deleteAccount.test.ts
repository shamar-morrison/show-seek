const mockDeleteUser = jest.fn();
const firestoreFn: jest.Mock = jest.fn();

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

import {
  deleteAccountHandler,
  isPolarDeleteBlocked,
  POLAR_SUBSCRIPTION_ACTIVE_REASON,
} from '@/functions/src/accountDeletion';

const mockRecursiveDelete = jest.fn();
const mockBulkWriterDelete = jest.fn();
const mockBulkWriterClose = jest.fn();
const mockRevenueCatWhereGet = jest.fn();
const mockTraktOAuthStatesGet = jest.fn();
const mockUserDocGet = jest.fn();
const mockUsersDoc = jest.fn((id: string) => ({ get: mockUserDocGet, path: `users/${id}` }));
const mockTraktOAuthStatesLimit = jest.fn(() => ({
  get: mockTraktOAuthStatesGet,
}));

beforeEach(() => {
  jest.clearAllMocks();

  mockDeleteUser.mockResolvedValue(undefined);
  mockRecursiveDelete.mockResolvedValue(undefined);
  mockBulkWriterClose.mockResolvedValue(undefined);
  mockRevenueCatWhereGet.mockResolvedValue({
    docs: [],
    empty: true,
  });
  mockTraktOAuthStatesGet.mockResolvedValue({
    docs: [],
    empty: true,
  });
  mockUserDocGet.mockResolvedValue({
    data: () => undefined,
    exists: false,
  });

  const mockBulkWriter = {
    close: mockBulkWriterClose,
    delete: mockBulkWriterDelete,
  };
  const mockUsersCollection = {
    doc: mockUsersDoc,
  };
  const mockWebhookCollection = {
    where: jest.fn(() => ({
      get: mockRevenueCatWhereGet,
    })),
  };
  const mockTraktOAuthStatesCollection = {
    where: jest.fn(() => ({
      limit: mockTraktOAuthStatesLimit,
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

      if (name === 'traktOAuthStates') {
        return mockTraktOAuthStatesCollection;
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

    expect(mockRecursiveDelete).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('deletes Firestore data and the auth user for a member account', async () => {
    await expect(
      deleteAccountHandler({
        auth: { uid: 'user-1' },
      })
    ).resolves.toEqual({ success: true });

    expect(mockRecursiveDelete).toHaveBeenCalledTimes(1);
    expect(mockUsersDoc).toHaveBeenCalledWith('user-1');
    expect(mockRecursiveDelete).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'users/user-1' })
    );
    expect(mockDeleteUser).toHaveBeenCalledWith('user-1');
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

    expect(mockRecursiveDelete).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'users/anon-user' })
    );
    expect(mockDeleteUser).toHaveBeenCalledWith('anon-user');
  });

  it('stops before auth deletion when recursive Firestore deletion fails', async () => {
    const firestoreError = new Error('recursive delete failed');
    mockRecursiveDelete.mockRejectedValue(firestoreError);

    await expect(
      deleteAccountHandler({
        auth: { uid: 'user-1' },
      })
    ).rejects.toBe(firestoreError);

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

  it('rethrows unexpected auth deletion errors', async () => {
    const authError = new Error('auth delete failed');
    mockDeleteUser.mockRejectedValue(authError);

    await expect(
      deleteAccountHandler({
        auth: { uid: 'user-1' },
      })
    ).rejects.toBe(authError);

    expect(mockRecursiveDelete).toHaveBeenCalledTimes(1);
  });

  it('deletes matching RevenueCat webhook event records alongside the account', async () => {
    const firstRef = { id: 'evt-1' };
    const secondRef = { id: 'evt-2' };
    mockRevenueCatWhereGet.mockResolvedValue({
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

  it('deletes trakt OAuth states in batches until none remain', async () => {
    const firstStateRef = { id: 'state-1' };
    const secondStateRef = { id: 'state-2' };
    const thirdStateRef = { id: 'state-3' };

    mockTraktOAuthStatesGet
      .mockResolvedValueOnce({
        docs: [{ ref: firstStateRef }, { ref: secondStateRef }],
        empty: false,
      })
      .mockResolvedValueOnce({
        docs: [{ ref: thirdStateRef }],
        empty: false,
      })
      .mockResolvedValueOnce({
        docs: [],
        empty: true,
      });

    await expect(
      deleteAccountHandler({
        auth: { uid: 'user-1' },
      })
    ).resolves.toEqual({ success: true });

    expect(mockTraktOAuthStatesGet).toHaveBeenCalledTimes(3);
    expect(mockBulkWriterDelete).toHaveBeenNthCalledWith(1, firstStateRef);
    expect(mockBulkWriterDelete).toHaveBeenNthCalledWith(2, secondStateRef);
    expect(mockBulkWriterDelete).toHaveBeenNthCalledWith(3, thirdStateRef);
    expect(mockBulkWriterClose).toHaveBeenCalledTimes(2);
  });

  it('blocks deletion for an active Polar subscription with a matchable reason', async () => {
    mockUserDocGet.mockResolvedValue({
      data: () => ({
        premium: { isPremium: true, provider: 'polar', subscriptionState: 'ACTIVE' },
      }),
      exists: true,
    });

    const error = await deleteAccountHandler({ auth: { uid: 'user-1' } }).catch(
      (err) => err
    );

    expect(error).toMatchObject({
      code: 'failed-precondition',
      details: { reason: POLAR_SUBSCRIPTION_ACTIVE_REASON },
    });
    expect(mockRecursiveDelete).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('blocks deletion for a Polar subscription with missing state (fail-closed)', async () => {
    mockUserDocGet.mockResolvedValue({
      data: () => ({ premium: { isPremium: true, provider: 'polar' } }),
      exists: true,
    });

    await expect(deleteAccountHandler({ auth: { uid: 'user-1' } })).rejects.toMatchObject(
      {
        code: 'failed-precondition',
        details: { reason: POLAR_SUBSCRIPTION_ACTIVE_REASON },
      }
    );

    expect(mockRecursiveDelete).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('allows deletion for a cancelled Polar subscription in the grace period', async () => {
    mockUserDocGet.mockResolvedValue({
      data: () => ({
        premium: { isPremium: true, provider: 'polar', subscriptionState: 'CANCELLED' },
      }),
      exists: true,
    });

    await expect(deleteAccountHandler({ auth: { uid: 'user-1' } })).resolves.toEqual({
      success: true,
    });

    expect(mockRecursiveDelete).toHaveBeenCalledTimes(1);
    expect(mockDeleteUser).toHaveBeenCalledWith('user-1');
  });

  it('allows deletion for an active RevenueCat subscription', async () => {
    mockUserDocGet.mockResolvedValue({
      data: () => ({
        premium: { isPremium: true, provider: 'revenuecat', subscriptionState: 'ACTIVE' },
      }),
      exists: true,
    });

    await expect(deleteAccountHandler({ auth: { uid: 'user-1' } })).resolves.toEqual({
      success: true,
    });

    expect(mockRecursiveDelete).toHaveBeenCalledTimes(1);
    expect(mockDeleteUser).toHaveBeenCalledWith('user-1');
  });

  it('allows deletion when the user document is missing', async () => {
    mockUserDocGet.mockResolvedValue({
      data: () => undefined,
      exists: false,
    });

    await expect(deleteAccountHandler({ auth: { uid: 'user-1' } })).resolves.toEqual({
      success: true,
    });

    expect(mockRecursiveDelete).toHaveBeenCalledTimes(1);
    expect(mockDeleteUser).toHaveBeenCalledWith('user-1');
  });
});

describe('isPolarDeleteBlocked', () => {
  it('blocks active and billing-issue Polar subscriptions', () => {
    expect(
      isPolarDeleteBlocked({ isPremium: true, provider: 'polar', subscriptionState: 'ACTIVE' })
    ).toBe(true);
    expect(
      isPolarDeleteBlocked({
        isPremium: true,
        provider: 'polar',
        subscriptionState: 'BILLING_ISSUE',
      })
    ).toBe(true);
    expect(isPolarDeleteBlocked({ isPremium: true, provider: 'polar' })).toBe(true);
  });

  it('allows cancelled, expired, non-polar, and missing premium', () => {
    expect(
      isPolarDeleteBlocked({
        isPremium: true,
        provider: 'polar',
        subscriptionState: 'CANCELLED',
      })
    ).toBe(false);
    expect(
      isPolarDeleteBlocked({ isPremium: false, provider: 'polar', subscriptionState: 'ACTIVE' })
    ).toBe(false);
    expect(
      isPolarDeleteBlocked({
        isPremium: true,
        provider: 'revenuecat',
        subscriptionState: 'ACTIVE',
      })
    ).toBe(false);
    expect(isPolarDeleteBlocked(null)).toBe(false);
    expect(isPolarDeleteBlocked(undefined)).toBe(false);
  });
});
