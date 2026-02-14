import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { androidpublisher_v3, google } from 'googleapis';
import { MONTHLY_TRIAL_OFFER_ID } from './shared/premiumOfferConstants';

admin.initializeApp();

const PACKAGE_NAME = 'app.horizon.showseek';
const LEGACY_LIFETIME_PRODUCT_ID = 'premium_unlock';
const MONTHLY_SUBSCRIPTION_PRODUCT_ID = 'monthly_showseek_sub';
const YEARLY_SUBSCRIPTION_PRODUCT_ID = 'showseek_yearly_sub';
const TRIAL_ALREADY_USED_REASON = 'TRIAL_ALREADY_USED';

const ENTITLED_SUBSCRIPTION_STATES = new Set<string>([
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
  'SUBSCRIPTION_STATE_CANCELED',
]);

type PurchaseType = 'in-app' | 'subs';
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

const getAndroidPublisherClient = (): androidpublisher_v3.Androidpublisher => {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });

  return google.androidpublisher({
    version: 'v3',
    auth,
  });
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
    return value.map((item) => String(item ?? '').trim().toLowerCase());
  }

  return [String(value ?? '').trim().toLowerCase()];
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

const getErrorStatusCode = (error: unknown): number | null => {
  const errorRecord = error as {
    code?: number | string;
    response?: { status?: number };
    status?: number;
  };

  if (typeof errorRecord?.response?.status === 'number') {
    return errorRecord.response.status;
  }

  if (typeof errorRecord?.status === 'number') {
    return errorRecord.status;
  }

  if (typeof errorRecord?.code === 'number') {
    return errorRecord.code;
  }

  if (typeof errorRecord?.code === 'string') {
    const parsedCode = Number(errorRecord.code);
    if (!Number.isNaN(parsedCode)) {
      return parsedCode;
    }
  }

  return null;
};

const isDefinitiveSubscriptionError = (error: unknown): boolean => {
  const statusCode = getErrorStatusCode(error);
  if (statusCode === 404 || statusCode === 410) {
    return true;
  }

  const errorRecord = error as { name?: string; message?: string };
  const errorName = String(errorRecord?.name || '');
  const errorMessage = String(errorRecord?.message || '').toLowerCase();

  if (errorName === 'NotFoundError' || errorName === 'SubscriptionExpiredError') {
    return true;
  }

  return errorMessage.includes('subscriptionexpired') || errorMessage.includes('subscription expired');
};

const isTransientSubscriptionError = (error: unknown): boolean => {
  const errorRecord = error as {
    code?: string | number;
    isTransient?: boolean;
    message?: string;
    transient?: boolean;
  };

  if (errorRecord?.isTransient === true || errorRecord?.transient === true) {
    return true;
  }

  const statusCode = getErrorStatusCode(error);
  if (statusCode === 429 || (statusCode !== null && statusCode >= 500)) {
    return true;
  }

  const errorCode = String(errorRecord?.code || '').toUpperCase();
  const transientCodes = new Set([
    'ECONNABORTED',
    'ECONNRESET',
    'ENETUNREACH',
    'ENOTFOUND',
    'ETIMEDOUT',
    'EAI_AGAIN',
    'DEADLINE_EXCEEDED',
  ]);
  if (transientCodes.has(errorCode)) {
    return true;
  }

  const errorMessage = String(errorRecord?.message || '').toLowerCase();
  return (
    errorMessage.includes('network') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('rate limit') ||
    errorMessage.includes('temporarily unavailable')
  );
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
  premiumPayload: Record<string, unknown>
): Promise<void> => {
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
    overrides?.expiresAt !== undefined
      ? overrides.expiresAt
      : existingPremium.expiresAt ?? null;
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

  // purchaseState: 0=Purchased, 1=Canceled, 2=Pending
  if (response.data.purchaseState !== 0) {
    throw new HttpsError(
      'invalid-argument',
      'Invalid lifetime purchase state: ' + response.data.purchaseState
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

  if (purchaseData.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING') {
    await androidPublisher.purchases.subscriptions.acknowledge({
      packageName: PACKAGE_NAME,
      subscriptionId: productId,
      token: purchaseToken,
      requestBody: {
        developerPayload: userId,
      },
    });
  }

  const latestLineItem = getLatestLineItem(purchaseData.lineItems);
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

export const validatePurchase = onCall(async (request) => {
  // Verify user is authenticated
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { purchaseToken, productId, purchaseType } = request.data as {
    productId?: string;
    purchaseToken?: string;
    purchaseType?: PurchaseType;
  };
  const userId = request.auth.uid;

  if (!purchaseToken || !productId) {
    throw new HttpsError('invalid-argument', 'Missing purchaseToken or productId');
  }

  try {
    const androidPublisher = getAndroidPublisherClient();
    const resolvedPurchaseType = resolvePurchaseType(purchaseType, productId);
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

      await persistPremiumStatus(userId, {
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
      });

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
        }
      );
    }

    const hasUsedTrial = subscriptionValidation.isInTrial ? true : existingHasUsedTrial;
    const trialConsumedAt = subscriptionValidation.isInTrial
      ? existingTrialConsumedAt ??
        subscriptionValidation.trialStartAt ??
        admin.firestore.FieldValue.serverTimestamp()
      : existingTrialConsumedAt;

    await persistPremiumStatus(userId, {
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
    });

    return {
      success: true,
      isPremium: subscriptionValidation.isPremium,
      entitlementType: (subscriptionValidation.isPremium
        ? 'subscription'
        : 'none') as EntitlementType,
    };
  } catch (error) {
    console.error('Purchase validation error:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', 'Failed to validate purchase');
  }
});

export const syncPremiumStatus = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = request.auth.uid;

  try {
    const userRef = admin.firestore().collection('users').doc(userId);
    const userDoc = await userRef.get();
    const existingPremium = (userDoc.data()?.premium ?? {}) as ExistingPremiumData;

    if (existingPremium.productId === LEGACY_LIFETIME_PRODUCT_ID) {
      await persistPremiumStatus(userId, {
        isPremium: true,
        entitlementType: 'lifetime',
        productId: LEGACY_LIFETIME_PRODUCT_ID,
        purchaseToken: existingPremium.purchaseToken ?? null,
        orderId: existingPremium.orderId ?? null,
        purchaseDate: existingPremium.purchaseDate ?? admin.firestore.FieldValue.serverTimestamp(),
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
      });

      return { success: true, isPremium: true, entitlementType: 'lifetime' as EntitlementType };
    }

    if (existingPremium.purchaseToken && existingPremium.productId) {
      const androidPublisher = getAndroidPublisherClient();

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

        await persistPremiumStatus(userId, {
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
            ? resolveTrialConsumedAt(existingPremium) ??
              subscriptionValidation.trialStartAt ??
              admin.firestore.FieldValue.serverTimestamp()
            : resolveTrialConsumedAt(existingPremium),
          expiredAt: subscriptionValidation.expiredAt,
          expireAt: subscriptionValidation.expireAt,
          lastValidatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return {
          success: true,
          isPremium: subscriptionValidation.isPremium,
          entitlementType,
        };
      } catch (subscriptionError) {
        if (isDefinitiveSubscriptionError(subscriptionError)) {
          console.warn('Definitive subscription sync failure, revoking entitlement:', subscriptionError);

          await persistPremiumStatus(
            userId,
            buildNoneEntitlementPayload(existingPremium, {
              subscriptionState: null,
              expiresAt: existingPremium.expiresAt ?? null,
              basePlanId: null,
            })
          );

          return { success: true, isPremium: false, entitlementType: 'none' as EntitlementType };
        }

        if (isTransientSubscriptionError(subscriptionError)) {
          console.error(
            'Transient subscription sync failure, preserving existing entitlement:',
            subscriptionError
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

    await persistPremiumStatus(userId, buildNoneEntitlementPayload(existingPremium));

    return { success: true, isPremium: false, entitlementType: 'none' as EntitlementType };
  } catch (error) {
    console.error('Premium sync error:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', 'Failed to sync premium status');
  }
});
