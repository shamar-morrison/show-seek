import * as https from 'node:https';
import {
  MONTHLY_SUBSCRIPTION_PRODUCT_ID,
  PREMIUM_ENTITLEMENT_ID,
  YEARLY_SUBSCRIPTION_PRODUCT_ID,
  isLegacyLifetimeProductId,
} from './premiumProducts';

export interface RevenueCatEntitlement {
  expires_date?: string | null;
  expires_date_ms?: number | string | null;
  period_type?: string | null;
  product_identifier?: string | null;
  purchase_date?: string | null;
  purchase_date_ms?: number | string | null;
}

export interface RevenueCatSubscription {
  expires_date?: string | null;
  expires_date_ms?: number | string | null;
  period_type?: string | null;
  purchase_date?: string | null;
  purchase_date_ms?: number | string | null;
}

export interface RevenueCatNonSubscription {
  purchase_date?: string | null;
  purchase_date_ms?: number | string | null;
  store_transaction_id?: string | null;
  transaction_id?: string | null;
}

export interface RevenueCatSubscriber {
  entitlements?: Record<string, RevenueCatEntitlement>;
  non_subscriptions?: Record<string, RevenueCatNonSubscription[]>;
  original_app_user_id?: string | null;
  subscriptions?: Record<string, RevenueCatSubscription>;
}

export interface RevenueCatSubscriberLookupResponse {
  statusCode: number;
  subscriber?: RevenueCatSubscriber;
}

export interface RevenueCatActiveSubscription {
  expiresAtMs: number | null;
  productId: string;
  subscription: RevenueCatSubscription;
}

export type ReconciledEntitlementType = 'lifetime' | 'subscription' | 'none';

export type RevenueCatResolutionSource = 'revenuecat' | 'none';

export interface RevenueCatResolvedPremiumState {
  entitlementType: ReconciledEntitlementType;
  expiresAtMs: number | null;
  hasUsedTrial: boolean;
  isInTrial: boolean;
  isPremium: boolean;
  originalAppUserId: string | null;
  productId: string | null;
  purchaseAtMs: number | null;
  source: RevenueCatResolutionSource;
  subscriptionState: 'ACTIVE' | 'EXPIRED' | null;
  subscriptionType: 'monthly' | 'yearly' | null;
  trialEndAtMs: number | null;
  trialStartAtMs: number | null;
}

export const parseMillis = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const parseDateMillis = (value?: string | null): number | null => {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export const parseRevenueCatDateMillis = (
  millisValue?: number | string | null,
  dateValue?: string | null
): number | null => {
  return parseMillis(millisValue) ?? parseDateMillis(dateValue);
};

export const resolvePremiumEntitlement = (
  entitlements?: Record<string, RevenueCatEntitlement> | null
): RevenueCatEntitlement | null => {
  if (!entitlements) {
    return null;
  }

  if (entitlements[PREMIUM_ENTITLEMENT_ID]) {
    return entitlements[PREMIUM_ENTITLEMENT_ID];
  }

  for (const [entitlementId, entitlement] of Object.entries(entitlements)) {
    if (entitlementId.trim().toLowerCase() === PREMIUM_ENTITLEMENT_ID) {
      return entitlement;
    }
  }

  return null;
};

export const resolveActiveSubscription = (
  subscriptions?: Record<string, RevenueCatSubscription> | null,
  nowMs?: number
): RevenueCatActiveSubscription | null => {
  if (!subscriptions) {
    return null;
  }

  const entries = Object.entries(subscriptions)
    .map(([productId, subscription]) => ({
      expiresAtMs: parseRevenueCatDateMillis(
        subscription.expires_date_ms,
        subscription.expires_date ?? null
      ),
      productId,
      subscription,
    }))
    .filter((entry) => {
      if (entry.expiresAtMs === null) {
        return false;
      }

      if (nowMs === undefined) {
        return true;
      }

      return entry.expiresAtMs > nowMs;
    })
    .sort((a, b) => {
      const bExpiresAt = b.expiresAtMs ?? 0;
      const aExpiresAt = a.expiresAtMs ?? 0;
      return bExpiresAt - aExpiresAt;
    });

  return entries[0] ?? null;
};

const resolveLifetimePurchase = (
  nonSubscriptions?: Record<string, RevenueCatNonSubscription[]> | null
): { productId: string; purchaseAtMs: number | null } | null => {
  if (!nonSubscriptions) {
    return null;
  }

  let resolved: { productId: string; purchaseAtMs: number | null } | null = null;

  for (const [productId, purchases] of Object.entries(nonSubscriptions)) {
    if (!isLegacyLifetimeProductId(productId) || purchases.length === 0) {
      continue;
    }

    const latestPurchaseAtMs = purchases
      .map((purchase) =>
        parseRevenueCatDateMillis(purchase.purchase_date_ms, purchase.purchase_date ?? null)
      )
      .filter((value): value is number => value !== null)
      .sort((a, b) => b - a)[0] ?? null;

    if (!resolved) {
      resolved = { productId, purchaseAtMs: latestPurchaseAtMs };
      continue;
    }

    const currentPurchaseAt = resolved.purchaseAtMs ?? 0;
    const nextPurchaseAt = latestPurchaseAtMs ?? 0;

    if (nextPurchaseAt >= currentPurchaseAt) {
      resolved = { productId, purchaseAtMs: latestPurchaseAtMs };
    }
  }

  return resolved;
};

const resolveSubscriptionType = (
  productId?: string | null
): 'monthly' | 'yearly' | null => {
  if (productId === MONTHLY_SUBSCRIPTION_PRODUCT_ID) {
    return 'monthly';
  }

  if (productId === YEARLY_SUBSCRIPTION_PRODUCT_ID) {
    return 'yearly';
  }

  return null;
};

const hasTrialHistoryFromSubscriptions = (
  subscriptions?: Record<string, RevenueCatSubscription> | null
): boolean => {
  if (!subscriptions) {
    return false;
  }

  return Object.values(subscriptions).some((subscription) => {
    return String(subscription.period_type ?? '').trim().toUpperCase() === 'TRIAL';
  });
};

export const resolveRevenueCatPremiumState = (
  subscriber: RevenueCatSubscriber,
  nowMs: number
): RevenueCatResolvedPremiumState => {
  const entitlement = resolvePremiumEntitlement(subscriber.entitlements);
  const entitlementExpiresAtMs = parseRevenueCatDateMillis(
    entitlement?.expires_date_ms,
    entitlement?.expires_date ?? null
  );
  const entitlementPurchaseAtMs = parseRevenueCatDateMillis(
    entitlement?.purchase_date_ms,
    entitlement?.purchase_date ?? null
  );

  const entitlementIsActive =
    entitlement != null && (entitlementExpiresAtMs === null || entitlementExpiresAtMs > nowMs);

  const activeSubscription = resolveActiveSubscription(subscriber.subscriptions, nowMs);
  const lifetimePurchase = resolveLifetimePurchase(subscriber.non_subscriptions);

  const entitlementProductId =
    typeof entitlement?.product_identifier === 'string'
      ? entitlement.product_identifier.trim()
      : null;
  const hasLifetimeEntitlement = entitlementIsActive && isLegacyLifetimeProductId(entitlementProductId);
  const hasLifetimePurchase = lifetimePurchase !== null;

  if (hasLifetimeEntitlement || hasLifetimePurchase) {
    const productId = entitlementProductId ?? lifetimePurchase?.productId ?? null;
    const purchaseAtMs = entitlementPurchaseAtMs ?? lifetimePurchase?.purchaseAtMs ?? null;

    return {
      isPremium: true,
      entitlementType: 'lifetime',
      source: 'revenuecat',
      productId,
      expiresAtMs: null,
      purchaseAtMs,
      isInTrial: false,
      trialStartAtMs: null,
      trialEndAtMs: null,
      hasUsedTrial: hasTrialHistoryFromSubscriptions(subscriber.subscriptions),
      subscriptionType: null,
      subscriptionState: null,
      originalAppUserId:
        String(subscriber.original_app_user_id ?? '').trim() || null,
    };
  }

  const subscriptionProductId = entitlementProductId ?? activeSubscription?.productId ?? null;
  const subscriptionExpiresAtMs = entitlementExpiresAtMs ?? activeSubscription?.expiresAtMs ?? null;
  const subscriptionPurchaseAtMs =
    entitlementPurchaseAtMs ??
    parseRevenueCatDateMillis(
      activeSubscription?.subscription.purchase_date_ms,
      activeSubscription?.subscription.purchase_date ?? null
    );

  const periodType = String(
    entitlement?.period_type ?? activeSubscription?.subscription.period_type ?? ''
  )
    .trim()
    .toUpperCase();
  const hasActiveSubscription = entitlementIsActive || activeSubscription !== null;
  const isInTrial = hasActiveSubscription && periodType === 'TRIAL';

  if (hasActiveSubscription) {
    return {
      isPremium: true,
      entitlementType: 'subscription',
      source: 'revenuecat',
      productId: subscriptionProductId,
      expiresAtMs: subscriptionExpiresAtMs,
      purchaseAtMs: subscriptionPurchaseAtMs,
      isInTrial,
      trialStartAtMs: isInTrial ? subscriptionPurchaseAtMs : null,
      trialEndAtMs: isInTrial ? subscriptionExpiresAtMs : null,
      hasUsedTrial: isInTrial || hasTrialHistoryFromSubscriptions(subscriber.subscriptions),
      subscriptionType: resolveSubscriptionType(subscriptionProductId),
      subscriptionState: 'ACTIVE',
      originalAppUserId:
        String(subscriber.original_app_user_id ?? '').trim() || null,
    };
  }

  return {
    isPremium: false,
    entitlementType: 'none',
    source: 'none',
    productId: subscriptionProductId,
    expiresAtMs: subscriptionExpiresAtMs,
    purchaseAtMs: subscriptionPurchaseAtMs,
    isInTrial: false,
    trialStartAtMs: null,
    trialEndAtMs: null,
    hasUsedTrial: hasTrialHistoryFromSubscriptions(subscriber.subscriptions),
    subscriptionType: resolveSubscriptionType(subscriptionProductId),
    subscriptionState: 'EXPIRED',
    originalAppUserId:
      String(subscriber.original_app_user_id ?? '').trim() || null,
  };
};

const parseRevenueCatSubscriberResponse = (responseBody: string): RevenueCatSubscriber | undefined => {
  if (!responseBody.trim()) {
    return undefined;
  }

  const parsed = JSON.parse(responseBody) as { subscriber?: RevenueCatSubscriber };
  return parsed.subscriber;
};

export const fetchRevenueCatSubscriber = async (
  apiKey: string,
  appUserId: string
): Promise<RevenueCatSubscriberLookupResponse> => {
  const encodedAppUserId = encodeURIComponent(appUserId);
  const url = `https://api.revenuecat.com/v1/subscribers/${encodedAppUserId}`;

  return await new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        method: 'GET',
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on('data', (chunk) => {
          chunks.push(Buffer.from(chunk));
        });

        response.on('end', () => {
          const statusCode = response.statusCode ?? 0;
          const responseBody = Buffer.concat(chunks).toString('utf8');

          if (statusCode < 200 || statusCode >= 300) {
            resolve({ statusCode });
            return;
          }

          try {
            resolve({
              statusCode,
              subscriber: parseRevenueCatSubscriberResponse(responseBody),
            });
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.on('error', (error) => {
      reject(error);
    });

    request.end();
  });
};

export const isTransientRevenueCatError = (
  error: unknown,
  statusCode?: number
): boolean => {
  if (typeof statusCode === 'number' && (statusCode === 429 || statusCode >= 500)) {
    return true;
  }

  const errorCode = String((error as { code?: string | number })?.code ?? '').toUpperCase();
  if (
    errorCode === 'ECONNABORTED' ||
    errorCode === 'ECONNRESET' ||
    errorCode === 'ENETUNREACH' ||
    errorCode === 'ENOTFOUND' ||
    errorCode === 'ETIMEDOUT' ||
    errorCode === 'EAI_AGAIN'
  ) {
    return true;
  }

  const errorMessage = String((error as { message?: string })?.message ?? '').toLowerCase();
  return (
    errorMessage.includes('network') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('temporarily unavailable') ||
    errorMessage.includes('rate limit')
  );
};
