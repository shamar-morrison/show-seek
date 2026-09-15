const mockOnRequest = jest.fn((_options, handler) => handler);
const mockDefineSecret = jest.fn((name: string) => ({
  value: () => {
    if (name === 'POLAR_WEBHOOK_SECRET') return 'whsec_test_secret';
    if (name === 'POLAR_PRODUCT_ID_MONTHLY') return 'polar_prod_monthly';
    if (name === 'POLAR_PRODUCT_ID_YEARLY') return 'polar_prod_yearly';
    return '';
  },
}));

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

const mockValidateEvent = jest.fn();
class MockWebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}
class MockSDKValidationError extends Error {
  rawValue: any;
  constructor(message: string, rawValue: any) {
    super(message);
    this.name = 'SDKValidationError';
    this.rawValue = rawValue;
  }
}

jest.mock(
  '@polar-sh/sdk/webhooks',
  () => ({
    validateEvent: (...args: any[]) => mockValidateEvent(...args),
    WebhookVerificationError: MockWebhookVerificationError,
  }),
  { virtual: true }
);

jest.mock(
  '@polar-sh/sdk/models/errors/sdkvalidationerror',
  () => ({
    SDKValidationError: MockSDKValidationError,
  }),
  { virtual: true }
);

import {
  extractFirebaseUid,
  mapPolarEventToPremiumPayload,
  polarWebhook,
  resolvePolarEventTimestampMs,
  resolvePolarProductId,
  resolveSubscriptionType,
  type ExistingPremiumData,
  type GenericPolarEvent,
  type PolarWebhookConfig,
} from '@/functions/src/polarWebhook';

const createResponse = () => {
  const response = {
    json: jest.fn(),
    status: jest.fn(),
  };

  response.status.mockReturnValue(response);
  return response;
};

describe('polarWebhook helpers', () => {
  const config: PolarWebhookConfig = {
    monthlyProductId: 'polar_prod_monthly',
    yearlyProductId: 'polar_prod_yearly',
  };

  const baseExisting: ExistingPremiumData = {
    isPremium: false,
    entitlementType: 'none',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves timestamp correctly with fallbacks', () => {
    expect(
      resolvePolarEventTimestampMs(
        {
          type: 'subscription.active',
          timestamp: 1000,
          data: {},
        },
        999
      )
    ).toBe(1000);

    expect(
      resolvePolarEventTimestampMs(
        {
          type: 'subscription.active',
          data: { current_period_start: 2000 },
        },
        999
      )
    ).toBe(2000);

    expect(
      resolvePolarEventTimestampMs(
        {
          type: 'subscription.active',
          data: {},
        },
        999
      )
    ).toBe(999);
  });

  it('resolves Polar product IDs to internal mobile-compatible product strings', () => {
    expect(resolvePolarProductId('polar_prod_monthly', config)).toBe(
      'monthly_showseek_sub'
    );
    expect(resolvePolarProductId('polar_prod_yearly', config)).toBe(
      'showseek_yearly_sub'
    );
    expect(resolvePolarProductId('custom_prod', config)).toBe('custom_prod');
    expect(resolvePolarProductId(null, config)).toBeNull();

    expect(resolveSubscriptionType('monthly_showseek_sub')).toBe('monthly');
    expect(resolveSubscriptionType('showseek_yearly_sub')).toBe('yearly');
    expect(resolveSubscriptionType('custom')).toBeNull();
  });

  it('extracts Firebase UID from customer external_id or metadata', () => {
    expect(
      extractFirebaseUid({
        type: 'subscription.active',
        data: {
          customer: { external_id: 'uid-from-snake-case' },
        },
      })
    ).toBe('uid-from-snake-case');

    expect(
      extractFirebaseUid({
        type: 'subscription.active',
        data: {
          customer: { externalId: 'uid-from-camel-case' },
        },
      })
    ).toBe('uid-from-camel-case');

    expect(
      extractFirebaseUid({
        type: 'order.paid',
        data: {
          external_customer_id: 'uid-from-order',
        },
      })
    ).toBe('uid-from-order');

    expect(
      extractFirebaseUid({
        type: 'subscription.active',
        data: {},
      })
    ).toBeNull();
  });

  it('maps subscription.active to active premium payload with provider: polar', () => {
    const nowMs = 1_000;
    const futureEnd = nowMs + 30 * 86400_000;
    const event: GenericPolarEvent = {
      type: 'subscription.active',
      timestamp: nowMs,
      data: {
        id: 'sub_polar_1',
        customer_id: 'cust_polar_1',
        product_id: 'polar_prod_monthly',
        status: 'active',
        current_period_start: nowMs,
        current_period_end: futureEnd,
      },
    };

    const payload = mapPolarEventToPremiumPayload(event, baseExisting, config, nowMs);

    expect(payload.isPremium).toBe(true);
    expect(payload.provider).toBe('polar');
    expect(payload.entitlementType).toBe('subscription');
    expect(payload.subscriptionState).toBe('ACTIVE');
    expect(payload.productId).toBe('monthly_showseek_sub');
    expect(payload.subscriptionType).toBe('monthly');
    expect(payload.polarSubscriptionId).toBe('sub_polar_1');
    expect(payload.polarCustomerId).toBe('cust_polar_1');
  });

  it('maps subscription.canceled to CANCELLED while period is active', () => {
    const nowMs = 1_000;
    const futureEnd = nowMs + 10 * 86400_000;
    const event: GenericPolarEvent = {
      type: 'subscription.canceled',
      timestamp: nowMs,
      data: {
        id: 'sub_polar_2',
        status: 'canceled',
        current_period_end: futureEnd,
      },
    };

    const payload = mapPolarEventToPremiumPayload(
      event,
      { ...baseExisting, isPremium: true },
      config,
      nowMs
    );

    expect(payload.isPremium).toBe(true);
    expect(payload.subscriptionState).toBe('CANCELLED');
    expect(payload.provider).toBe('polar');
  });

  it('maps subscription.revoked to EXPIRED and isPremium: false', () => {
    const nowMs = 1_000;
    const event: GenericPolarEvent = {
      type: 'subscription.revoked',
      timestamp: nowMs,
      data: {
        id: 'sub_polar_3',
      },
    };

    const payload = mapPolarEventToPremiumPayload(
      event,
      { ...baseExisting, isPremium: true },
      config,
      nowMs
    );

    expect(payload.isPremium).toBe(false);
    expect(payload.subscriptionState).toBe('EXPIRED');
    expect(payload.entitlementType).toBe('none');
  });

  it('maps subscription.paused to EXPIRED and isPremium: false', () => {
    const nowMs = 1_000;
    const event: GenericPolarEvent = {
      type: 'subscription.paused',
      timestamp: nowMs,
      data: {
        id: 'sub_polar_paused',
        status: 'paused',
      },
    };

    const payload = mapPolarEventToPremiumPayload(
      event,
      { ...baseExisting, isPremium: true },
      config,
      nowMs
    );

    expect(payload.isPremium).toBe(false);
    expect(payload.subscriptionState).toBe('EXPIRED');
    expect(payload.entitlementType).toBe('none');
  });

  it('maps subscription.updated past_due to BILLING_ISSUE with active access', () => {
    const nowMs = 1_000;
    const event: GenericPolarEvent = {
      type: 'subscription.updated',
      timestamp: nowMs,
      data: {
        id: 'sub_polar_4',
        status: 'past_due',
        current_period_end: nowMs + 5000,
      },
    };

    const payload = mapPolarEventToPremiumPayload(
      event,
      { ...baseExisting, isPremium: true },
      config,
      nowMs
    );

    expect(payload.isPremium).toBe(true);
    expect(payload.subscriptionState).toBe('BILLING_ISSUE');
  });
});

describe('polarWebhook handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockCollection.mockImplementation((collectionName: string) => ({
      doc: (docId: string) => ({ path: `${collectionName}/${docId}` }),
    }));
  });

  it('rejects non-POST requests with 405', async () => {
    const response = createResponse();

    await polarWebhook(
      {
        method: 'GET',
        headers: {},
      } as any,
      response as any
    );

    expect(response.status).toHaveBeenCalledWith(405);
    expect(response.json).toHaveBeenCalledWith({ error: 'Method Not Allowed' });
  });

  it('rejects invalid signatures with 401', async () => {
    const response = createResponse();
    mockValidateEvent.mockImplementationOnce(() => {
      throw new MockWebhookVerificationError('Bad signature');
    });

    await polarWebhook(
      {
        body: {},
        headers: { 'webhook-signature': 'bad_sig' },
        method: 'POST',
      } as any,
      response as any
    );

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({
      error: 'Unauthorized: Invalid webhook signature',
    });
  });

  it('skips processing if event is missing external_id', async () => {
    const response = createResponse();
    mockValidateEvent.mockReturnValueOnce({
      type: 'subscription.active',
      data: { id: 'sub_no_ext' },
    });

    await polarWebhook(
      {
        body: {},
        headers: { 'webhook-id': 'wh_no_uid' },
        method: 'POST',
      } as any,
      response as any
    );

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      ok: true,
      status: 'skipped_no_external_id',
    });
  });

  it('treats duplicate webhook deliveries as idempotent', async () => {
    mockValidateEvent.mockReturnValueOnce({
      type: 'subscription.active',
      data: {
        id: 'sub_dup',
        customer: { external_id: 'user_dup' },
      },
    });

    mockRunTransaction.mockImplementationOnce(async (callback: any) => {
      const transaction = {
        get: jest.fn(async (ref: { path: string }) => {
          if (ref.path === 'polarWebhookEvents/wh_dup') {
            return { exists: true };
          }
          return { exists: false };
        }),
        set: jest.fn(),
      };
      return await callback(transaction);
    });

    const response = createResponse();

    await polarWebhook(
      {
        body: {},
        headers: { 'webhook-id': 'wh_dup' },
        method: 'POST',
      } as any,
      response as any
    );

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ ok: true, status: 'duplicate' });
  });

  it('marks stale events and skips premium write', async () => {
    const transactionSet = jest.fn();

    mockValidateEvent.mockReturnValueOnce({
      type: 'subscription.updated',
      timestamp: 500,
      data: {
        id: 'sub_stale',
        customer: { external_id: 'user_stale' },
      },
    });

    mockRunTransaction.mockImplementationOnce(async (callback: any) => {
      const transaction = {
        get: jest.fn(async (ref: { path: string }) => {
          if (ref.path.startsWith('polarWebhookEvents/')) {
            return { exists: false };
          }
          return {
            data: () => ({
              premium: {
                polarLastEventTimestampMs: 1000,
              },
            }),
            exists: true,
          };
        }),
        set: transactionSet,
      };
      return await callback(transaction);
    });

    const response = createResponse();

    await polarWebhook(
      {
        body: {},
        headers: { 'webhook-id': 'wh_stale' },
        method: 'POST',
      } as any,
      response as any
    );

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ ok: true, status: 'stale' });

    const setPaths = transactionSet.mock.calls.map((c) => c[0].path);
    expect(setPaths).toContain('polarWebhookEvents/wh_stale');
    expect(setPaths).not.toContain('users/user_stale');
  });

  it('processes valid event and writes merged premium state', async () => {
    const transactionSet = jest.fn();

    mockValidateEvent.mockReturnValueOnce({
      type: 'subscription.active',
      timestamp: 2000,
      data: {
        id: 'sub_valid',
        customer_id: 'cust_valid',
        customer: { external_id: 'user_valid' },
        product_id: 'polar_prod_yearly',
        status: 'active',
        current_period_start: 2000,
        current_period_end: 2000 + 365 * 86400_000,
      },
    });

    mockRunTransaction.mockImplementationOnce(async (callback: any) => {
      const transaction = {
        get: jest.fn(async (ref: { path: string }) => {
          if (ref.path.startsWith('polarWebhookEvents/')) {
            return { exists: false };
          }
          return {
            data: () => ({
              premium: {
                polarLastEventTimestampMs: 1000,
              },
            }),
            exists: true,
          };
        }),
        set: transactionSet,
      };
      return await callback(transaction);
    });

    const response = createResponse();

    await polarWebhook(
      {
        body: {},
        headers: { 'webhook-id': 'wh_valid' },
        method: 'POST',
      } as any,
      response as any
    );

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ ok: true, status: 'processed' });

    const setCalls = transactionSet.mock.calls;
    const userCall = setCalls.find((c) => c[0].path === 'users/user_valid');
    expect(userCall).toBeDefined();
    expect(userCall[1].premium.provider).toBe('polar');
    expect(userCall[1].premium.isPremium).toBe(true);
    expect(userCall[1].premium.productId).toBe('showseek_yearly_sub');
    expect(userCall[1].premium.subscriptionType).toBe('yearly');
    expect(userCall[1].premium.polarLastEventId).toBe('wh_valid');

    const eventCall = setCalls.find(
      (c) => c[0].path === 'polarWebhookEvents/wh_valid'
    );
    expect(eventCall).toBeDefined();
    expect(eventCall[1].status).toBe('processed');
  });
});
