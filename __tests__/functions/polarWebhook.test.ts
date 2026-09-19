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
const mockGetUser = jest.fn();

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
    auth: jest.fn(() => ({
      getUser: mockGetUser,
    })),
    firestore: firestoreFn,
  }),
  { virtual: true }
);
import * as crypto from 'crypto';
import {
  extractFirebaseUid,
  mapPolarEventToPremiumPayload,
  polarWebhook,
  resolvePolarEventTimestampMs,
  resolvePolarProductId,
  resolveSubscriptionType,
  verifyPolarWebhookSignature,
  WEBHOOK_TOLERANCE_IN_SECONDS,
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

  it('maps order.paid with configured monthly product ID to active premium payload', () => {
    const nowMs = 1_000;
    const event: GenericPolarEvent = {
      type: 'order.paid',
      timestamp: nowMs,
      data: {
        id: 'order_monthly_1',
        customer_id: 'cust_order_1',
        product_id: 'polar_prod_monthly',
      },
    };

    const payload = mapPolarEventToPremiumPayload(event, baseExisting, config, nowMs);

    expect(payload.isPremium).toBe(true);
    expect(payload.provider).toBe('polar');
    expect(payload.subscriptionState).toBe('ACTIVE');
    expect(payload.productId).toBe('monthly_showseek_sub');
    expect(payload.subscriptionType).toBe('monthly');
    expect(payload.orderId).toBe('order_monthly_1');
  });

  it('maps order.paid with configured yearly product ID to active premium payload', () => {
    const nowMs = 1_000;
    const event: GenericPolarEvent = {
      type: 'order.paid',
      timestamp: nowMs,
      data: {
        id: 'order_yearly_1',
        customer_id: 'cust_order_2',
        product_id: 'polar_prod_yearly',
      },
    };

    const payload = mapPolarEventToPremiumPayload(event, baseExisting, config, nowMs);

    expect(payload.isPremium).toBe(true);
    expect(payload.provider).toBe('polar');
    expect(payload.subscriptionState).toBe('ACTIVE');
    expect(payload.productId).toBe('showseek_yearly_sub');
    expect(payload.subscriptionType).toBe('yearly');
    expect(payload.orderId).toBe('order_yearly_1');
  });

  it('leaves existing state untouched for order.paid with unconfigured product ID', () => {
    const nowMs = 1_000;
    const event: GenericPolarEvent = {
      type: 'order.paid',
      timestamp: nowMs,
      data: {
        id: 'order_unrelated_1',
        customer_id: 'cust_order_3',
        product_id: 'polar_prod_donation',
      },
    };

    const existing: ExistingPremiumData = {
      isPremium: true,
      provider: 'revenuecat',
      entitlementType: 'pro',
      productId: 'rc_annual',
      subscriptionState: 'ACTIVE',
    };

    const payload = mapPolarEventToPremiumPayload(event, existing, config, nowMs);

    expect(payload.isPremium).toBe(true);
    expect(payload.provider).toBe('revenuecat');
    expect(payload.entitlementType).toBe('pro');
    expect(payload.productId).toBe('rc_annual');
    expect(payload.subscriptionState).toBe('ACTIVE');
    expect(payload.orderId).toBeUndefined();
    expect(payload.polarLastEventTimestampMs).toBeUndefined();
    expect(payload.polarCustomerId).toBeUndefined();
  });

  it('leaves existing state untouched for order.paid with missing product ID', () => {
    const nowMs = 1_000;
    const event: GenericPolarEvent = {
      type: 'order.paid',
      timestamp: nowMs,
      data: {
        id: 'order_no_prod',
        customer_id: 'cust_order_4',
      },
    };

    const existing: ExistingPremiumData = {
      isPremium: false,
    };

    const payload = mapPolarEventToPremiumPayload(event, existing, config, nowMs);

    expect(payload.isPremium).toBe(false);
    expect(payload.provider).toBeUndefined();
    expect(payload.entitlementType).toBeUndefined();
    expect(payload.subscriptionState).toBeUndefined();
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

  const createSignedRequest = (
    payload: any,
    webhookId = 'wh_test',
    timestampSec = Math.floor(Date.now() / 1000),
    secret = 'whsec_test_secret',
  ) => {
    const rawBody = JSON.stringify(payload);
    const toSign = `${webhookId}.${timestampSec}.${rawBody}`;
    const stripped = secret.startsWith('whsec_') ? secret.slice(6) : secret;
    const keyBytes = Buffer.from(stripped, 'base64');
    const sig = crypto.createHmac('sha256', keyBytes).update(toSign).digest('base64');

    return {
      method: 'POST',
      rawBody: Buffer.from(rawBody, 'utf8'),
      body: payload,
      headers: {
        'webhook-id': webhookId,
        'webhook-timestamp': timestampSec.toString(),
        'webhook-signature': `v1,${sig}`,
      },
    };
  };

  it('rejects invalid signatures with 401', async () => {
    const response = createResponse();

    await polarWebhook(
      {
        body: {},
        headers: {
          'webhook-id': 'wh_bad',
          'webhook-timestamp': Math.floor(Date.now() / 1000).toString(),
          'webhook-signature': 'v1,bad_signature',
        },
        method: 'POST',
      } as any,
      response as any
    );

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({
      error: 'Unauthorized: Invalid webhook signature',
    });
  });

  it('rejects missing required headers with 401', async () => {
    const response = createResponse();

    await polarWebhook(
      {
        body: {},
        headers: {
          'webhook-signature': 'v1,something',
        },
        method: 'POST',
      } as any,
      response as any
    );

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({
      error: 'Unauthorized: Invalid webhook signature',
    });
  });

  it('rejects timestamp outside tolerance with 401', async () => {
    const response = createResponse();
    const oldTimestamp = Math.floor(Date.now() / 1000) - 301;
    const req = createSignedRequest({ type: 'order.paid' }, 'wh_old', oldTimestamp);

    await polarWebhook(req as any, response as any);

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({
      error: 'Unauthorized: Webhook timestamp outside tolerance',
    });
  });

  it('rejects payload missing data field with 400', async () => {
    const response = createResponse();
    const req = createSignedRequest({ type: 'order.paid', timestamp: 1000 }, 'wh_no_data');

    await polarWebhook(req as any, response as any);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      error: 'Invalid event payload',
    });
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it('rejects payload missing timestamp with 400 without writing to Firestore', async () => {
    const response = createResponse();
    const req = createSignedRequest(
      {
        type: 'subscription.active',
        data: {
          id: 'sub_no_ts',
          customer: { external_id: 'user_no_ts' },
        },
      },
      'wh_no_ts'
    );

    await polarWebhook(req as any, response as any);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      error: 'Invalid event payload',
    });
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it('rejects payload with unparsable timestamp with 400 without advancing polarLastEventTimestampMs', async () => {
    const response = createResponse();
    const req = createSignedRequest(
      {
        type: 'subscription.active',
        timestamp: 'invalid-date-format',
        data: {
          id: 'sub_bad_ts',
          customer: { external_id: 'user_bad_ts' },
        },
      },
      'wh_bad_ts'
    );

    await polarWebhook(req as any, response as any);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      error: 'Invalid event payload',
    });
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it('skips processing if event is missing external_id', async () => {
    const response = createResponse();
    const req = createSignedRequest(
      {
        type: 'subscription.active',
        timestamp: 1000,
        data: { id: 'sub_no_ext' },
      },
      'wh_no_uid'
    );

    await polarWebhook(req as any, response as any);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      ok: true,
      status: 'skipped_no_external_id',
    });
  });

  it('treats duplicate webhook deliveries as idempotent', async () => {
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
    const req = createSignedRequest(
      {
        type: 'subscription.active',
        timestamp: 1000,
        data: {
          id: 'sub_dup',
          customer: { external_id: 'user_dup' },
        },
      },
      'wh_dup'
    );

    await polarWebhook(req as any, response as any);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ ok: true, status: 'duplicate' });
  });

  it('marks stale events and skips premium write', async () => {
    const transactionSet = jest.fn();

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
    const req = createSignedRequest(
      {
        type: 'subscription.updated',
        timestamp: 500,
        data: {
          id: 'sub_stale',
          customer: { external_id: 'user_stale' },
        },
      },
      'wh_stale'
    );

    await polarWebhook(req as any, response as any);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ ok: true, status: 'stale' });

    const setPaths = transactionSet.mock.calls.map((c) => c[0].path);
    expect(setPaths).toContain('polarWebhookEvents/wh_stale');
    expect(setPaths).not.toContain('users/user_stale');
  });

  it('processes valid event and writes merged premium state', async () => {
    const transactionSet = jest.fn();

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
    const req = createSignedRequest(
      {
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
      },
      'wh_valid'
    );

    await polarWebhook(req as any, response as any);

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

  it('does not bump polarLastEventTimestampMs on unconfigured order.paid, preventing staleness drops for subsequent subscription events', async () => {
    const transactionSet = jest.fn();

    const initialPremium = {
      isPremium: true,
      provider: 'polar' as const,
      subscriptionState: 'ACTIVE',
      subscriptionType: 'monthly' as const,
      productId: 'monthly_showseek_sub',
      polarLastEventTimestampMs: 1000,
    };

    mockRunTransaction.mockImplementationOnce(async (callback: any) => {
      const transaction = {
        get: jest.fn(async (ref: { path: string }) => {
          if (ref.path.startsWith('polarWebhookEvents/')) {
            return { exists: false };
          }
          return {
            data: () => ({ premium: initialPremium }),
            exists: true,
          };
        }),
        set: transactionSet,
      };
      return await callback(transaction);
    });

    const response = createResponse();
    const req = createSignedRequest(
      {
        type: 'order.paid',
        timestamp: 2000,
        data: {
          id: 'order_donation',
          customer: { external_id: 'user_ordered' },
          product_id: 'polar_unrelated_prod',
        },
      },
      'wh_order_unrelated'
    );

    await polarWebhook(req as any, response as any);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ ok: true, status: 'processed' });

    const userCall = transactionSet.mock.calls.find((c) => c[0].path === 'users/user_ordered');
    expect(userCall).toBeDefined();
    expect(userCall[1].premium.polarLastEventTimestampMs).toBe(1000);
    expect(userCall[1].premium.isPremium).toBe(true);
    expect(userCall[1].premium.productId).toBe('monthly_showseek_sub');
  });

  it('skips the user write when neither the user doc nor the Auth user exists', async () => {
    const transactionSet = jest.fn();
    mockGetUser.mockRejectedValueOnce({ code: 'auth/user-not-found' });

    mockRunTransaction.mockImplementationOnce(async (callback: any) => {
      const transaction = {
        get: jest.fn(async (ref: { path: string }) => {
          if (ref.path.startsWith('polarWebhookEvents/')) {
            return { exists: false };
          }
          return {
            data: () => undefined,
            exists: false,
          };
        }),
        set: transactionSet,
      };
      return await callback(transaction);
    });

    const response = createResponse();
    const req = createSignedRequest(
      {
        type: 'subscription.revoked',
        timestamp: 3000,
        data: {
          id: 'sub_deleted',
          customer: { external_id: 'user_deleted' },
        },
      },
      'wh_deleted_user'
    );

    await polarWebhook(req as any, response as any);

    expect(mockGetUser).toHaveBeenCalledWith('user_deleted');
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ ok: true, status: 'skipped_no_user' });

    const setPaths = transactionSet.mock.calls.map((c) => c[0].path);
    expect(setPaths).toContain('polarWebhookEvents/wh_deleted_user');
    expect(setPaths).not.toContain('users/user_deleted');
  });

  it('still writes premium when the user doc is missing but the Auth user exists', async () => {
    const transactionSet = jest.fn();
    mockGetUser.mockResolvedValueOnce({ uid: 'user_nodoc' });

    mockRunTransaction.mockImplementationOnce(async (callback: any) => {
      const transaction = {
        get: jest.fn(async (ref: { path: string }) => {
          if (ref.path.startsWith('polarWebhookEvents/')) {
            return { exists: false };
          }
          return {
            data: () => undefined,
            exists: false,
          };
        }),
        set: transactionSet,
      };
      return await callback(transaction);
    });

    const response = createResponse();
    const req = createSignedRequest(
      {
        type: 'subscription.active',
        timestamp: 4000,
        data: {
          id: 'sub_nodoc',
          customer_id: 'cust_nodoc',
          customer: { external_id: 'user_nodoc' },
          product_id: 'polar_prod_monthly',
          status: 'active',
          current_period_start: 4000,
          current_period_end: 4000 + 30 * 86400_000,
        },
      },
      'wh_nodoc'
    );

    await polarWebhook(req as any, response as any);

    expect(mockGetUser).toHaveBeenCalledWith('user_nodoc');
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ ok: true, status: 'processed' });

    const setPaths = transactionSet.mock.calls.map((c) => c[0].path);
    expect(setPaths).toContain('users/user_nodoc');
  });
});

describe('verifyPolarWebhookSignature', () => {
  const secret = 'whsec_test_secret';
  const rawBody = JSON.stringify({ type: 'order.paid' });
  const webhookId = 'msg_123';
  const now = 1700000000;

  it('validates a correctly signed payload within tolerance', () => {
    const stripped = secret.slice(6);
    const keyBytes = Buffer.from(stripped, 'base64');
    const sig = crypto
      .createHmac('sha256', keyBytes)
      .update(`${webhookId}.${now}.${rawBody}`)
      .digest('base64');

    const result = verifyPolarWebhookSignature(
      rawBody,
      {
        'webhook-id': webhookId,
        'webhook-timestamp': now.toString(),
        'webhook-signature': `v1,${sig}`,
      },
      secret,
      { nowSec: now }
    );

    expect(result.valid).toBe(true);
    expect(result.webhookId).toBe(webhookId);
  });

  it('rejects timestamp older than tolerance', () => {
    const oldTimestamp = now - 301;
    const stripped = secret.slice(6);
    const keyBytes = Buffer.from(stripped, 'base64');
    const sig = crypto
      .createHmac('sha256', keyBytes)
      .update(`${webhookId}.${oldTimestamp}.${rawBody}`)
      .digest('base64');

    const result = verifyPolarWebhookSignature(
      rawBody,
      {
        'webhook-id': webhookId,
        'webhook-timestamp': oldTimestamp.toString(),
        'webhook-signature': `v1,${sig}`,
      },
      secret,
      { nowSec: now, toleranceSeconds: 300 }
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('timestamp_out_of_tolerance');
  });

  it('rejects timestamp newer than tolerance', () => {
    const futureTimestamp = now + 301;
    const stripped = secret.slice(6);
    const keyBytes = Buffer.from(stripped, 'base64');
    const sig = crypto
      .createHmac('sha256', keyBytes)
      .update(`${webhookId}.${futureTimestamp}.${rawBody}`)
      .digest('base64');

    const result = verifyPolarWebhookSignature(
      rawBody,
      {
        'webhook-id': webhookId,
        'webhook-timestamp': futureTimestamp.toString(),
        'webhook-signature': `v1,${sig}`,
      },
      secret,
      { nowSec: now, toleranceSeconds: 300 }
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('timestamp_out_of_tolerance');
  });

  it('rejects an invalid signature', () => {
    const result = verifyPolarWebhookSignature(
      rawBody,
      {
        'webhook-id': webhookId,
        'webhook-timestamp': now.toString(),
        'webhook-signature': 'v1,invalidbase64signature==',
      },
      secret,
      { nowSec: now }
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('invalid_signature');
  });

  it('rejects missing required headers', () => {
    const result = verifyPolarWebhookSignature(
      rawBody,
      {
        'webhook-id': webhookId,
      },
      secret,
      { nowSec: now }
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('missing_headers');
  });
});
