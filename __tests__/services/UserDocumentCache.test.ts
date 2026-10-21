import {
  clearUserDocumentCache,
  getCachedUserDocument,
  mergeUserDocumentCache,
} from '@/src/services/UserDocumentCache';

const mockAuditedGetDoc = jest.fn();
const mockGetFirestoreErrorMessage = jest.fn((error: unknown) =>
  error instanceof Error ? error.message : 'Unknown error'
);

let mockCurrentUserUid: string | null = null;

jest.mock('@/src/firebase/config', () => ({
  auth: {
    get currentUser() {
      return mockCurrentUserUid ? { uid: mockCurrentUserUid } : null;
    },
  },
  db: {},
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn((_db: unknown, ...segments: string[]) => segments.join('/')),
}));

jest.mock('@/src/services/firestoreReadAudit', () => ({
  auditedGetDoc: (ref: unknown, meta: unknown) => mockAuditedGetDoc(ref, meta),
}));

jest.mock('@/src/firebase/firestore', () => ({
  getFirestoreErrorMessage: (error: unknown) => mockGetFirestoreErrorMessage(error),
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
};

const createDeferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const createExistingSnapshot = (data: Record<string, unknown>) => ({
  exists: () => true,
  data: () => data,
});

const createMissingSnapshot = () => ({
  exists: () => false,
  data: () => undefined,
});

describe('UserDocumentCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearUserDocumentCache();
    mockCurrentUserUid = null;
  });

  it('shares in-flight fetch by userId and isolates fetches across users', async () => {
    const deferredA = createDeferred<any>();
    const deferredB = createDeferred<any>();

    mockAuditedGetDoc.mockImplementation(
      (_ref: unknown, meta: { path: string }) =>
        meta.path === 'users/user-a' ? deferredA.promise : deferredB.promise
    );

    const userAPromiseOne = getCachedUserDocument('user-a');
    const userAPromiseTwo = getCachedUserDocument('user-a');
    const userBPromise = getCachedUserDocument('user-b');

    expect(mockAuditedGetDoc).toHaveBeenCalledTimes(2);

    deferredA.resolve(createExistingSnapshot({ uid: 'user-a', displayName: 'User A' }));
    deferredB.resolve(createMissingSnapshot());

    await expect(userAPromiseOne).resolves.toEqual({ uid: 'user-a', displayName: 'User A' });
    await expect(userAPromiseTwo).resolves.toEqual({ uid: 'user-a', displayName: 'User A' });
    await expect(userBPromise).resolves.toBeNull();
  });

  it('maps Firestore errors and clears in-flight entry after failure', async () => {
    mockAuditedGetDoc.mockRejectedValueOnce(new Error('raw firestore failure'));
    mockGetFirestoreErrorMessage.mockReturnValueOnce('Mapped failure');

    await expect(getCachedUserDocument('user-c')).rejects.toThrow('Mapped failure');
    expect(mockGetFirestoreErrorMessage).toHaveBeenCalled();

    mockAuditedGetDoc.mockResolvedValueOnce(createMissingSnapshot());

    await expect(getCachedUserDocument('user-c', { forceRefresh: true })).resolves.toBeNull();
    expect(mockAuditedGetDoc).toHaveBeenCalledTimes(2);
  });

  it('does not let a merge after a failed read create a partial cache entry', async () => {
    // The module forces a refresh under Jest; unset the marker so cache hits are observable.
    const originalJestWorkerId = process.env.JEST_WORKER_ID;
    delete process.env.JEST_WORKER_ID;
    try {
      mockAuditedGetDoc.mockRejectedValueOnce(new Error('raw firestore failure'));
      mockGetFirestoreErrorMessage.mockReturnValueOnce('Mapped failure');

      await expect(getCachedUserDocument('user-d')).rejects.toThrow('Mapped failure');

      mergeUserDocumentCache('user-d', { region: 'US' });

      const fullDocument = { uid: 'user-d', displayName: 'User D', region: 'US' };
      mockAuditedGetDoc.mockResolvedValueOnce(createExistingSnapshot(fullDocument));

      await expect(getCachedUserDocument('user-d')).resolves.toEqual(fullDocument);
      expect(mockAuditedGetDoc).toHaveBeenCalledTimes(2);
    } finally {
      if (originalJestWorkerId === undefined) {
        delete process.env.JEST_WORKER_ID;
      } else {
        process.env.JEST_WORKER_ID = originalJestWorkerId;
      }
    }
  });
});
