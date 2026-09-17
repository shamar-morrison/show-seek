const mockOnCall = jest.fn((_options: any, handler: any) => {
  // Mirror the real CallableFunction's `.run(request)` unit-testing helper,
  // since the mock unwraps onCall down to the raw handler.
  const fn: any = (request: any) => handler(request);
  fn.run = (request: any) => handler(request);
  return fn;
});
const mockOnRequest = jest.fn((_options, handler) => handler);
const mockDefineSecret = jest.fn(() => ({ value: () => 'rc-api-key' }));

const mockDocGet = jest.fn();
const mockDocSet = jest.fn();
const mockCollection = jest.fn(() => ({
  doc: jest.fn(() => ({
    get: mockDocGet,
    set: mockDocSet,
  })),
}));

const firestoreFn: any = jest.fn(() => ({
  collection: mockCollection,
}));
firestoreFn.FieldValue = {
  serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP'),
};
firestoreFn.Timestamp = {
  fromMillis: (ms: number) => ({ _ms: ms, toMillis: () => ms }),
};

jest.mock('firebase-functions/v2/https', () => ({
  onCall: mockOnCall,
  onRequest: mockOnRequest,
  HttpsError: class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

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
    firestore: firestoreFn,
  }),
  { virtual: true }
);

const mockFetchRevenueCatSubscriber = jest.fn();
jest.mock('@/functions/src/shared/revenuecatSubscriber', () => ({
  fetchRevenueCatSubscriber: (...args: any[]) => mockFetchRevenueCatSubscriber(...args),
  isTransientRevenueCatError: jest.fn(() => false),
  resolveRevenueCatPremiumState: jest.fn(),
}));

jest.mock('@/functions/src/polarWebhook', () => ({
  polarWebhook: jest.fn(),
}));

import { reconcilePremiumStatus } from '@/functions/src/index';

describe('reconcilePremiumStatus callable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips RevenueCat API call and returns current Firestore state when provider is polar', async () => {
    mockDocGet.mockResolvedValueOnce({
      data: () => ({
        premium: {
          isPremium: true,
          provider: 'polar',
          subscriptionState: 'ACTIVE',
        },
      }),
      exists: true,
    });

    const result = await reconcilePremiumStatus.run({
      auth: { uid: 'user-polar-123' },
    } as any);

    expect(result).toEqual({
      isPremium: true,
      source: 'firestore',
      reconciledAt: null,
    });

    // Verify RevenueCat API was NEVER called
    expect(mockFetchRevenueCatSubscriber).not.toHaveBeenCalled();
    // Verify no Firestore write was made
    expect(mockDocSet).not.toHaveBeenCalled();
  });

  it('skips RevenueCat API call and returns isPremium: false when polar subscription is expired', async () => {
    mockDocGet.mockResolvedValueOnce({
      data: () => ({
        premium: {
          isPremium: false,
          provider: 'polar',
          subscriptionState: 'EXPIRED',
        },
      }),
      exists: true,
    });

    const result = await reconcilePremiumStatus.run({
      auth: { uid: 'user-polar-expired' },
    } as any);

    expect(result).toEqual({
      isPremium: false,
      source: 'none',
      reconciledAt: null,
    });

    expect(mockFetchRevenueCatSubscriber).not.toHaveBeenCalled();
    expect(mockDocSet).not.toHaveBeenCalled();
  });
});
