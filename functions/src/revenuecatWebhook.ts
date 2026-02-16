import * as admin from 'firebase-admin';
import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import * as crypto from 'node:crypto';

export const REVENUECAT_WEBHOOK_AUTH = defineSecret('REVENUECAT_WEBHOOK_AUTH');
export const REVENUECAT_API_KEY = defineSecret('REVENUECAT_API_KEY');

const LEGACY_LIFETIME_PRODUCT_ID = 'premium_unlock';
const MONTHLY_SUBSCRIPTION_PRODUCT_ID = 'monthly_showseek_sub';
const YEARLY_SUBSCRIPTION_PRODUCT_ID = 'showseek_yearly_sub';

const ACTIVE_EVENT_TYPES = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'PRODUCT_CHANGE',
]);

export interface RevenueCatEventPayload {
  app_user_id?: string;
  entitlement_ids?: string[];
  event_timestamp_ms?: number | string | null;
  expiration_at_ms?: number | string | null;
  id?: string;
  period_type?: string | null;
  product_id?: string | null;
  product_plan_identifier?: string | null;
  purchased_at_ms?: number | string | null;
  store_transaction_id?: string | null;
  transaction_id?: string | null;
  type?: string;
}

export interface RevenueCatWebhookPayload {
  event?: RevenueCatEventPayload;
}

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
  productId?: string | null;
  purchaseDate?: admin.firestore.Timestamp | null;
  purchaseToken?: string | null;
  rcLastEventTimestampMs?: number;
  subscriptionState?: string | null;
  subscriptionType?: 'monthly' | 'yearly' | null;
  trialConsumedAt?: admin.firestore.Timestamp | null;
  trialEndAt?: admin.firestore.Timestamp | null;
  trialStartAt?: admin.firestore.Timestamp | null;
}

const parseMillis = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
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

const normalizeEventType = (eventType: unknown): string =>
  String(eventType ?? '')
    .trim()
    .toUpperCase();

export const resolveRevenueCatEventTimestampMs = (
  event: RevenueCatEventPayload,
  nowMs: number
): number => {
  return (
    parseMillis(event.event_timestamp_ms) ??
    parseMillis(event.purchased_at_ms) ??
    parseMillis(event.expiration_at_ms) ??
    nowMs
  );
};

const resolveSubscriptionType = (
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

const hasExistingTrialHistory = (existingPremium: ExistingPremiumData): boolean => {
  return (
    existingPremium.hasUsedTrial === true ||
    existingPremium.trialConsumedAt != null ||
    existingPremium.trialStartAt != null
  );
};

const resolveExistingTrialConsumedAt = (
  existingPremium: ExistingPremiumData
): admin.firestore.Timestamp | null => {
  return existingPremium.trialConsumedAt ?? existingPremium.trialStartAt ?? null;
};

const isLegacyLifetimeEntitlement = (existingPremium: ExistingPremiumData): boolean => {
  return (
    existingPremium.entitlementType === 'lifetime' ||
    existingPremium.productId === LEGACY_LIFETIME_PRODUCT_ID
  );
};

const resolveWebhookAuthToken = (authorizationHeader: string | undefined): string => {
  const rawValue = String(authorizationHeader ?? '').trim();
  if (!rawValue) {
    return '';
  }

  if (rawValue.toLowerCase().startsWith('bearer ')) {
    return rawValue.slice(7).trim();
  }

  return rawValue;
};

export const mapRevenueCatEventToPremiumPayload = (
  event: RevenueCatEventPayload,
  existingPremium: ExistingPremiumData,
  nowMs: number
): Record<string, unknown> => {
  const eventType = normalizeEventType(event.type);
  const eventTimestampMs = resolveRevenueCatEventTimestampMs(event, nowMs);

  const productId = event.product_id ?? existingPremium.productId ?? null;
  const expiresAtMs = parseMillis(event.expiration_at_ms);
  const purchasedAtMs = parseMillis(event.purchased_at_ms);

  const expiresAt = toTimestamp(expiresAtMs) ?? existingPremium.expiresAt ?? null;
  const purchaseDate =
    toTimestamp(purchasedAtMs) ??
    existingPremium.purchaseDate ??
    admin.firestore.Timestamp.fromMillis(eventTimestampMs);

  const premiumFromExpiry =
    expiresAtMs !== null ? expiresAtMs > nowMs : existingPremium.isPremium === true;
  const isTrialEvent =
    String(event.period_type ?? '')
      .trim()
      .toUpperCase() === 'TRIAL';

  let isPremium = premiumFromExpiry;
  let subscriptionState = existingPremium.subscriptionState ?? null;

  if (ACTIVE_EVENT_TYPES.has(eventType)) {
    isPremium = premiumFromExpiry;
    subscriptionState = isPremium ? 'ACTIVE' : 'EXPIRED';
  } else if (eventType === 'CANCELLATION') {
    isPremium = premiumFromExpiry;
    subscriptionState = isPremium ? 'CANCELLED' : 'EXPIRED';
  } else if (eventType === 'BILLING_ISSUE') {
    isPremium = premiumFromExpiry;
    subscriptionState = isPremium ? 'BILLING_ISSUE' : 'EXPIRED';
  } else if (eventType === 'EXPIRATION') {
    isPremium = false;
    subscriptionState = 'EXPIRED';
  }

  const existingHasUsedTrial = hasExistingTrialHistory(existingPremium);
  const hasUsedTrial = existingHasUsedTrial || isTrialEvent;

  const trialStartAt =
    isTrialEvent && isPremium ? toTimestamp(purchasedAtMs ?? eventTimestampMs) : null;
  const trialEndAt = isTrialEvent && isPremium ? expiresAt : null;

  const trialConsumedAt = hasUsedTrial
    ? (resolveExistingTrialConsumedAt(existingPremium) ?? trialStartAt)
    : null;

  const fallbackExpiredAt = admin.firestore.Timestamp.fromMillis(nowMs);
  const expiredAt = isPremium
    ? null
    : (toTimestamp(expiresAtMs) ??
      existingPremium.expiredAt ??
      existingPremium.expireAt ??
      fallbackExpiredAt);

  const preservedLifetime = isLegacyLifetimeEntitlement(existingPremium) && !isPremium;
  if (preservedLifetime) {
    return {
      isPremium: true,
      entitlementType: 'lifetime',
      purchaseToken: existingPremium.purchaseToken ?? null,
      productId: existingPremium.productId ?? LEGACY_LIFETIME_PRODUCT_ID,
      orderId: existingPremium.orderId ?? null,
      purchaseDate:
        existingPremium.purchaseDate ?? admin.firestore.Timestamp.fromMillis(eventTimestampMs),
      subscriptionState: null,
      expiresAt: null,
      basePlanId: null,
      subscriptionType: null,
      isInTrial: false,
      trialStartAt: null,
      trialEndAt: null,
      hasUsedTrial,
      trialConsumedAt,
      expiredAt: null,
      expireAt: null,
      lastValidatedAt: admin.firestore.FieldValue.serverTimestamp(),
      rcLastEventType: eventType,
      rcLastEventTimestampMs: eventTimestampMs,
      rcLastEventId: event.id ?? null,
    };
  }

  return {
    isPremium,
    entitlementType: isPremium ? 'subscription' : 'none',
    purchaseToken: existingPremium.purchaseToken ?? null,
    productId,
    orderId: event.transaction_id ?? event.store_transaction_id ?? existingPremium.orderId ?? null,
    purchaseDate,
    subscriptionState,
    expiresAt,
    basePlanId: event.product_plan_identifier ?? existingPremium.basePlanId ?? null,
    subscriptionType:
      resolveSubscriptionType(productId) ?? existingPremium.subscriptionType ?? null,
    isInTrial: isTrialEvent && isPremium,
    trialStartAt,
    trialEndAt,
    hasUsedTrial,
    trialConsumedAt,
    expiredAt,
    expireAt: expiredAt,
    lastValidatedAt: admin.firestore.FieldValue.serverTimestamp(),
    rcLastEventType: eventType,
    rcLastEventTimestampMs: eventTimestampMs,
    rcLastEventId: event.id ?? null,
  };
};

export const revenuecatWebhook = onRequest(
  { secrets: [REVENUECAT_WEBHOOK_AUTH] },
  async (req, res): Promise<void> => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    const providedToken = resolveWebhookAuthToken(req.header('authorization'));
    const expectedToken = REVENUECAT_WEBHOOK_AUTH.value();

    if (!providedToken || !expectedToken) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const providedTokenBuffer = Buffer.from(providedToken, 'utf8');
    const expectedTokenBuffer = Buffer.from(expectedToken, 'utf8');
    if (
      providedTokenBuffer.length !== expectedTokenBuffer.length ||
      !crypto.timingSafeEqual(providedTokenBuffer, expectedTokenBuffer)
    ) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const payload = (req.body ?? {}) as RevenueCatWebhookPayload;
    const event = payload.event;

    if (!event) {
      res.status(400).json({ error: 'Missing event payload' });
      return;
    }

    const appUserId = String(event.app_user_id ?? '').trim();
    const eventId = String(event.id ?? '').trim();

    if (!appUserId || !eventId) {
      res.status(400).json({ error: 'Missing app_user_id or event.id' });
      return;
    }

    const nowMs = Date.now();
    const db = admin.firestore();
    const userRef = db.collection('users').doc(appUserId);
    const eventRef = db.collection('revenuecatWebhookEvents').doc(eventId);

    try {
      const result = await db.runTransaction(async (transaction) => {
        const existingEventDoc = await transaction.get(eventRef);
        if (existingEventDoc.exists) {
          return { status: 'duplicate' as const };
        }

        const userDoc = await transaction.get(userRef);
        const existingPremium = (userDoc.data()?.premium ?? {}) as ExistingPremiumData;

        const eventTimestampMs = resolveRevenueCatEventTimestampMs(event, nowMs);
        const existingTimestampMs = Number(existingPremium.rcLastEventTimestampMs ?? 0);

        if (existingTimestampMs > 0 && eventTimestampMs < existingTimestampMs) {
          transaction.set(eventRef, {
            appUserId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            eventTimestampMs,
            status: 'stale',
            type: normalizeEventType(event.type),
          });

          return { status: 'stale' as const };
        }

        const premiumPayload = mapRevenueCatEventToPremiumPayload(event, existingPremium, nowMs);

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
          type: normalizeEventType(event.type),
        });

        return { status: 'processed' as const };
      });

      res.status(200).json({ ok: true, status: result.status });
    } catch (error) {
      console.error('RevenueCat webhook failed:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);
