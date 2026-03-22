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

import { deleteAccountHandler } from '@/functions/src/accountDeletion';

const mockRecursiveDelete = jest.fn();
const mockBulkWriterDelete = jest.fn();
const mockBulkWriterClose = jest.fn();
const mockWhereGet = jest.fn();
const mockUsersDocRef = { path: 'users/user-1' };

beforeEach(() => {
  jest.clearAllMocks();

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
    expect(mockRecursiveDelete).toHaveBeenCalledWith(mockUsersDocRef);
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
