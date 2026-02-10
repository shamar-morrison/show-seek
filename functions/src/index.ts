import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { androidpublisher_v3, google } from 'googleapis';

admin.initializeApp();

const PACKAGE_NAME = 'app.horizon.showseek';
const LEGACY_LIFETIME_PRODUCT_ID = 'premium_unlock';

const ENTITLED_SUBSCRIPTION_STATES = new Set<string>([
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
  'SUBSCRIPTION_STATE_CANCELED',
]);

type PurchaseType = 'in-app' | 'subs';
type EntitlementType = 'lifetime' | 'subscription' | 'none';

interface ExistingPremiumData {
  basePlanId?: string | null;
  entitlementType?: EntitlementType;
  isPremium?: boolean;
  orderId?: string | null;
  productId?: string | null;
  purchaseDate?: admin.firestore.Timestamp;
  purchaseToken?: string | null;
  subscriptionState?: string | null;
}

interface SubscriptionValidationResult {
  basePlanId: string | null;
  expiresAt: admin.firestore.Timestamp | null;
  isPremium: boolean;
  orderId: string | null;
  subscriptionState: string | null;
}

const getAndroidPublisherClient = (): androidpublisher_v3.Androidpublisher => {
  const auth = new google.auth.GoogleAuth({
    keyFile: './service-account-key.json',
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });

  return google.androidpublisher({
    version: 'v3',
    auth,
  });
};

const parseExpiryMillis = (expiryTime?: string | null): number | null => {
  if (!expiryTime) {
    return null;
  }

  const parsed = Date.parse(expiryTime);
  return Number.isNaN(parsed) ? null : parsed;
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
    const expiryMillis = parseExpiryMillis(lineItem.expiryTime);
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

const buildNoneEntitlementPayload = (
  existingPremium: ExistingPremiumData,
  overrides?: Partial<Record<'subscriptionState' | 'expiresAt' | 'basePlanId', unknown>>
): Record<string, unknown> => ({
  isPremium: false,
  entitlementType: 'none',
  purchaseToken: existingPremium.purchaseToken ?? null,
  productId: existingPremium.productId ?? null,
  orderId: existingPremium.orderId ?? null,
  purchaseDate: existingPremium.purchaseDate ?? admin.firestore.FieldValue.serverTimestamp(),
  subscriptionState: (overrides?.subscriptionState as string | null | undefined) ?? null,
  expiresAt: (overrides?.expiresAt as admin.firestore.Timestamp | null | undefined) ?? null,
  basePlanId: (overrides?.basePlanId as string | null | undefined) ?? null,
  lastValidatedAt: admin.firestore.FieldValue.serverTimestamp(),
});

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
  const expiryMillis = parseExpiryMillis(latestLineItem?.expiryTime);
  const subscriptionState = purchaseData.subscriptionState ?? null;

  const hasEntitledState = subscriptionState
    ? ENTITLED_SUBSCRIPTION_STATES.has(subscriptionState)
    : false;
  const isNotExpired = expiryMillis !== null && expiryMillis > Date.now();

  return {
    isPremium: hasEntitledState && isNotExpired,
    subscriptionState,
    expiresAt: expiryMillis ? admin.firestore.Timestamp.fromMillis(expiryMillis) : null,
    basePlanId: latestLineItem?.offerDetails?.basePlanId ?? null,
    orderId: purchaseData.latestOrderId ?? null,
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
    throw new HttpsError('internal', 'Failed to validate purchase', {
      originalMessage: String(error),
    });
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
          lastValidatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return {
          success: true,
          isPremium: subscriptionValidation.isPremium,
          entitlementType,
        };
      } catch (subscriptionError) {
        console.error('Subscription sync validation failed:', subscriptionError);

        await persistPremiumStatus(
          userId,
          buildNoneEntitlementPayload(existingPremium, {
            subscriptionState: null,
            expiresAt: null,
            basePlanId: null,
          })
        );

        return { success: true, isPremium: false, entitlementType: 'none' as EntitlementType };
      }
    }

    await persistPremiumStatus(userId, buildNoneEntitlementPayload(existingPremium));

    return { success: true, isPremium: false, entitlementType: 'none' as EntitlementType };
  } catch (error) {
    console.error('Premium sync error:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', 'Failed to sync premium status', {
      originalMessage: String(error),
    });
  }
});
