import { functions as firebaseFunctions } from '@/src/firebase/config';
import { httpsCallable } from 'firebase/functions';
import * as ReactNativeIap from 'react-native-iap';
import type { Purchase } from 'react-native-iap';

const LEGACY_LIFETIME_PRODUCT_ID = 'premium_unlock';
const REDACTED_TOKEN_PREFIX_LENGTH = 8;

export type LegacyLifetimePurchaseState = 'purchased' | 'pending' | 'unknown';

export interface LegacyLifetimePurchase {
  productId: string;
  purchaseToken: string;
  purchaseState: LegacyLifetimePurchaseState;
  transactionDate: number;
  transactionId: string | null;
}

interface ValidatePurchaseResponse {
  entitlementType?: string;
  isPremium?: boolean;
  success?: boolean;
}

const toRedactedTokenPrefix = (purchaseToken: string): string =>
  purchaseToken.slice(0, REDACTED_TOKEN_PREFIX_LENGTH);

const getPurchaseStatePriority = (purchaseState: LegacyLifetimePurchaseState): number => {
  if (purchaseState === 'purchased') {
    return 3;
  }
  if (purchaseState === 'unknown') {
    return 2;
  }
  return 1;
};

const normalizePurchaseState = (purchase: Purchase): LegacyLifetimePurchaseState => {
  const purchaseState = String(purchase.purchaseState ?? '')
    .trim()
    .toLowerCase();
  if (purchaseState === 'purchased') {
    return 'purchased';
  }
  if (purchaseState === 'pending') {
    return 'pending';
  }
  return 'unknown';
};

const isLegacyLifetimeCandidate = (purchase: Purchase): boolean => {
  return purchase.productId === LEGACY_LIFETIME_PRODUCT_ID && typeof purchase.purchaseToken === 'string';
};

const mapToLegacyLifetimePurchase = (purchase: Purchase): LegacyLifetimePurchase => {
  const purchaseWithTransactionId = purchase as Purchase & { transactionId?: string | null };
  return {
    productId: purchase.productId,
    purchaseToken: String(purchase.purchaseToken ?? ''),
    purchaseState: normalizePurchaseState(purchase),
    transactionDate: Number(purchase.transactionDate ?? 0),
    transactionId: purchaseWithTransactionId.transactionId ?? null,
  };
};

const getLegacyLifetimePurchases = (purchases: Purchase[]): LegacyLifetimePurchase[] =>
  purchases
    .filter(isLegacyLifetimeCandidate)
    .map(mapToLegacyLifetimePurchase)
    .filter((purchase) => purchase.purchaseToken.length > 0);

const dedupeLegacyLifetimePurchases = (
  purchases: LegacyLifetimePurchase[]
): LegacyLifetimePurchase[] => {
  const purchasesByToken = new Map<string, LegacyLifetimePurchase>();

  for (const purchase of purchases) {
    const existingPurchase = purchasesByToken.get(purchase.purchaseToken);
    if (!existingPurchase) {
      purchasesByToken.set(purchase.purchaseToken, purchase);
      continue;
    }

    const nextPriority = getPurchaseStatePriority(purchase.purchaseState);
    const existingPriority = getPurchaseStatePriority(existingPurchase.purchaseState);
    if (nextPriority > existingPriority) {
      purchasesByToken.set(purchase.purchaseToken, purchase);
      continue;
    }

    if (nextPriority === existingPriority && purchase.transactionDate > existingPurchase.transactionDate) {
      purchasesByToken.set(purchase.purchaseToken, purchase);
    }
  }

  return Array.from(purchasesByToken.values());
};

const sortLegacyLifetimePurchases = (
  purchases: LegacyLifetimePurchase[]
): LegacyLifetimePurchase[] => {
  return [...purchases].sort((left, right) => {
    const priorityDelta =
      getPurchaseStatePriority(right.purchaseState) - getPurchaseStatePriority(left.purchaseState);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return right.transactionDate - left.transactionDate;
  });
};

const getAvailablePurchasesIncludingHistoryIfAvailable = async (): Promise<Purchase[]> => {
  type AndroidHistoryGetter = ((
    options?: {
      includeSuspendedAndroid?: boolean | null;
    }
  ) => Promise<Purchase[]>) | undefined;
  const historyAwareGetter = (
    ReactNativeIap as unknown as {
      getAvailablePurchasesIncludingHistoryAndroid?: AndroidHistoryGetter;
    }
  ).getAvailablePurchasesIncludingHistoryAndroid;

  if (typeof historyAwareGetter !== 'function') {
    console.warn(
      '[LegacyLifetimeRestore] History-aware Android purchase query is unavailable; using active purchases only.'
    );
    return [];
  }

  try {
    return await historyAwareGetter({
      includeSuspendedAndroid: true,
    });
  } catch (error) {
    console.warn('[LegacyLifetimeRestore] Failed to query history-aware Android purchases:', error);
    return [];
  }
};

export const findLegacyLifetimePurchases = async (): Promise<LegacyLifetimePurchase[]> => {
  let connectionInitialized = false;
  try {
    await ReactNativeIap.initConnection();
    connectionInitialized = true;

    const availablePurchases = await ReactNativeIap.getAvailablePurchases({
      includeSuspendedAndroid: true,
    });
    const availableLifetimePurchases = getLegacyLifetimePurchases(availablePurchases);

    const historyAwarePurchases = await getAvailablePurchasesIncludingHistoryIfAvailable();
    const historyAwareLifetimePurchases = getLegacyLifetimePurchases(historyAwarePurchases);

    const dedupedLifetimePurchases = dedupeLegacyLifetimePurchases([
      ...availableLifetimePurchases,
      ...historyAwareLifetimePurchases,
    ]);
    const orderedLifetimePurchases = sortLegacyLifetimePurchases(dedupedLifetimePurchases);

    const purchasedCount = orderedLifetimePurchases.filter(
      (purchase) => purchase.purchaseState === 'purchased'
    ).length;
    const unknownCount = orderedLifetimePurchases.filter(
      (purchase) => purchase.purchaseState === 'unknown'
    ).length;
    const pendingCount = orderedLifetimePurchases.filter(
      (purchase) => purchase.purchaseState === 'pending'
    ).length;
    console.log('[LegacyLifetimeRestore] Google Play purchase query result:', {
      availablePurchasesCount: availablePurchases.length,
      historyAwarePurchasesCount: historyAwarePurchases.length,
      lifetimePurchaseCount: orderedLifetimePurchases.length,
      purchasedCount,
      unknownCount,
      pendingCount,
      candidateTokenPrefixes: orderedLifetimePurchases.map((purchase) =>
        toRedactedTokenPrefix(purchase.purchaseToken)
      ),
    });

    return orderedLifetimePurchases;
  } catch (error) {
    console.error('[LegacyLifetimeRestore] Failed to query Google Play purchases:', error);
    throw error;
  } finally {
    if (connectionInitialized) {
      try {
        await ReactNativeIap.endConnection();
      } catch (endConnectionError) {
        console.warn('[LegacyLifetimeRestore] Failed to end billing connection:', endConnectionError);
      }
    }
  }
};

export const findLegacyLifetimePurchase = async (): Promise<LegacyLifetimePurchase | null> => {
  const purchases = await findLegacyLifetimePurchases();
  return purchases[0] ?? null;
};

export const restoreLegacyLifetimeViaCallable = async (
  userId: string,
  purchase: LegacyLifetimePurchase
): Promise<boolean> => {
  const validatePurchaseCallable = httpsCallable<
    {
      productId: string;
      purchaseToken: string;
      purchaseType: 'in-app';
      source: 'restore';
    },
    ValidatePurchaseResponse
  >(firebaseFunctions, 'validatePurchase');

  console.log('[LegacyLifetimeRestore] Calling validatePurchase for lifetime restore:', {
    productId: purchase.productId,
    tokenPrefix: toRedactedTokenPrefix(purchase.purchaseToken),
    userId,
  });

  const response = await validatePurchaseCallable({
    purchaseType: 'in-app',
    source: 'restore',
    productId: LEGACY_LIFETIME_PRODUCT_ID,
    purchaseToken: purchase.purchaseToken,
  });

  const payload = response.data ?? {};
  const restored = payload.success === true && payload.isPremium === true;
  if (!restored) {
    throw new Error('Legacy lifetime validation did not return premium success.');
  }

  return true;
};
