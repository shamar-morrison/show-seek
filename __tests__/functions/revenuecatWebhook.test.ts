const mockOnRequest = jest.fn((_options, handler) => handler);
const mockDefineSecret = jest.fn(() => ({ value: () => 'hook-secret' }));

const mockServerTimestamp = 'SERVER_TIMESTAMP';
const mockTimestampFromMillis = (ms: number) => ({
  _ms: ms,
  toMillis: () => ms,
});

const mockRunTransaction = jest.fn();
const mockCollection = jest.fn();
const mockGetUser = jest.fn();
mockGetUser.mockResolvedValue({ email: 'user@example.com' });

const mockSendCancellationFeedbackEmail = jest.fn(async () => ({}));

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
    auth: jest.fn(() => ({ getUser: mockGetUser })),
  }),
  { virtual: true }
);

jest.mock('@/functions/src/subscriptionFeedbackEmail', () => ({
  sendCancellationFeedbackEmail: (...args: unknown[]) =>
    mockSendCancellationFeedbackEmail(...args),
}));

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

  it('leaves premium fields unchanged and only updates metadata when provider is polar and isPremium is true (EXPIRATION)', async () => {
    const transactionSet = jest.fn();
    const polarExisting = {
      isPremium: true,
      provider: 'polar',
      subscriptionState: 'ACTIVE',
      subscriptionType: 'yearly',
      productId: 'showseek_yearly_sub',
      expiresAt: mockTimestampFromMillis(5000),
      orderId: 'polar_order_123',
      purchaseDate: mockTimestampFromMillis(1000),
      rcLastEventTimestampMs: 500,
    };

    mockRunTransaction.mockImplementationOnce(async (transactionCallback: any) => {
      const transaction = {
        get: jest.fn(async (ref: { path: string }) => {
          if (ref.path.startsWith('revenuecatWebhookEvents/')) {
            return { exists: false };
          }
          return {
            data: () => ({ premium: polarExisting }),
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
            event_timestamp_ms: 2000,
            id: 'evt_rc_exp',
            type: 'EXPIRATION',
          },
        },
        header: jest.fn(() => 'hook-secret'),
        method: 'POST',
      } as any,
      response as any
    );

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ ok: true, status: 'processed' });

    const userSetCall = transactionSet.mock.calls.find((call) => call[0].path === 'users/user-1');
    expect(userSetCall).toBeDefined();
    expect(userSetCall[1].premium).toEqual({
      ...polarExisting,
      rcLastEventType: 'EXPIRATION',
      rcLastEventTimestampMs: 2000,
      rcLastEventId: 'evt_rc_exp',
    });
    expect(userSetCall[1].premium.isPremium).toBe(true);
    expect(userSetCall[1].premium.provider).toBe('polar');
    expect(userSetCall[1].premium.subscriptionState).toBe('ACTIVE');

    const eventSetCall = transactionSet.mock.calls.find((call) => call[0].path === 'revenuecatWebhookEvents/evt_rc_exp');
    expect(eventSetCall).toBeDefined();
    expect(eventSetCall[1].status).toBe('processed');
  });

  it('leaves premium fields unchanged when provider is polar and isPremium is true (INITIAL_PURCHASE)', async () => {
    const transactionSet = jest.fn();
    const polarExisting = {
      isPremium: true,
      provider: 'polar',
      subscriptionState: 'ACTIVE',
      subscriptionType: 'monthly',
      productId: 'monthly_showseek_sub',
      expiresAt: mockTimestampFromMillis(5000),
      orderId: 'polar_order_456',
      purchaseDate: mockTimestampFromMillis(1000),
      rcLastEventTimestampMs: 500,
    };

    mockRunTransaction.mockImplementationOnce(async (transactionCallback: any) => {
      const transaction = {
        get: jest.fn(async (ref: { path: string }) => {
          if (ref.path.startsWith('revenuecatWebhookEvents/')) {
            return { exists: false };
          }
          return {
            data: () => ({ premium: polarExisting }),
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
            event_timestamp_ms: 2000,
            expiration_at_ms: 6000,
            id: 'evt_rc_init',
            product_id: 'monthly_showseek_sub',
            type: 'INITIAL_PURCHASE',
          },
        },
        header: jest.fn(() => 'hook-secret'),
        method: 'POST',
      } as any,
      response as any
    );

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ ok: true, status: 'processed' });

    const userSetCall = transactionSet.mock.calls.find((call) => call[0].path === 'users/user-1');
    expect(userSetCall).toBeDefined();
    expect(userSetCall[1].premium.isPremium).toBe(true);
    expect(userSetCall[1].premium.provider).toBe('polar');
    expect(userSetCall[1].premium.orderId).toBe('polar_order_456');
    expect(userSetCall[1].premium.rcLastEventType).toBe('INITIAL_PURCHASE');
    expect(userSetCall[1].premium.rcLastEventTimestampMs).toBe(2000);
    expect(userSetCall[1].premium.rcLastEventId).toBe('evt_rc_init');
  });

  it('processes normally and switches provider to revenuecat when polar is expired (isPremium is false)', async () => {
    const transactionSet = jest.fn();
    const expiredPolar = {
      isPremium: false,
      provider: 'polar',
      subscriptionState: 'EXPIRED',
      rcLastEventTimestampMs: 500,
    };

    mockRunTransaction.mockImplementationOnce(async (transactionCallback: any) => {
      const transaction = {
        get: jest.fn(async (ref: { path: string }) => {
          if (ref.path.startsWith('revenuecatWebhookEvents/')) {
            return { exists: false };
          }
          return {
            data: () => ({ premium: expiredPolar }),
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
            event_timestamp_ms: 2000,
            expiration_at_ms: Date.now() + 86400_000,
            id: 'evt_rc_renewal',
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

    const userSetCall = transactionSet.mock.calls.find((call) => call[0].path === 'users/user-1');
    expect(userSetCall).toBeDefined();
    expect(userSetCall[1].premium.isPremium).toBe(true);
    expect(userSetCall[1].premium.provider).toBe('revenuecat');
    expect(userSetCall[1].premium.subscriptionState).toBe('ACTIVE');
    expect(userSetCall[1].premium.rcLastEventType).toBe('RENEWAL');
  });

  it('processes normally when provider is undefined or already revenuecat', async () => {
    const transactionSet = jest.fn();
    const existingRc = {
      isPremium: true,
      provider: 'revenuecat',
      subscriptionState: 'ACTIVE',
      rcLastEventTimestampMs: 500,
    };

    mockRunTransaction.mockImplementationOnce(async (transactionCallback: any) => {
      const transaction = {
        get: jest.fn(async (ref: { path: string }) => {
          if (ref.path.startsWith('revenuecatWebhookEvents/')) {
            return { exists: false };
          }
          return {
            data: () => ({ premium: existingRc }),
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
            event_timestamp_ms: 2000,
            expiration_at_ms: Date.now() + 86400_000,
            id: 'evt_rc_existing',
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

    const userSetCall = transactionSet.mock.calls.find((call) => call[0].path === 'users/user-1');
    expect(userSetCall).toBeDefined();
    expect(userSetCall[1].premium.provider).toBe('revenuecat');
    expect(userSetCall[1].premium.isPremium).toBe(true);
  });
});

describe('revenuecatWebhook subscription feedback email', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ email: 'user@example.com' });
    mockSendCancellationFeedbackEmail.mockResolvedValue({});

    mockCollection.mockImplementation((collectionName: string) => ({
      doc: (docId: string) => ({ path: `${collectionName}/${docId}` }),
    }));
  });

  const mockProcessedTransaction = (existingPremium: Record<string, unknown>) => {
    mockRunTransaction.mockImplementationOnce(async (transactionCallback: any) => {
      const transaction = {
        get: jest.fn(async (ref: { path: string }) => {
          if (ref.path.startsWith('revenuecatWebhookEvents/')) {
            return { exists: false };
          }

          return {
            data: () => ({ premium: existingPremium }),
            exists: true,
          };
        }),
        set: jest.fn(),
      };

      return await transactionCallback(transaction);
    });
  };

  const postEvent = (event: Record<string, unknown>) => {
    const response = createResponse();

    return revenuecatWebhook(
      {
        body: { event },
        header: jest.fn(() => 'Bearer hook-secret'),
        method: 'POST',
      } as any,
      response as any
    ).then(() => response);
  };

  it("sends reason 'cancelled' on CANCELLATION+processed", async () => {
    mockProcessedTransaction({ provider: 'revenuecat' });

    const response = await postEvent({
      app_user_id: 'user-1',
      event_timestamp_ms: 2000,
      expiration_at_ms: Date.now() + 86400_000,
      id: 'evt_cancel_1',
      product_id: 'monthly_showseek_sub',
      type: 'CANCELLATION',
    });

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ ok: true, status: 'processed' });
    expect(mockGetUser).toHaveBeenCalledWith('user-1');
    expect(mockSendCancellationFeedbackEmail).toHaveBeenCalledTimes(1);
    expect(mockSendCancellationFeedbackEmail).toHaveBeenCalledWith({
      email: 'user@example.com',
      reason: 'cancelled',
    });
  });

  it("sends reason 'expired' on EXPIRATION+processed", async () => {
    mockProcessedTransaction({ provider: 'revenuecat' });

    const response = await postEvent({
      app_user_id: 'user-1',
      event_timestamp_ms: 2000,
      id: 'evt_expire_1',
      type: 'EXPIRATION',
    });

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ ok: true, status: 'processed' });
    expect(mockSendCancellationFeedbackEmail).toHaveBeenCalledTimes(1);
    expect(mockSendCancellationFeedbackEmail).toHaveBeenCalledWith({
      email: 'user@example.com',
      reason: 'expired',
    });
  });

  it('never sends on duplicate delivery', async () => {
    mockRunTransaction.mockImplementationOnce(async (transactionCallback: any) => {
      const transaction = {
        get: jest.fn(async () => ({ exists: true })),
        set: jest.fn(),
      };

      return await transactionCallback(transaction);
    });

    const response = await postEvent({
      app_user_id: 'user-1',
      event_timestamp_ms: 2000,
      id: 'evt_cancel_duplicate',
      type: 'CANCELLATION',
    });

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ ok: true, status: 'duplicate' });
    expect(mockSendCancellationFeedbackEmail).not.toHaveBeenCalled();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('never sends on stale events', async () => {
    mockProcessedTransaction({ rcLastEventTimestampMs: 5000 });

    const response = await postEvent({
      app_user_id: 'user-1',
      event_timestamp_ms: 1000,
      id: 'evt_cancel_stale',
      type: 'CANCELLATION',
    });

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ ok: true, status: 'stale' });
    expect(mockSendCancellationFeedbackEmail).not.toHaveBeenCalled();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('never sends for other event types', async () => {
    mockProcessedTransaction({ provider: 'revenuecat' });

    const response = await postEvent({
      app_user_id: 'user-1',
      event_timestamp_ms: 2000,
      expiration_at_ms: Date.now() + 86400_000,
      id: 'evt_renewal_no_email',
      product_id: 'monthly_showseek_sub',
      type: 'RENEWAL',
    });

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ ok: true, status: 'processed' });
    expect(mockSendCancellationFeedbackEmail).not.toHaveBeenCalled();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('never sends when handledBy is polar-guard, even for CANCELLATION', async () => {
    mockProcessedTransaction({
      isPremium: true,
      provider: 'polar',
      rcLastEventTimestampMs: 500,
    });

    const response = await postEvent({
      app_user_id: 'user-1',
      event_timestamp_ms: 2000,
      id: 'evt_cancel_polar',
      type: 'CANCELLATION',
    });

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ ok: true, status: 'processed' });
    expect(mockSendCancellationFeedbackEmail).not.toHaveBeenCalled();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('never sends when handledBy is polar-guard, even for EXPIRATION', async () => {
    mockProcessedTransaction({
      isPremium: true,
      provider: 'polar',
      rcLastEventTimestampMs: 500,
    });

    const response = await postEvent({
      app_user_id: 'user-1',
      event_timestamp_ms: 2000,
      id: 'evt_expire_polar',
      type: 'EXPIRATION',
    });

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ ok: true, status: 'processed' });
    expect(mockSendCancellationFeedbackEmail).not.toHaveBeenCalled();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('skips the send when the auth user has no email', async () => {
    mockProcessedTransaction({ provider: 'revenuecat' });
    mockGetUser.mockResolvedValue({ email: null });

    const response = await postEvent({
      app_user_id: 'user-1',
      event_timestamp_ms: 2000,
      id: 'evt_cancel_no_email',
      type: 'CANCELLATION',
    });

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ ok: true, status: 'processed' });
    expect(mockGetUser).toHaveBeenCalledWith('user-1');
    expect(mockSendCancellationFeedbackEmail).not.toHaveBeenCalled();
  });

  it('still returns 200 when the email send throws', async () => {
    mockProcessedTransaction({ provider: 'revenuecat' });
    mockSendCancellationFeedbackEmail.mockRejectedValueOnce(new Error('resend down'));

    const response = await postEvent({
      app_user_id: 'user-1',
      event_timestamp_ms: 2000,
      id: 'evt_expire_send_fails',
      type: 'EXPIRATION',
    });

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ ok: true, status: 'processed' });
    expect(mockSendCancellationFeedbackEmail).toHaveBeenCalledTimes(1);
  });

  it('still returns 200 when the auth lookup throws and never sends', async () => {
    mockProcessedTransaction({ provider: 'revenuecat' });
    mockGetUser.mockRejectedValueOnce(
      Object.assign(new Error('No user record'), { code: 'auth/user-not-found' })
    );

    const response = await postEvent({
      app_user_id: 'user-1',
      event_timestamp_ms: 2000,
      id: 'evt_expire_deleted_user',
      type: 'EXPIRATION',
    });

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ ok: true, status: 'processed' });
    expect(mockGetUser).toHaveBeenCalledWith('user-1');
    expect(mockSendCancellationFeedbackEmail).not.toHaveBeenCalled();
  });
});
