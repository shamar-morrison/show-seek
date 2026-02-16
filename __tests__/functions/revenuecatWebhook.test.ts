const mockOnRequest = jest.fn((_options, handler) => handler);
const mockDefineSecret = jest.fn(() => ({ value: () => 'hook-secret' }));

const mockServerTimestamp = 'SERVER_TIMESTAMP';
const mockTimestampFromMillis = (ms: number) => ({
  _ms: ms,
  toMillis: () => ms,
});

const mockRunTransaction = jest.fn();
const mockCollection = jest.fn();

const firestoreFn: any = jest.fn(() => ({
  collection: mockCollection,
  runTransaction: mockRunTransaction,
}));
firestoreFn.FieldValue = {
  serverTimestamp: jest.fn(() => mockServerTimestamp),
};
firestoreFn.Timestamp = {
  fromMillis: mockTimestampFromMillis,
};

jest.mock('firebase-functions/v2/https', () => ({
  onRequest: mockOnRequest,
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
    firestore: firestoreFn,
  }),
  { virtual: true }
);

import {
  mapRevenueCatEventToPremiumPayload,
  revenuecatWebhook,
  resolveRevenueCatEventTimestampMs,
} from '@/functions/src/revenuecatWebhook';

const createResponse = () => {
  const response = {
    json: jest.fn(),
    status: jest.fn(),
  };

  response.status.mockReturnValue(response);
  return response;
};

describe('revenuecatWebhook helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves event timestamp with fallback order', () => {
    expect(
      resolveRevenueCatEventTimestampMs(
        {
          event_timestamp_ms: 100,
          expiration_at_ms: 300,
          purchased_at_ms: 200,
        },
        999
      )
    ).toBe(100);

    expect(
      resolveRevenueCatEventTimestampMs(
        {
          expiration_at_ms: '300',
          purchased_at_ms: '200',
        },
        999
      )
    ).toBe(200);

    expect(resolveRevenueCatEventTimestampMs({}, 999)).toBe(999);
  });

  it('maps cancellation to cancelled while entitlement is still active', () => {
    const nowMs = 1_000;
    const payload = mapRevenueCatEventToPremiumPayload(
      {
        app_user_id: 'user-1',
        expiration_at_ms: nowMs + 10_000,
        id: 'evt_1',
        period_type: 'NORMAL',
        product_id: 'monthly_showseek_sub',
        purchased_at_ms: nowMs - 100,
        transaction_id: 'order-1',
        type: 'CANCELLATION',
      },
      {},
      nowMs
    );

    expect(payload.isPremium).toBe(true);
    expect(payload.subscriptionState).toBe('CANCELLED');
    expect(payload.entitlementType).toBe('subscription');
    expect(payload.subscriptionType).toBe('monthly');
  });

  it('preserves legacy lifetime entitlement against downgrades', () => {
    const nowMs = 1_000;
    const payload = mapRevenueCatEventToPremiumPayload(
      {
        app_user_id: 'user-1',
        expiration_at_ms: nowMs - 1,
        id: 'evt_legacy',
        type: 'EXPIRATION',
      },
      {
        entitlementType: 'lifetime',
        isPremium: true,
        productId: 'premium_unlock',
      },
      nowMs
    );

    expect(payload.isPremium).toBe(true);
    expect(payload.entitlementType).toBe('lifetime');
    expect(payload.productId).toBe('premium_unlock');
  });
});

describe('revenuecatWebhook handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockCollection.mockImplementation((collectionName: string) => ({
      doc: (docId: string) => ({ path: `${collectionName}/${docId}` }),
    }));
  });

  it('rejects unauthorized requests', async () => {
    const response = createResponse();

    await revenuecatWebhook(
      {
        body: {
          event: {
            app_user_id: 'user-1',
            id: 'evt_1',
          },
        },
        header: jest.fn(() => 'Bearer invalid-token'),
        method: 'POST',
      } as any,
      response as any
    );

    expect(response.status).toHaveBeenCalledWith(401);
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it('treats duplicate events as idempotent', async () => {
    mockRunTransaction.mockImplementationOnce(async (transactionCallback: any) => {
      const transaction = {
        get: jest.fn(async (ref: { path: string }) => ({
          exists: ref.path === 'revenuecatWebhookEvents/evt_duplicate',
        })),
        set: jest.fn(),
      };

      return await transactionCallback(transaction);
    });

    const response = createResponse();

    await revenuecatWebhook(
      {
        body: {
          event: {
            app_user_id: 'user-1',
            event_timestamp_ms: 10,
            id: 'evt_duplicate',
            type: 'RENEWAL',
          },
        },
        header: jest.fn(() => 'Bearer hook-secret'),
        method: 'POST',
      } as any,
      response as any
    );

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ ok: true, status: 'duplicate' });
  });

  it('marks stale events and skips premium writes', async () => {
    const transactionSet = jest.fn();

    mockRunTransaction.mockImplementationOnce(async (transactionCallback: any) => {
      const transaction = {
        get: jest.fn(async (ref: { path: string }) => {
          if (ref.path.startsWith('revenuecatWebhookEvents/')) {
            return { exists: false };
          }

          return {
            data: () => ({
              premium: {
                rcLastEventTimestampMs: 1000,
              },
            }),
            exists: true,
          };
        }),
        set: transactionSet,
      };

      return await transactionCallback(transaction);
    });

    const response = createResponse();

    await revenuecatWebhook(
      {
        body: {
          event: {
            app_user_id: 'user-1',
            event_timestamp_ms: 999,
            id: 'evt_stale',
            type: 'RENEWAL',
          },
        },
        header: jest.fn(() => 'hook-secret'),
        method: 'POST',
      } as any,
      response as any
    );

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ ok: true, status: 'stale' });

    const setTargets = transactionSet.mock.calls.map((call) => call[0].path);
    expect(setTargets).toContain('revenuecatWebhookEvents/evt_stale');
    expect(setTargets).not.toContain('users/user-1');
  });

  it('processes events that share the same timestamp when event id is new', async () => {
    const transactionSet = jest.fn();

    mockRunTransaction.mockImplementationOnce(async (transactionCallback: any) => {
      const transaction = {
        get: jest.fn(async (ref: { path: string }) => {
          if (ref.path.startsWith('revenuecatWebhookEvents/')) {
            return { exists: false };
          }

          return {
            data: () => ({
              premium: {
                rcLastEventTimestampMs: 1000,
              },
            }),
            exists: true,
          };
        }),
        set: transactionSet,
      };

      return await transactionCallback(transaction);
    });

    const response = createResponse();

    await revenuecatWebhook(
      {
        body: {
          event: {
            app_user_id: 'user-1',
            event_timestamp_ms: 1000,
            expiration_at_ms: 2000,
            id: 'evt_same_ts',
            product_id: 'monthly_showseek_sub',
            type: 'RENEWAL',
          },
        },
        header: jest.fn(() => 'hook-secret'),
        method: 'POST',
      } as any,
      response as any
    );

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ ok: true, status: 'processed' });

    const setTargets = transactionSet.mock.calls.map((call) => call[0].path);
    expect(setTargets).toContain('users/user-1');
    expect(setTargets).toContain('revenuecatWebhookEvents/evt_same_ts');
  });
});
