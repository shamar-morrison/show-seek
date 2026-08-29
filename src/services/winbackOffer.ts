import { createPremiumAuthRequiredError } from '@/src/context/premiumBilling';
import { auth } from '@/src/firebase/config';
import { trackPurchaseFailure, trackPurchaseSuccess } from '@/src/services/analytics';
import { configureRevenueCat } from '@/src/services/revenueCat';
import { recordNegativeEvent as recordReviewNegativeEvent } from '@/src/services/reviewPromptService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Purchases, {
  PURCHASES_ERROR_CODE,
  type PurchasesOffering,
  type SubscriptionOption,
} from 'react-native-purchases';

export const WINBACK_OFFERING_IDENTIFIER = 'paywall_winback';
export const WINBACK_PACKAGE_IDENTIFIER = '$rc_weekly';
export const WINBACK_PRODUCT_ID = 'showseek_weekly_plan';
export const WINBACK_BASE_PLAN_ID = 'showseek-weekly-plan';
export const WINBACK_OFFER_ID = 'win-back-offer';
export const PREMIUM_ENTITLEMENT_ID = 'premium';

export class WinbackOfferNotFoundError extends Error {
  readonly code = 'WINBACK_OFFER_NOT_FOUND';

  constructor(message = 'Win-back subscription option was not found.') {
    super(message);
    this.name = 'WinbackOfferNotFoundError';
  }
}

export const isWinbackSubscriptionOption = (
  option?: SubscriptionOption | null
): boolean => {
  if (!option || option.isBasePlan) {
    return false;
  }

  const normalizedOfferId = WINBACK_OFFER_ID.toLowerCase().trim();
  const optionId = String(option.id ?? '').toLowerCase().trim();

  const matchesId =
    optionId === normalizedOfferId ||
    optionId === `${WINBACK_BASE_PLAN_ID.toLowerCase()}:${normalizedOfferId}` ||
    optionId.endsWith(`:${normalizedOfferId}`);

  if (matchesId) {
    return true;
  }

  const tags = Array.isArray(option.tags) ? option.tags : [];
  return tags.some((tag) => String(tag).toLowerCase().trim() === normalizedOfferId);
};

export interface GetWinbackSubscriptionOptionOptions {
  offering?: PurchasesOffering | null;
}

/**
 * Fetches the paywall win-back offering and resolves the developer-determined
 * SubscriptionOption for the discounted weekly win-back offer.
 */
export const getWinbackSubscriptionOption = async (
  options?: GetWinbackSubscriptionOptionOptions
): Promise<SubscriptionOption | null> => {
  if (Platform.OS !== 'android') {
    console.warn('[WinbackOffer] Win-back offer is only supported on Android.');
    return null;
  }

  try {
    const isConfigured = await configureRevenueCat();
    if (!isConfigured) {
      console.warn('[WinbackOffer] RevenueCat SDK is not configured.');
      return null;
    }

    let offering = options?.offering;
    if (!offering) {
      const offerings = await Purchases.getOfferings();
      offering = offerings.all[WINBACK_OFFERING_IDENTIFIER] ?? null;
    }

    if (!offering) {
      console.warn(
        `[WinbackOffer] Offering "${WINBACK_OFFERING_IDENTIFIER}" not found in RevenueCat.`
      );
      return null;
    }

    const targetPackage =
      offering.availablePackages.find(
        (pkg) =>
          pkg.identifier === WINBACK_PACKAGE_IDENTIFIER ||
          pkg.product.identifier === `${WINBACK_PRODUCT_ID}:${WINBACK_BASE_PLAN_ID}` ||
          pkg.product.identifier === WINBACK_PRODUCT_ID
      ) ??
      offering.weekly ??
      null;

    if (!targetPackage) {
      console.warn(
        `[WinbackOffer] Package "${WINBACK_PACKAGE_IDENTIFIER}" not found in offering "${WINBACK_OFFERING_IDENTIFIER}".`
      );
      return null;
    }

    const subscriptionOptions = targetPackage.product.subscriptionOptions ?? [];
    const winbackOption = subscriptionOptions.find(isWinbackSubscriptionOption) ?? null;

    if (!winbackOption) {
      console.warn(
        `[WinbackOffer] Win-back subscription option "${WINBACK_OFFER_ID}" not found in package "${targetPackage.identifier}". Available options:`,
        subscriptionOptions.map((opt) => ({
          id: opt.id,
          isBasePlan: opt.isBasePlan,
          tags: opt.tags,
        }))
      );
      return null;
    }

    return winbackOption;
  } catch (error) {
    console.error('[WinbackOffer] Failed to get win-back subscription option:', error);
    return null;
  }
};

export interface PurchaseWinbackOfferOptions {
  subscriptionOption?: SubscriptionOption | null;
}

/**
 * Purchases the win-back discounted subscription option via RevenueCat SDK.
 * Matches existing purchase behavior:
 * - Returns `true` if entitlement is unlocked.
 * - Returns `false` if user cancelled.
 * - Throws on genuine error or if the discounted option cannot be found (never silently charging base plan).
 */
export const purchaseWinbackOffer = async (
  options?: PurchaseWinbackOfferOptions
): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    throw new Error('Win-back subscription offer is only configured on Android.');
  }

  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.isAnonymous) {
    throw createPremiumAuthRequiredError();
  }

  const isConfigured = await configureRevenueCat();
  if (!isConfigured) {
    throw new Error('RevenueCat SDK is not configured.');
  }

  const subscriptionOption =
    options?.subscriptionOption ?? (await getWinbackSubscriptionOption());

  if (!subscriptionOption) {
    const error = new WinbackOfferNotFoundError(
      `Win-back subscription option "${WINBACK_OFFER_ID}" could not be found.`
    );
    console.error('[WinbackOffer] Cannot execute purchase: win-back offer not found.', error);
    throw error;
  }

  try {
    const { customerInfo } = await Purchases.purchaseSubscriptionOption(subscriptionOption);

    const isPremium = customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID] != null;
    if (currentUser.uid) {
      try {
        await AsyncStorage.setItem(`isPremium_${currentUser.uid}`, String(isPremium));
      } catch (cacheErr) {
        console.warn('[WinbackOffer] Failed to write premium cache:', cacheErr);
      }
    }

    const firstPhase = subscriptionOption.pricingPhases?.[0];
    const priceAmount = (firstPhase?.price?.amountMicros ?? 0) / 1_000_000;
    const currency = firstPhase?.price?.currencyCode ?? 'USD';

    void trackPurchaseSuccess({
      plan: 'winback',
      productId: subscriptionOption.productId || WINBACK_PRODUCT_ID,
      price: priceAmount,
      currency,
    });

    return isPremium;
  } catch (err: unknown) {
    const purchaseError = err as { code?: string; userCancelled?: boolean; message?: string };

    if (
      purchaseError.userCancelled === true ||
      purchaseError.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
    ) {
      return false;
    }

    void trackPurchaseFailure({
      plan: 'winback',
      productId: subscriptionOption.productId || WINBACK_PRODUCT_ID,
      reason: purchaseError.message || 'Purchase failed',
      code: purchaseError.code ?? null,
    });

    void recordReviewNegativeEvent();
    throw err;
  }
};
