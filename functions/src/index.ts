import * as admin from 'firebase-admin';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { deleteAccountHandler } from './accountDeletion';
import {
  DEFAULT_LEGACY_LIFETIME_PRODUCT_ID,
  MONTHLY_SUBSCRIPTION_PRODUCT_ID,
  YEARLY_SUBSCRIPTION_PRODUCT_ID,
  isLegacyLifetimeProductId,
} from './shared/premiumProducts';
import {
  fetchRevenueCatSubscriber,
  isTransientRevenueCatError,
  resolveRevenueCatPremiumState,
  type RevenueCatResolvedPremiumState,
} from './shared/revenuecatSubscriber';

admin.initializeApp();

const REVENUECAT_API_KEY = defineSecret('REVENUECAT_API_KEY');

/**
 * Deep-clone an error object and strip fields that may contain tokens,
 * credentials, or other sensitive data (e.g. axios/googleapis config).
 */
const sanitizeError = (err: unknown): unknown => {
  if (err === null || err === undefined) {
    return err;
  }

  try {
    // Structured clone gives us a safe mutable copy.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clone: any =
      err instanceof Error
        ? {
            name: (err as Error).name,
            message: (err as Error).message,
            stack: (err as Error).stack,
            ...structuredClone(
              Object.fromEntries(
                Object.entries(err as unknown as Record<string, unknown>).filter(
                  ([key]) => key !== 'request'
                )
              )
            ),
          }
        : structuredClone(err);

    // Scrub axios / googleapis config that may carry auth artefacts.
    if (clone && typeof clone === 'object') {
      if (clone.config && typeof clone.config === 'object') {
        delete clone.config.headers;
        delete clone.config.params;
        delete clone.config.auth;
        delete clone.config.data;
      }

      // Response objects may also carry config.
      if (clone.response && typeof clone.response === 'object') {
        if (clone.response.config && typeof clone.response.config === 'object') {
          delete clone.response.config.headers;
          delete clone.response.config.params;
          delete clone.response.config.auth;
          delete clone.response.config.data;
        }
        // Remove raw request reference if present.
        delete clone.response.request;
      }

      // Top-level request object (socket/http reference).
      delete clone.request;
    }

    return clone;
  } catch {
    // If cloning fails (circular refs, non-cloneable types, etc.),
    // fall back to a minimal representation.
    if (err instanceof Error) {
      return { name: err.name, message: err.message, stack: err.stack };
    }
    return String(err);
  }
};

type EntitlementType = 'lifetime' | 'subscription' | 'none';
type SubscriptionType = 'monthly' | 'yearly';

interface ExistingPremiumData {
  basePlanId?: string | null;
  entitlementType?: EntitlementType;
  expireAt?: admin.firestore.Timestamp | null;
  expiredAt?: admin.firestore.Timestamp | null;
  expiresAt?: admin.firestore.Timestamp | null;
  hasUsedTrial?: boolean;
  isPremium?: boolean;
  isInTrial?: boolean;
  orderId?: string | null;
  productId?: string | null;
  purchaseDate?: admin.firestore.Timestamp;
  purchaseToken?: string | null;
  subscriptionType?: SubscriptionType | null;
  subscriptionState?: string | null;
  trialConsumedAt?: admin.firestore.Timestamp | null;
  trialEndAt?: admin.firestore.Timestamp | null;
  trialStartAt?: admin.firestore.Timestamp | null;
}

const toTimestamp = (millis: number | null): admin.firestore.Timestamp | null => {
  if (millis === null) {
    return null;
  }

  return admin.firestore.Timestamp.fromMillis(millis);
};

const resolveSubscriptionType = (productId?: string | null): SubscriptionType | null => {
  if (productId === MONTHLY_SUBSCRIPTION_PRODUCT_ID) {
    return 'monthly';
  }

  if (productId === YEARLY_SUBSCRIPTION_PRODUCT_ID) {
    return 'yearly';
  }

  return null;
};

const resolveExpiredAt = (
  expiresAt: admin.firestore.Timestamp | null
): admin.firestore.Timestamp | null => {
  if (!expiresAt) {
    return null;
  }

  return expiresAt.toMillis() <= Date.now() ? expiresAt : null;
};

const resolveTrialConsumedAt = (
  existingPremium: ExistingPremiumData
): admin.firestore.Timestamp | null =>
  existingPremium.trialConsumedAt ?? existingPremium.trialStartAt ?? null;

const resolveHasUsedTrial = (existingPremium: ExistingPremiumData): boolean =>
  existingPremium.hasUsedTrial === true || resolveTrialConsumedAt(existingPremium) !== null;

const persistPremiumStatus = async (
  userId: string,
  premiumPayload: Record<string, unknown>,
  options?: {
    source?: string;
    reason?: string;
    previousIsPremium?: boolean | null;
  }
): Promise<void> => {
  console.error('[PREMIUM WRITE DETECTED][SERVER_WRITE]', {
    userId,
    source: options?.source ?? 'unknown',
    reason: options?.reason ?? 'unspecified',
    previousIsPremium: options?.previousIsPremium ?? null,
    nextIsPremium: typeof premiumPayload.isPremium === 'boolean' ? premiumPayload.isPremium : null,
    timestamp: Date.now(),
  });

  await admin.firestore().collection('users').doc(userId).set(
    {
      premium: premiumPayload,
    },
    { merge: true }
  );
};

interface NoneEntitlementOverrides {
  basePlanId?: string | null;
  expireAt?: admin.firestore.Timestamp | null;
  expiredAt?: admin.firestore.Timestamp | null;
  expiresAt?: admin.firestore.Timestamp | null;
  subscriptionState?: string | null;
  subscriptionType?: SubscriptionType | null;
}

const buildNoneEntitlementPayload = (
  existingPremium: ExistingPremiumData,
  overrides?: NoneEntitlementOverrides
): Record<string, unknown> => {
  const trialConsumedAt = resolveTrialConsumedAt(existingPremium);
  const hasUsedTrial = resolveHasUsedTrial(existingPremium);
  const resolvedSubscriptionType =
    overrides?.subscriptionType ??
    existingPremium.subscriptionType ??
    resolveSubscriptionType(existingPremium.productId ?? null);
  const resolvedExpiresAt =
    overrides?.expiresAt !== undefined ? overrides.expiresAt : (existingPremium.expiresAt ?? null);
  const resolvedExpiredAt =
    overrides?.expiredAt ??
    overrides?.expireAt ??
    existingPremium.expiredAt ??
    existingPremium.expireAt ??
    resolveExpiredAt(resolvedExpiresAt);
  const normalizedExpiredAt =
    resolvedExpiredAt && resolvedExpiredAt.toMillis() <= Date.now()
      ? resolvedExpiredAt
      : resolveExpiredAt(resolvedExpiresAt);

  return {
    isPremium: false,
    entitlementType: 'none',
    purchaseToken: existingPremium.purchaseToken ?? null,
    productId: existingPremium.productId ?? null,
    orderId: existingPremium.orderId ?? null,
    purchaseDate: existingPremium.purchaseDate ?? admin.firestore.FieldValue.serverTimestamp(),
    subscriptionState: overrides?.subscriptionState ?? existingPremium.subscriptionState ?? null,
    expiresAt: resolvedExpiresAt,
    basePlanId: overrides?.basePlanId ?? existingPremium.basePlanId ?? null,
    subscriptionType: resolvedSubscriptionType,
    isInTrial: false,
    trialStartAt: null,
    trialEndAt: null,
    hasUsedTrial,
    trialConsumedAt,
    // Keep both keys for backward compatibility across historical schema variants.
    expiredAt: normalizedExpiredAt,
    expireAt: normalizedExpiredAt,
    lastValidatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
};

type ReconcilePremiumStatusSource = 'firestore' | 'revenuecat' | 'both' | 'none';

interface ReconcilePremiumStatusResponse {
  isPremium: boolean;
  reconciledAt: string | null;
  source: ReconcilePremiumStatusSource;
}

const resolveReconcilePremiumSource = ({
  existingIsPremium,
  revenueCatIsPremium,
}: {
  existingIsPremium: boolean;
  revenueCatIsPremium: boolean;
}): ReconcilePremiumStatusSource => {
  if (existingIsPremium && revenueCatIsPremium) {
    return 'both';
  }

  if (existingIsPremium) {
    return 'firestore';
  }

  if (revenueCatIsPremium) {
    return 'revenuecat';
  }

  return 'none';
};

const buildReconcileMetadata = (userId: string, originalAppUserId: string | null) => ({
  reconciledAt: admin.firestore.FieldValue.serverTimestamp(),
  reconciliationSource: 'reconcilePremiumStatus',
  rcCanonicalAppUserId: userId,
  rcOriginalAppUserId: originalAppUserId,
});

const buildReconciledPremiumPayload = ({
  existingPremium,
  nowMs,
  revenueCatState,
  userId,
}: {
  existingPremium: ExistingPremiumData;
  nowMs: number;
  revenueCatState: RevenueCatResolvedPremiumState;
  userId: string;
}): Record<string, unknown> => {
  const purchaseDate =
    toTimestamp(revenueCatState.purchaseAtMs) ??
    existingPremium.purchaseDate ??
    admin.firestore.Timestamp.fromMillis(nowMs);
  const existingTrialConsumedAt = resolveTrialConsumedAt(existingPremium);
  const hasUsedTrial = resolveHasUsedTrial(existingPremium) || revenueCatState.hasUsedTrial;
  const trialStartAt = toTimestamp(revenueCatState.trialStartAtMs ?? revenueCatState.purchaseAtMs);
  const trialEndAt = toTimestamp(revenueCatState.trialEndAtMs ?? revenueCatState.expiresAtMs);
  const trialConsumedAt = hasUsedTrial
    ? (existingTrialConsumedAt ?? trialStartAt ?? toTimestamp(revenueCatState.purchaseAtMs))
    : null;
  const metadata = buildReconcileMetadata(userId, revenueCatState.originalAppUserId);

  if (revenueCatState.entitlementType === 'lifetime') {
    return {
      isPremium: true,
      entitlementType: 'lifetime',
      purchaseToken: existingPremium.purchaseToken ?? null,
      productId:
        revenueCatState.productId ??
        existingPremium.productId ??
        DEFAULT_LEGACY_LIFETIME_PRODUCT_ID,
      orderId: existingPremium.orderId ?? null,
      purchaseDate,
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
      ...metadata,
    };
  }

  if (revenueCatState.entitlementType === 'subscription') {
    const expiresAt = toTimestamp(revenueCatState.expiresAtMs);

    return {
      isPremium: true,
      entitlementType: 'subscription',
      purchaseToken: existingPremium.purchaseToken ?? null,
      productId: revenueCatState.productId ?? existingPremium.productId ?? null,
      orderId: existingPremium.orderId ?? null,
      purchaseDate,
      subscriptionState: revenueCatState.subscriptionState ?? 'ACTIVE',
      expiresAt,
      basePlanId: existingPremium.basePlanId ?? null,
      subscriptionType:
        revenueCatState.subscriptionType ??
        resolveSubscriptionType(revenueCatState.productId) ??
        existingPremium.subscriptionType ??
        null,
      isInTrial: revenueCatState.isInTrial,
      trialStartAt: revenueCatState.isInTrial ? trialStartAt : null,
      trialEndAt: revenueCatState.isInTrial ? trialEndAt : null,
      hasUsedTrial,
      trialConsumedAt,
      expiredAt: null,
      expireAt: null,
      lastValidatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...metadata,
    };
  }

  const expiresAt = toTimestamp(revenueCatState.expiresAtMs);
  const nonePayload = buildNoneEntitlementPayload(existingPremium, {
    subscriptionState: revenueCatState.subscriptionState ?? 'EXPIRED',
    expiresAt,
    expiredAt: resolveExpiredAt(expiresAt),
    expireAt: resolveExpiredAt(expiresAt),
    subscriptionType: revenueCatState.subscriptionType ?? existingPremium.subscriptionType ?? null,
  });

  return {
    ...nonePayload,
    hasUsedTrial,
    trialConsumedAt,
    ...metadata,
  };
};

export const reconcilePremiumStatus = onCall(
  { secrets: [REVENUECAT_API_KEY] },
  async (request): Promise<ReconcilePremiumStatusResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const nowMs = Date.now();
    const reconciledAt = new Date(nowMs).toISOString();
    const userRef = admin.firestore().collection('users').doc(userId);
    const userDoc = await userRef.get();
    const existingPremium = (userDoc.data()?.premium ?? {}) as ExistingPremiumData;
    const existingIsPremium = existingPremium.isPremium === true;
    if (isLegacyLifetimeProductId(existingPremium.productId)) {
      await persistPremiumStatus(
        userId,
        {
          isPremium: true,
          entitlementType: 'lifetime',
          productId: existingPremium.productId ?? DEFAULT_LEGACY_LIFETIME_PRODUCT_ID,
          purchaseToken: existingPremium.purchaseToken ?? null,
          orderId: existingPremium.orderId ?? null,
          purchaseDate:
            existingPremium.purchaseDate ?? admin.firestore.FieldValue.serverTimestamp(),
          subscriptionState: null,
          expiresAt: null,
          basePlanId: null,
          subscriptionType: null,
          isInTrial: false,
          trialStartAt: null,
          trialEndAt: null,
          hasUsedTrial: resolveHasUsedTrial(existingPremium),
          trialConsumedAt: resolveTrialConsumedAt(existingPremium),
          expiredAt: null,
          expireAt: null,
          lastValidatedAt: admin.firestore.FieldValue.serverTimestamp(),
          ...buildReconcileMetadata(userId, userId),
        },
        {
          source: 'app_open',
          reason: 'reconcilePremiumStatus:legacy-lifetime',
          previousIsPremium: existingPremium.isPremium ?? null,
        }
      );

      return {
        isPremium: true,
        source: resolveReconcilePremiumSource({
          existingIsPremium,
          revenueCatIsPremium: true,
        }),
        reconciledAt,
      };
    }

    const apiKey = REVENUECAT_API_KEY.value();
    if (!apiKey) {
      throw new HttpsError(
        'failed-precondition',
        'RevenueCat API key is not configured for premium reconciliation.'
      );
    }

    let subscriberLookup;
    try {
      subscriberLookup = await fetchRevenueCatSubscriber(apiKey, userId);
    } catch (error) {
      console.error('RevenueCat subscriber lookup failed:', sanitizeError(error));
      if (isTransientRevenueCatError(error)) {
        throw new HttpsError(
          'unavailable',
          'RevenueCat lookup is temporarily unavailable. Please retry.'
        );
      }

      throw new HttpsError('internal', 'Failed to query RevenueCat subscriber.');
    }

    if (subscriberLookup.statusCode === 404) {
      // Preserve current Firestore state when RevenueCat cannot resolve user id.
      // This avoids accidental premium downgrades for aliasing/configuration gaps.
      return {
        isPremium: existingIsPremium,
        source: resolveReconcilePremiumSource({
          existingIsPremium,
          revenueCatIsPremium: false,
        }),
        reconciledAt,
      };
    }

    if (subscriberLookup.statusCode >= 400) {
      console.error('RevenueCat subscriber lookup returned non-success status:', {
        statusCode: subscriberLookup.statusCode,
        userId,
      });

      if (subscriberLookup.statusCode === 401 || subscriberLookup.statusCode === 403) {
        throw new HttpsError(
          'failed-precondition',
          'RevenueCat credentials are invalid for reconciliation.'
        );
      }

      if (isTransientRevenueCatError(null, subscriberLookup.statusCode)) {
        throw new HttpsError(
          'unavailable',
          'RevenueCat lookup is temporarily unavailable. Please retry.'
        );
      }

      throw new HttpsError(
        'failed-precondition',
        `RevenueCat subscriber lookup failed with status ${subscriberLookup.statusCode}.`
      );
    }

    if (!subscriberLookup.subscriber) {
      throw new HttpsError('internal', 'RevenueCat response did not include subscriber data.');
    }

    const revenueCatState = resolveRevenueCatPremiumState(subscriberLookup.subscriber, nowMs);
    const payload = buildReconciledPremiumPayload({
      existingPremium,
      nowMs,
      revenueCatState,
      userId,
    });

    await persistPremiumStatus(userId, payload, {
      source: 'app_open',
      reason: `reconcilePremiumStatus:${revenueCatState.entitlementType}`,
      previousIsPremium: existingPremium.isPremium ?? null,
    });

    return {
      isPremium: revenueCatState.isPremium,
      source: resolveReconcilePremiumSource({
        existingIsPremium,
        revenueCatIsPremium: revenueCatState.isPremium,
      }),
      reconciledAt,
    };
  }
);

export const deleteAccount = onCall({}, deleteAccountHandler);

export { importImdbChunk } from './imdbImport';
export { revenuecatWebhook } from './revenuecatWebhook';
export { runTraktEnrichment, runTraktSync, traktApi, traktCallback } from './trakt';
