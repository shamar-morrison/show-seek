/**
 * Shared mocks and fixtures for the Trakt Cloud Functions tests.
 *
 * Each test file registers the module mocks itself (jest.mock is hoisted per file) and points
 * the factories here, so tests and the code under test share the same mock instances:
 *
 *   jest.mock(
 *     'firebase-admin',
 *     () => jest.requireActual('./helpers/traktHarness').firebaseAdminModule,
 *     { virtual: true }
 *   );
 */

export const mockDefineSecret = jest.fn(() => ({
  value: () => 'test-secret',
}));
export const mockOnRequest = jest.fn((_options, handler) => handler);
export const mockOnTaskDispatched = jest.fn((_options, handler) => handler);
export const mockVerifyIdToken = jest.fn();
export const mockEnqueue = jest.fn();
export const firestoreFn: jest.Mock = jest.fn();

export class MockTimestamp {
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

// Module mocks, used as jest.mock factory results.
export const paramsModule = {
  defineSecret: mockDefineSecret,
};

export const httpsModule = {
  onCall: jest.fn((_options, handler) => handler),
  onRequest: mockOnRequest,
};

export const tasksModule = {
  onTaskDispatched: mockOnTaskDispatched,
};

export const firestoreModule = {
  FieldValue: {
    delete: jest.fn(() => 'FIELD_DELETE'),
  },
  Timestamp: MockTimestamp,
};

export const functionsModule = {
  getFunctions: jest.fn(() => ({
    taskQueue: jest.fn(() => ({
      enqueue: mockEnqueue,
    })),
  })),
};

export const firebaseAdminModule = {
  auth: jest.fn(() => ({
    verifyIdToken: mockVerifyIdToken,
  })),
  firestore: firestoreFn,
  initializeApp: jest.fn(),
};

export const resetTraktMocks = () => {
  jest.clearAllMocks();
  mockVerifyIdToken.mockResolvedValue({ uid: 'user-1' });
  mockEnqueue.mockResolvedValue(undefined);
  global.fetch = jest.fn() as any;
  delete process.env.TRAKT_ALLOWED_ORIGINS;
  delete process.env.TRAKT_SYNC_BYPASS_UIDS;
};

export const emptyItemsSynced = () => ({
  episodes: 0,
  favorites: 0,
  lists: 0,
  movies: 0,
  ratings: 0,
  shows: 0,
  watchlistItems: 0,
});

export const DAY_MS = 24 * 60 * 60 * 1000;

export const assertNoUndefined = (value: unknown, path = 'root'): void => {
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

export const createResponse = () => {
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

/**
 * A fresh copy of plain objects and arrays, so each document read returns new data the way an
 * inline `data: () => ({ ... })` does. Other values (timestamps, mocks) are shared.
 */
export const cloneData = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map(cloneData) as T;
  }

  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, cloneData(nestedValue)])
    ) as T;
  }

  return value;
};

export const createDocSnapshot =(path: string, data?: Record<string, unknown>) => ({
  data: () => data,
  exists: data !== undefined,
  id: path.split('/').pop() ?? path,
  ref: { path },
});

export const createCollectionSnapshot = (docs: ReturnType<typeof createDocSnapshot>[]) => ({
  docs,
  size: docs.length,
});

export const createDocSnapshotWithSet = (
  path: string,
  data: Record<string, unknown> | undefined,
  set = jest.fn().mockResolvedValue(undefined)
) => ({
  ...createDocSnapshot(path, data),
  ref: { path, set },
});
