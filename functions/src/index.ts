import * as admin from 'firebase-admin';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { androidpublisher_v3 } from 'googleapis';
import { getAndroidPublisherClientFromServiceAccountSecret } from './shared/playAuth';
import { MONTHLY_TRIAL_OFFER_ID } from './shared/premiumOfferConstants';
import {
  isDefinitiveSubscriptionError,
  isIdempotentAcknowledgeError,
  isTransientSubscriptionError,
  mapPurchaseValidationError,
  resolveLifetimePurchaseStateFailure,
  resolveSubscriptionAcknowledgeId,
  shouldAcknowledgeSubscription,
} from './shared/purchaseValidation';
import { shouldBlockNoTokenPremiumDowngrade } from './shared/premiumSyncGuard';

admin.initializeApp();

const PACKAGE_NAME = 'app.horizon.showseek';
const LEGACY_LIFETIME_PRODUCT_ID = 'premium_unlock';
const MONTHLY_SUBSCRIPTION_PRODUCT_ID = 'monthly_showseek_sub';
const YEARLY_SUBSCRIPTION_PRODUCT_ID = 'showseek_yearly_sub';
const TRIAL_ALREADY_USED_REASON = 'TRIAL_ALREADY_USED';
const PLAY_VALIDATOR_SERVICE_ACCOUNT_JSON = defineSecret('PLAY_VALIDATOR_SERVICE_ACCOUNT_JSON');

const ENTITLED_SUBSCRIPTION_STATES = new Set<string>([
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
  'SUBSCRIPTION_STATE_CANCELED',
]);

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

type PurchaseType = 'in-app' | 'subs';
type EntitlementType = 'lifetime' | 'subscription' | 'none';
type SubscriptionType = 'monthly' | 'yearly';
type PremiumWriteSource =
  | 'purchase_success'
  | 'restore'
  | 'retry_success'
  | 'manual'
  | 'app_open'
  | 'unknown';

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

interface SubscriptionValidationResult {
  basePlanId: string | null;
  expireAt: admin.firestore.Timestamp | null;
  expiredAt: admin.firestore.Timestamp | null;
  expiresAt: admin.firestore.Timestamp | null;
  isPremium: boolean;
  isInTrial: boolean;
  orderId: string | null;
  subscriptionType: SubscriptionType | null;
  subscriptionState: string | null;
  trialEndAt: admin.firestore.Timestamp | null;
  trialStartAt: admin.firestore.Timestamp | null;
}

const normalizePremiumWriteSource = (value: unknown): PremiumWriteSource => {
  if (typeof value !== 'string') {
    return 'unknown';
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'purchase_success' ||
    normalized === 'restore' ||
    normalized === 'retry_success' ||
    normalized === 'manual' ||
    normalized === 'app_open' ||
    normalized === 'unknown'
  ) {
    return normalized as PremiumWriteSource;
  }

  return 'unknown';
};

const parseDateTimeMillis = (dateTime?: string | null): number | null => {
  if (!dateTime) {
    return null;
  }

  const parsed = Date.parse(dateTime);
  return Number.isNaN(parsed) ? null : parsed;
};

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

const normalizeOfferIdentifier = (value?: string[] | string | null): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) =>
      String(item ?? '')
        .trim()
        .toLowerCase()
    );
  }

  return [
    String(value ?? '')
      .trim()
      .toLowerCase(),
  ];
};

const isMonthlyTrialOffer = (
  offerDetails?: androidpublisher_v3.Schema$OfferDetails | null
): boolean => {
  if (!offerDetails) {
    return false;
  }

  const normalizedTrialId = MONTHLY_TRIAL_OFFER_ID.toLowerCase();
  const offerIds = normalizeOfferIdentifier(offerDetails.offerId);
  if (offerIds.includes(normalizedTrialId)) {
    return true;
  }

  const offerTags = normalizeOfferIdentifier(offerDetails.offerTags);
  return offerTags.includes(normalizedTrialId);
};

const resolveExpiredAt = (
  expiresAt: admin.firestore.Timestamp | null
): admin.firestore.Timestamp | null => {
  if (!expiresAt) {
    return null;
  }

  return expiresAt.toMillis() <= Date.now() ? expiresAt : null;
};

const getLatestLineItem = (
  lineItems?: androidpublisher_v3.Schema$SubscriptionPurchaseLineItem[] | null
): androidpublisher_v3.Schema$SubscriptionPurchaseLineItem | null => {
  if (!lineItems || lineItems.length === 0) {
    return null;
  }

  let latestLineItem: androidpublisher_v3.Schema$SubscriptionPurchaseLineItem | null = null;
  let latestExpiry = 0;

  for (const lineItem of lineItems) {
    const expiryMillis = parseDateTimeMillis(lineItem.expiryTime);
    if (expiryMillis === null) {
      continue;
    }

    if (expiryMillis > latestExpiry) {
      latestExpiry = expiryMillis;
      latestLineItem = lineItem;
    }
  }

  return latestLineItem;
};

const resolvePurchaseType = (purchaseType: unknown, productId: string): PurchaseType => {
  if (purchaseType === 'in-app' || purchaseType === 'subs') {
    return purchaseType;
  }

  return productId === LEGACY_LIFETIME_PRODUCT_ID ? 'in-app' : 'subs';
};

const resolveExistingEntitlementType = (existingPremium: ExistingPremiumData): EntitlementType => {
  if (existingPremium.entitlementType === 'lifetime') {
    return 'lifetime';
  }

  if (existingPremium.entitlementType === 'subscription') {
    return 'subscription';
  }

  return existingPremium.isPremium === true ? 'subscription' : 'none';
};

const resolveTrialConsumedAt = (
  existingPremium: ExistingPremiumData
): admin.firestore.Timestamp | null =>
  existingPremium.trialConsumedAt ?? existingPremium.trialStartAt ?? null;

const resolveHasUsedTrial = (existingPremium: ExistingPremiumData): boolean =>
  existingPremium.hasUsedTrial === true || resolveTrialConsumedAt(existingPremium) !== null;

const isSameTrialRestoreAttempt = (
  existingPremium: ExistingPremiumData,
  purchaseToken: string,
  orderId: string | null
): boolean => {
  const sameToken =
    typeof existingPremium.purchaseToken === 'string' &&
    existingPremium.purchaseToken.length > 0 &&
    existingPremium.purchaseToken === purchaseToken;
  const sameOrderId =
    typeof existingPremium.orderId === 'string' &&
    existingPremium.orderId.length > 0 &&
    typeof orderId === 'string' &&
    orderId.length > 0 &&
    existingPremium.orderId === orderId;

  return sameToken || sameOrderId;
};

const persistPremiumStatus = async (
  userId: string,
  premiumPayload: Record<string, unknown>,
  options?: {
    source?: PremiumWriteSource;
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

const validateLifetimeWithGoogle = async (
  androidPublisher: androidpublisher_v3.Androidpublisher,
  userId: string,
  productId: string,
  purchaseToken: string
): Promise<{ orderId: string | null }> => {
  const response = await androidPublisher.purchases.products.get({
    packageName: PACKAGE_NAME,
    productId,
    token: purchaseToken,
  });

  const lifetimePurchaseStateFailure = resolveLifetimePurchaseStateFailure(response.data.purchaseState);
  if (lifetimePurchaseStateFailure) {
    throw new HttpsError(
      'failed-precondition',
      lifetimePurchaseStateFailure.message,
      {
        purchaseState: response.data.purchaseState ?? null,
        reason: lifetimePurchaseStateFailure.reason,
        retryable: false,
      }
    );
  }

  if (response.data.acknowledgementState === 0) {
    await androidPublisher.purchases.products.acknowledge({
      packageName: PACKAGE_NAME,
      productId,
      token: purchaseToken,
      requestBody: {
        developerPayload: userId,
      },
    });
  }

  return {
    orderId: response.data.orderId ?? null,
  };
};

const validateSubscriptionWithGoogle = async (
  androidPublisher: androidpublisher_v3.Androidpublisher,
  userId: string,
  productId: string,
  purchaseToken: string
): Promise<SubscriptionValidationResult> => {
  const response = await androidPublisher.purchases.subscriptionsv2.get({
    packageName: PACKAGE_NAME,
    token: purchaseToken,
  });

  const purchaseData = response.data;
  const latestLineItem = getLatestLineItem(purchaseData.lineItems);
  const acknowledgeSubscriptionId = resolveSubscriptionAcknowledgeId(
    latestLineItem?.productId,
    productId
  );

  if (shouldAcknowledgeSubscription(purchaseData.acknowledgementState)) {
    if (!acknowledgeSubscriptionId) {
      throw new HttpsError(
        'failed-precondition',
        'Unable to resolve subscription id for acknowledgment.',
        {
          reason: 'ACKNOWLEDGE_SUBSCRIPTION_ID_MISSING',
          retryable: false,
        }
      );
    }

    try {
      await androidPublisher.purchases.subscriptions.acknowledge({
        packageName: PACKAGE_NAME,
        subscriptionId: acknowledgeSubscriptionId,
        token: purchaseToken,
        requestBody: {
          developerPayload: userId,
        },
      });
    } catch (acknowledgeError) {
      if (!isIdempotentAcknowledgeError(acknowledgeError)) {
        throw acknowledgeError;
      }
    }
  }

  const expiryMillis = parseDateTimeMillis(latestLineItem?.expiryTime);
  const startMillis = parseDateTimeMillis(purchaseData.startTime);
  const subscriptionState = purchaseData.subscriptionState ?? null;
  const subscriptionType = resolveSubscriptionType(productId);
  const isMonthlyTrialMatched =
    subscriptionType === 'monthly' && isMonthlyTrialOffer(latestLineItem?.offerDetails);

  const hasEntitledState = subscriptionState
    ? ENTITLED_SUBSCRIPTION_STATES.has(subscriptionState)
    : false;
  const isNotExpired = expiryMillis !== null && expiryMillis > Date.now();
  const isPremium = hasEntitledState && isNotExpired;
  const expiresAt = toTimestamp(expiryMillis);
  const isInTrial = isPremium && isMonthlyTrialMatched;
  const trialStartAt = isInTrial ? toTimestamp(startMillis) : null;
  const trialEndAt = isInTrial ? expiresAt : null;
  const expiredAt = resolveExpiredAt(expiresAt);

  return {
    isPremium,
    subscriptionState,
    expiresAt,
    basePlanId: latestLineItem?.offerDetails?.basePlanId ?? null,
    orderId: purchaseData.latestOrderId ?? null,
    subscriptionType,
    isInTrial,
    trialStartAt,
    trialEndAt,
    expiredAt,
    expireAt: expiredAt,
  };
};

// DEPRECATED: Kept temporarily for safety, remove after confirming no usage
export const validatePurchase = onCall(
  { secrets: [PLAY_VALIDATOR_SERVICE_ACCOUNT_JSON] },
  async (request) => {
    // Verify user is authenticated
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const {
      purchaseToken,
      productId,
      purchaseType,
      source: sourceRaw,
    } = request.data as {
      productId?: string;
      purchaseToken?: string;
      purchaseType?: PurchaseType;
      source?: string;
    };
    const source = normalizePremiumWriteSource(sourceRaw);
    const userId = request.auth.uid;

    if (!purchaseToken || !productId) {
      throw new HttpsError('invalid-argument', 'Missing purchaseToken or productId');
    }

    const resolvedPurchaseType = resolvePurchaseType(purchaseType, productId);
    const maskedPurchaseTokenPrefix = purchaseToken.slice(0, 8);

    try {
      const androidPublisher = getAndroidPublisherClientFromServiceAccountSecret(
        PLAY_VALIDATOR_SERVICE_ACCOUNT_JSON.value()
      );
      const userRef = admin.firestore().collection('users').doc(userId);
      const userDoc = await userRef.get();
      const existingPremium = (userDoc.data()?.premium ?? {}) as ExistingPremiumData;

      console.log(
        'Validating purchase for user:',
        userId,
        'product:',
        productId,
        'type:',
        resolvedPurchaseType,
        'package:',
        PACKAGE_NAME
      );

      if (resolvedPurchaseType === 'in-app') {
        if (productId !== LEGACY_LIFETIME_PRODUCT_ID) {
          throw new HttpsError(
            'invalid-argument',
            'Only legacy lifetime product is allowed for in-app validation'
          );
        }

        const lifetimeValidation = await validateLifetimeWithGoogle(
          androidPublisher,
          userId,
          productId,
          purchaseToken
        );

        await persistPremiumStatus(
          userId,
          {
            isPremium: true,
            entitlementType: 'lifetime',
            purchaseDate: admin.firestore.FieldValue.serverTimestamp(),
            purchaseToken,
            productId,
            orderId: lifetimeValidation.orderId,
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
          },
          {
            source,
            reason: 'validatePurchase:lifetime',
            previousIsPremium: existingPremium.isPremium ?? null,
          }
        );

        return { success: true, isPremium: true, entitlementType: 'lifetime' as EntitlementType };
      }

      const subscriptionValidation = await validateSubscriptionWithGoogle(
        androidPublisher,
        userId,
        productId,
        purchaseToken
      );
      const existingHasUsedTrial = resolveHasUsedTrial(existingPremium);
      const existingTrialConsumedAt = resolveTrialConsumedAt(existingPremium);
      const isTrialRestoreAttempt = isSameTrialRestoreAttempt(
        existingPremium,
        purchaseToken,
        subscriptionValidation.orderId
      );

      if (subscriptionValidation.isInTrial && existingHasUsedTrial && !isTrialRestoreAttempt) {
        throw new HttpsError(
          'failed-precondition',
          'Free trial has already been used for this account.',
          {
            code: TRIAL_ALREADY_USED_REASON,
            reason: TRIAL_ALREADY_USED_REASON,
            retryable: false,
          }
        );
      }

      const hasUsedTrial = subscriptionValidation.isInTrial ? true : existingHasUsedTrial;
      const trialConsumedAt = subscriptionValidation.isInTrial
        ? (existingTrialConsumedAt ??
          subscriptionValidation.trialStartAt ??
          admin.firestore.FieldValue.serverTimestamp())
        : existingTrialConsumedAt;

      await persistPremiumStatus(
        userId,
        {
          isPremium: subscriptionValidation.isPremium,
          entitlementType: subscriptionValidation.isPremium ? 'subscription' : 'none',
          purchaseDate: admin.firestore.FieldValue.serverTimestamp(),
          purchaseToken,
          productId,
          orderId: subscriptionValidation.orderId,
          subscriptionState: subscriptionValidation.subscriptionState,
          expiresAt: subscriptionValidation.expiresAt,
          basePlanId: subscriptionValidation.basePlanId,
          subscriptionType: subscriptionValidation.subscriptionType,
          isInTrial: subscriptionValidation.isInTrial,
          trialStartAt: subscriptionValidation.trialStartAt,
          trialEndAt: subscriptionValidation.trialEndAt,
          hasUsedTrial,
          trialConsumedAt,
          expiredAt: subscriptionValidation.expiredAt,
          expireAt: subscriptionValidation.expireAt,
          lastValidatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {
          source,
          reason: 'validatePurchase:subscription',
          previousIsPremium: existingPremium.isPremium ?? null,
        }
      );

      return {
        success: true,
        isPremium: subscriptionValidation.isPremium,
        entitlementType: (subscriptionValidation.isPremium
          ? 'subscription'
          : 'none') as EntitlementType,
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      const mappedError = mapPurchaseValidationError(error);
      console.error('Purchase validation error:', {
        productId,
        purchaseType: resolvedPurchaseType,
        reason: mappedError.reason,
        retryable: mappedError.retryable,
        statusCode: mappedError.statusCode,
        tokenPrefix: maskedPurchaseTokenPrefix,
        userId,
      });
      console.error('Purchase validation raw error:', sanitizeError(error));

      throw new HttpsError(mappedError.code, 'Failed to validate purchase', {
        reason: mappedError.reason,
        retryable: mappedError.retryable,
        statusCode: mappedError.statusCode,
      });
    }
  }
);

export const syncPremiumStatus = onCall(
  { secrets: [PLAY_VALIDATOR_SERVICE_ACCOUNT_JSON] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const { source: sourceRaw, allowDowngrade } = (request.data ?? {}) as {
      source?: string;
      allowDowngrade?: boolean;
    };
    const source = normalizePremiumWriteSource(sourceRaw);
    const canDowngrade = allowDowngrade === true;

    try {
      const userRef = admin.firestore().collection('users').doc(userId);
      const userDoc = await userRef.get();
      const existingPremium = (userDoc.data()?.premium ?? {}) as ExistingPremiumData;

      if (existingPremium.productId === LEGACY_LIFETIME_PRODUCT_ID) {
        await persistPremiumStatus(
          userId,
          {
            isPremium: true,
            entitlementType: 'lifetime',
            productId: LEGACY_LIFETIME_PRODUCT_ID,
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
          },
          {
            source,
            reason: 'syncPremiumStatus:legacy-lifetime',
            previousIsPremium: existingPremium.isPremium ?? null,
          }
        );

        return { success: true, isPremium: true, entitlementType: 'lifetime' as EntitlementType };
      }

      if (existingPremium.purchaseToken && existingPremium.productId) {
        const androidPublisher = getAndroidPublisherClientFromServiceAccountSecret(
          PLAY_VALIDATOR_SERVICE_ACCOUNT_JSON.value()
        );

        try {
          const subscriptionValidation = await validateSubscriptionWithGoogle(
            androidPublisher,
            userId,
            existingPremium.productId,
            existingPremium.purchaseToken
          );

          const entitlementType: EntitlementType = subscriptionValidation.isPremium
            ? 'subscription'
            : 'none';

          await persistPremiumStatus(
            userId,
            {
              isPremium: subscriptionValidation.isPremium,
              entitlementType,
              purchaseToken: existingPremium.purchaseToken,
              productId: existingPremium.productId,
              orderId: subscriptionValidation.orderId ?? existingPremium.orderId ?? null,
              purchaseDate:
                existingPremium.purchaseDate ?? admin.firestore.FieldValue.serverTimestamp(),
              subscriptionState: subscriptionValidation.subscriptionState,
              expiresAt: subscriptionValidation.expiresAt,
              basePlanId: subscriptionValidation.basePlanId,
              subscriptionType: subscriptionValidation.subscriptionType,
              isInTrial: subscriptionValidation.isInTrial,
              trialStartAt: subscriptionValidation.trialStartAt,
              trialEndAt: subscriptionValidation.trialEndAt,
              hasUsedTrial:
                subscriptionValidation.isInTrial || resolveHasUsedTrial(existingPremium),
              trialConsumedAt: subscriptionValidation.isInTrial
                ? (resolveTrialConsumedAt(existingPremium) ??
                  subscriptionValidation.trialStartAt ??
                  admin.firestore.FieldValue.serverTimestamp())
                : resolveTrialConsumedAt(existingPremium),
              expiredAt: subscriptionValidation.expiredAt,
              expireAt: subscriptionValidation.expireAt,
              lastValidatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            {
              source,
              reason: 'syncPremiumStatus:subscription-validation',
              previousIsPremium: existingPremium.isPremium ?? null,
            }
          );

          return {
            success: true,
            isPremium: subscriptionValidation.isPremium,
            entitlementType,
          };
        } catch (subscriptionError) {
          if (isDefinitiveSubscriptionError(subscriptionError)) {
            console.warn(
              'Definitive subscription sync failure, revoking entitlement:',
              sanitizeError(subscriptionError)
            );

            await persistPremiumStatus(
              userId,
              buildNoneEntitlementPayload(existingPremium, {
                subscriptionState: null,
                expiresAt: existingPremium.expiresAt ?? null,
                basePlanId: null,
              }),
              {
                source,
                reason: 'syncPremiumStatus:definitive-revocation',
                previousIsPremium: existingPremium.isPremium ?? null,
              }
            );

            return { success: true, isPremium: false, entitlementType: 'none' as EntitlementType };
          }

          if (isTransientSubscriptionError(subscriptionError)) {
            console.error(
              'Transient subscription sync failure, preserving existing entitlement:',
              sanitizeError(subscriptionError)
            );

            return {
              success: false,
              isPremium: existingPremium.isPremium === true,
              entitlementType: resolveExistingEntitlementType(existingPremium),
            };
          }

          throw subscriptionError;
        }
      }

      if (
        shouldBlockNoTokenPremiumDowngrade({
          existingIsPremium: existingPremium.isPremium,
          allowDowngrade: canDowngrade,
        })
      ) {
        console.warn('[PREMIUM WRITE BLOCKED][SERVER_GUARD]', {
          userId,
          source,
          reason: 'syncPremiumStatus:no-token-no-product',
          previousIsPremium: existingPremium.isPremium ?? null,
          requestedDowngrade: true,
          allowDowngrade: canDowngrade,
          timestamp: Date.now(),
        });

        return {
          success: true,
          isPremium: existingPremium.isPremium === true,
          entitlementType: resolveExistingEntitlementType(existingPremium),
        };
      }

      await persistPremiumStatus(userId, buildNoneEntitlementPayload(existingPremium), {
        source,
        reason: 'syncPremiumStatus:no-token-no-product',
        previousIsPremium: existingPremium.isPremium ?? null,
      });

      return { success: true, isPremium: false, entitlementType: 'none' as EntitlementType };
    } catch (error) {
      console.error('Premium sync error:', sanitizeError(error));
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'Failed to sync premium status');
    }
  }
);

export { revenuecatWebhook } from './revenuecatWebhook';
