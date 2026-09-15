import * as admin from 'firebase-admin';
import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import { validateEvent, WebhookVerificationError } from '@polar-sh/sdk/webhooks';
import { SDKValidationError } from '@polar-sh/sdk/models/errors/sdkvalidationerror';
import {
  MONTHLY_SUBSCRIPTION_PRODUCT_ID,
  YEARLY_SUBSCRIPTION_PRODUCT_ID,
} from './shared/premiumProducts';

export const POLAR_WEBHOOK_SECRET = defineSecret('POLAR_WEBHOOK_SECRET');
export const POLAR_PRODUCT_ID_MONTHLY = defineSecret('POLAR_PRODUCT_ID_MONTHLY');
export const POLAR_PRODUCT_ID_YEARLY = defineSecret('POLAR_PRODUCT_ID_YEARLY');

export interface ExistingPremiumData {
  basePlanId?: string | null;
  entitlementType?: string | null;
  expireAt?: admin.firestore.Timestamp | null;
  expiredAt?: admin.firestore.Timestamp | null;
  expiresAt?: admin.firestore.Timestamp | null;
  hasUsedTrial?: boolean;
  isPremium?: boolean;
  isInTrial?: boolean;
  orderId?: string | null;
  polarCustomerId?: string | null;
  polarLastEventId?: string | null;
  polarLastEventTimestampMs?: number;
  polarSubscriptionId?: string | null;
  productId?: string | null;
  provider?: 'polar' | 'revenuecat' | null;
  purchaseDate?: admin.firestore.Timestamp | null;
  purchaseToken?: string | null;
  rcLastEventTimestampMs?: number;
  subscriptionState?: string | null;
  subscriptionType?: 'monthly' | 'yearly' | null;
  trialConsumedAt?: admin.firestore.Timestamp | null;
  trialEndAt?: admin.firestore.Timestamp | null;
  trialStartAt?: admin.firestore.Timestamp | null;
}

export interface PolarWebhookConfig {
  monthlyProductId?: string | null;
  yearlyProductId?: string | null;
}

export interface GenericPolarEvent {
  type: string;
  timestamp?: Date | string | number | null;
  data: Record<string, any>;
}

const parseMillis = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return numeric;
};

const toTimestamp = (millis: number | null): admin.firestore.Timestamp | null => {
  if (millis === null) {
    return null;
  }
  return admin.firestore.Timestamp.fromMillis(millis);
};

export const resolvePolarEventTimestampMs = (
  event: GenericPolarEvent,
  nowMs: number
): number => {
  return (
    parseMillis(event.timestamp) ??
    parseMillis(event.data.current_period_start) ??
    parseMillis(event.data.currentPeriodStart) ??
    parseMillis(event.data.created_at) ??
    parseMillis(event.data.createdAt) ??
    nowMs
  );
};

export const resolvePolarProductId = (
  rawProductId: string | null | undefined,
  config: PolarWebhookConfig
): string | null => {
  if (!rawProductId) {
    return null;
  }

  const trimmed = rawProductId.trim();
  if (config.monthlyProductId && trimmed === config.monthlyProductId.trim()) {
    return MONTHLY_SUBSCRIPTION_PRODUCT_ID;
  }

  if (config.yearlyProductId && trimmed === config.yearlyProductId.trim()) {
    return YEARLY_SUBSCRIPTION_PRODUCT_ID;
  }

  return trimmed;
};

export const resolveSubscriptionType = (
  productId?: string | null
): ExistingPremiumData['subscriptionType'] => {
  if (productId === MONTHLY_SUBSCRIPTION_PRODUCT_ID) {
    return 'monthly';
  }

  if (productId === YEARLY_SUBSCRIPTION_PRODUCT_ID) {
    return 'yearly';
  }

  return null;
};

export const extractFirebaseUid = (event: GenericPolarEvent): string | null => {
  const data = event.data;
  const customer = data.customer ?? {};
  const directUid =
    customer.external_id ??
    customer.externalId ??
    data.external_customer_id ??
    data.externalCustomerId ??
    data.metadata?.firebase_uid ??
    data.metadata?.userId ??
    data.metadata?.uid;

  if (typeof directUid === 'string' && directUid.trim()) {
    return directUid.trim();
  }

  return null;
};

export const mapPolarEventToPremiumPayload = (
  event: GenericPolarEvent,
  existingPremium: ExistingPremiumData,
  config: PolarWebhookConfig,
  nowMs: number
): Record<string, unknown> => {
  const eventTimestampMs = resolvePolarEventTimestampMs(event, nowMs);
  const data = event.data;

  const rawProductId =
    data.product_id ??
    data.productId ??
    data.product?.id ??
    existingPremium.productId ??
    null;
  const productId = resolvePolarProductId(rawProductId, config) ?? existingPremium.productId ?? null;
  const subscriptionType = resolveSubscriptionType(productId) ?? existingPremium.subscriptionType ?? null;

  const subscriptionId = data.subscription_id ?? data.subscriptionId ?? (event.type.startsWith('subscription.') ? data.id : existingPremium.polarSubscriptionId) ?? null;
  const customerId = data.customer_id ?? data.customerId ?? data.customer?.id ?? existingPremium.polarCustomerId ?? null;
  const orderId = (event.type === 'order.paid' ? data.id : existingPremium.orderId) ?? null;

  const currentPeriodStartMs = parseMillis(data.current_period_start ?? data.currentPeriodStart);
  const currentPeriodEndMs = parseMillis(data.current_period_end ?? data.currentPeriodEnd ?? data.ends_at ?? data.endsAt);
  const trialStartMs = parseMillis(data.trial_start ?? data.trialStart);
  const trialEndMs = parseMillis(data.trial_end ?? data.trialEnd);
  const startedAtMs = parseMillis(data.started_at ?? data.startedAt ?? data.created_at ?? data.createdAt);

  const purchaseDate =
    toTimestamp(startedAtMs ?? currentPeriodStartMs) ??
    existingPremium.purchaseDate ??
    admin.firestore.Timestamp.fromMillis(eventTimestampMs);

  const expiresAt = toTimestamp(currentPeriodEndMs) ?? existingPremium.expiresAt ?? null;
  const rawStatus = String(data.status ?? '').trim().toLowerCase();

  let isPremium = existingPremium.isPremium === true;
  let subscriptionState: string | null = existingPremium.subscriptionState ?? null;
  let isInTrial = existingPremium.isInTrial === true;

  const isPeriodActive = currentPeriodEndMs !== null ? currentPeriodEndMs > nowMs : true;

  switch (event.type) {
    case 'subscription.active':
      isPremium = true;
      subscriptionState = 'ACTIVE';
      isInTrial = rawStatus === 'trialing';
      break;

    case 'subscription.canceled':
      isPremium = isPeriodActive;
      subscriptionState = isPeriodActive ? 'CANCELLED' : 'EXPIRED';
      isInTrial = false;
      break;

    case 'subscription.revoked':
    case 'subscription.paused':
      isPremium = false;
      subscriptionState = 'EXPIRED';
      isInTrial = false;
      break;

    case 'subscription.updated':
      if (rawStatus === 'active') {
        isPremium = true;
        subscriptionState = 'ACTIVE';
        isInTrial = false;
      } else if (rawStatus === 'trialing') {
        isPremium = true;
        subscriptionState = 'ACTIVE';
        isInTrial = true;
      } else if (rawStatus === 'past_due') {
        isPremium = true;
        subscriptionState = 'BILLING_ISSUE';
      } else if (rawStatus === 'canceled') {
        isPremium = isPeriodActive;
        subscriptionState = isPeriodActive ? 'CANCELLED' : 'EXPIRED';
        isInTrial = false;
      } else if (
        rawStatus === 'unpaid' ||
        rawStatus === 'incomplete' ||
        rawStatus === 'incomplete_expired' ||
        rawStatus === 'paused'
      ) {
        isPremium = false;
        subscriptionState = 'EXPIRED';
        isInTrial = false;
      } else {
        isPremium = isPeriodActive;
      }
      break;

    case 'order.paid':
      isPremium = true;
      subscriptionState = 'ACTIVE';
      break;

    default:
      break;
  }

  const isTrialEvent = isInTrial || rawStatus === 'trialing';
  const existingHasUsedTrial =
    existingPremium.hasUsedTrial === true ||
    existingPremium.trialConsumedAt != null ||
    existingPremium.trialStartAt != null;
  const hasUsedTrial = existingHasUsedTrial || isTrialEvent;

  const trialStartAt = isTrialEvent && isPremium ? (toTimestamp(trialStartMs) ?? purchaseDate) : null;
  const trialEndAt = isTrialEvent && isPremium ? (toTimestamp(trialEndMs) ?? expiresAt) : null;
  const trialConsumedAt = hasUsedTrial
    ? (existingPremium.trialConsumedAt ?? existingPremium.trialStartAt ?? trialStartAt)
    : null;

  const fallbackExpiredAt = admin.firestore.Timestamp.fromMillis(nowMs);
  const expiredAt = isPremium
    ? null
    : (toTimestamp(currentPeriodEndMs) ??
      existingPremium.expiredAt ??
      existingPremium.expireAt ??
      fallbackExpiredAt);

  return {
    isPremium,
    entitlementType: isPremium ? 'subscription' : 'none',
    provider: 'polar',
    purchaseToken: existingPremium.purchaseToken ?? null,
    productId,
    orderId,
    purchaseDate,
    subscriptionState,
    expiresAt,
    basePlanId: null,
    subscriptionType,
    isInTrial: isTrialEvent && isPremium,
    trialStartAt,
    trialEndAt,
    hasUsedTrial,
    trialConsumedAt,
    expiredAt,
    expireAt: expiredAt,
    lastValidatedAt: admin.firestore.FieldValue.serverTimestamp(),
    polarLastEventTimestampMs: eventTimestampMs,
    polarSubscriptionId: subscriptionId,
    polarCustomerId: customerId,
  };
};

export const polarWebhook = onRequest(
  { secrets: [POLAR_WEBHOOK_SECRET, POLAR_PRODUCT_ID_MONTHLY, POLAR_PRODUCT_ID_YEARLY] },
  async (req, res): Promise<void> => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    const rawSecret = POLAR_WEBHOOK_SECRET.value() || process.env.POLAR_WEBHOOK_SECRET || '';
    const webhookSecret = rawSecret.trim();

    if (!webhookSecret) {
      console.error('Missing POLAR_WEBHOOK_SECRET');
      res.status(500).json({ error: 'Webhook secret not configured' });
      return;
    }

    const rawBody = (req as any).rawBody;
    const isRawBuffer = Buffer.isBuffer(rawBody);
    const bodyForValidation: string | Buffer = isRawBuffer
      ? rawBody
      : typeof rawBody === 'string'
      ? rawBody
      : JSON.stringify(req.body ?? {});

    const headersRecord: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        headersRecord[key.toLowerCase()] = value;
      } else if (Array.isArray(value) && value[0]) {
        headersRecord[key.toLowerCase()] = value[0];
      }
    }

    console.log('[Polar Webhook Debug]', {
      hasRawBody: !!rawBody,
      isRawBuffer,
      rawBodyLength: isRawBuffer
        ? rawBody.length
        : typeof rawBody === 'string'
        ? rawBody.length
        : null,
      secretLength: rawSecret.length,
      secretTrimmedLength: webhookSecret.length,
      secretHasWhitespace: rawSecret !== webhookSecret,
      secretStartsWithPrefix: webhookSecret.startsWith('whsec_'),
      webhookId: headersRecord['webhook-id'] || null,
      webhookTimestamp: headersRecord['webhook-timestamp'] || null,
      hasSignature: !!headersRecord['webhook-signature'],
    });

    if (!rawBody) {
      console.warn(
        '[Polar Webhook] req.rawBody is missing! Falling back to JSON.stringify(req.body); signature verification may fail.',
      );
    }

    let parsedEvent: GenericPolarEvent;
    try {
      try {
        parsedEvent = validateEvent(bodyForValidation, headersRecord, webhookSecret) as GenericPolarEvent;
      } catch (validationErr) {
        if (validationErr instanceof SDKValidationError) {
          parsedEvent = (validationErr as any).rawValue as GenericPolarEvent;
        } else {
          throw validationErr;
        }
      }
    } catch (error: any) {
      if (error instanceof WebhookVerificationError) {
        console.warn('Polar webhook signature verification failed:', error.message);
        res.status(401).json({ error: 'Unauthorized: Invalid webhook signature' });
        return;
      }

      console.error('Error verifying Polar webhook signature:', error);
      res.status(400).json({ error: 'Bad Request: Unable to verify webhook signature' });
      return;
    }

    if (!parsedEvent || !parsedEvent.type) {
      res.status(400).json({ error: 'Invalid event payload' });
      return;
    }

    const SUPPORTED_EVENTS = new Set([
      'order.paid',
      'subscription.active',
      'subscription.updated',
      'subscription.canceled',
      'subscription.revoked',
      'subscription.paused',
    ]);

    if (!SUPPORTED_EVENTS.has(parsedEvent.type)) {
      console.warn('Polar webhook event type not in SUPPORTED_EVENTS, ignoring:', {
        type: parsedEvent.type,
        webhookId: headersRecord['webhook-id'] || headersRecord['webhook_id'] || 'unknown',
      });
      res.status(200).json({ ok: true, status: 'ignored', type: parsedEvent.type });
      return;
    }

    const appUserId = extractFirebaseUid(parsedEvent);
    if (!appUserId) {
      console.warn('Polar webhook event missing external_id (Firebase UID):', {
        type: parsedEvent.type,
        dataId: parsedEvent.data?.id,
      });
      res.status(200).json({ ok: true, status: 'skipped_no_external_id' });
      return;
    }

    const webhookIdHeader =
      headersRecord['webhook-id'] ||
      headersRecord['webhook_id'] ||
      headersRecord['msg-id'];
    const eventId = String(
      webhookIdHeader ||
      `${parsedEvent.data?.id ?? 'polar'}_${parsedEvent.type}_${Date.now()}`
    ).trim();

    const config: PolarWebhookConfig = {
      monthlyProductId: POLAR_PRODUCT_ID_MONTHLY.value() || process.env.POLAR_PRODUCT_ID_MONTHLY,
      yearlyProductId: POLAR_PRODUCT_ID_YEARLY.value() || process.env.POLAR_PRODUCT_ID_YEARLY,
    };

    const nowMs = Date.now();
    const db = admin.firestore();
    const userRef = db.collection('users').doc(appUserId);
    const eventRef = db.collection('polarWebhookEvents').doc(eventId);

    try {
      const result = await db.runTransaction(async (transaction) => {
        const existingEventDoc = await transaction.get(eventRef);
        if (existingEventDoc.exists) {
          return { status: 'duplicate' as const };
        }

        const userDoc = await transaction.get(userRef);
        const existingPremium = (userDoc.data()?.premium ?? {}) as ExistingPremiumData;

        const eventTimestampMs = resolvePolarEventTimestampMs(parsedEvent, nowMs);
        const existingTimestampMs = Number(existingPremium.polarLastEventTimestampMs ?? 0);

        if (existingTimestampMs > 0 && eventTimestampMs < existingTimestampMs) {
          transaction.set(eventRef, {
            appUserId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            eventTimestampMs,
            status: 'stale',
            type: parsedEvent.type,
          });

          return { status: 'stale' as const };
        }

        const premiumPayload = {
          ...mapPolarEventToPremiumPayload(parsedEvent, existingPremium, config, nowMs),
          polarLastEventId: eventId,
        };

        transaction.set(
          userRef,
          {
            premium: premiumPayload,
          },
          { merge: true }
        );

        transaction.set(eventRef, {
          appUserId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          eventTimestampMs,
          status: 'processed',
          type: parsedEvent.type,
        });

        return { status: 'processed' as const };
      });

      res.status(200).json({ ok: true, status: result.status });
    } catch (error) {
      console.error('Polar webhook processing failed:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);
