import type {
  PricingPhaseAndroid,
  Product,
  ProductSubscription,
  ProductSubscriptionAndroidOfferDetails,
} from 'react-native-iap';

export type PremiumPlan = 'monthly' | 'yearly';
export type PremiumPurchaseType = 'in-app' | 'subs';

export const LEGACY_LIFETIME_PRODUCT_ID = 'premium_unlock';
export const MONTHLY_TRIAL_OFFER_ID = 'one-week-trial';

export const SUBSCRIPTION_PRODUCT_IDS: Record<PremiumPlan, string> = {
  monthly: 'monthly_showseek_sub',
  yearly: 'showseek_yearly_sub',
};

export const SUBSCRIPTION_PRODUCT_ID_LIST: string[] = [
  SUBSCRIPTION_PRODUCT_IDS.monthly,
  SUBSCRIPTION_PRODUCT_IDS.yearly,
];

export const PREMIUM_PRODUCT_PRIORITY: string[] = [
  LEGACY_LIFETIME_PRODUCT_ID,
  SUBSCRIPTION_PRODUCT_IDS.yearly,
  SUBSCRIPTION_PRODUCT_IDS.monthly,
];

export const getProductIdForPlan = (plan: PremiumPlan): string => SUBSCRIPTION_PRODUCT_IDS[plan];

export const getPlanForProductId = (productId?: string | null): PremiumPlan | null => {
  if (!productId) return null;
  if (productId === SUBSCRIPTION_PRODUCT_IDS.monthly) return 'monthly';
  if (productId === SUBSCRIPTION_PRODUCT_IDS.yearly) return 'yearly';
  return null;
};

export const isLegacyLifetimeProduct = (productId?: string | null): boolean =>
  productId === LEGACY_LIFETIME_PRODUCT_ID;

export const isSubscriptionProduct = (productId?: string | null): boolean =>
  getPlanForProductId(productId) !== null;

export const isKnownPremiumProductId = (productId?: string | null): boolean =>
  isLegacyLifetimeProduct(productId) || isSubscriptionProduct(productId);

export const inferPurchaseType = (productId?: string | null): PremiumPurchaseType =>
  isSubscriptionProduct(productId) ? 'subs' : 'in-app';

export const getProductPriority = (productId?: string | null): number => {
  if (!productId) return Number.MAX_SAFE_INTEGER;
  const index = PREMIUM_PRODUCT_PRIORITY.indexOf(productId);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
};

const hasPositivePrice = (phase?: PricingPhaseAndroid | null): boolean => {
  if (!phase) {
    return false;
  }

  const amountMicros = Number(phase.priceAmountMicros ?? '0');
  return Number.isFinite(amountMicros) && amountMicros > 0;
};

const getPreferredAndroidSubscriptionPrice = (
  offerDetails?: ProductSubscriptionAndroidOfferDetails[] | null
): string | null => {
  if (!Array.isArray(offerDetails) || offerDetails.length === 0) {
    return null;
  }

  for (const offerDetail of offerDetails) {
    const pricingPhases = offerDetail.pricingPhases?.pricingPhaseList ?? [];

    const recurringPositivePhase =
      pricingPhases.find((phase) => hasPositivePrice(phase) && phase.recurrenceMode === 1) ??
      pricingPhases.find((phase) => hasPositivePrice(phase)) ??
      pricingPhases[0];

    if (recurringPositivePhase?.formattedPrice) {
      return recurringPositivePhase.formattedPrice;
    }
  }

  return null;
};

const normalizeOfferIdentifier = (value?: string | null): string =>
  String(value ?? '')
    .trim()
    .toLowerCase();

export const isMonthlyTrialOffer = (
  offerDetails?: ProductSubscriptionAndroidOfferDetails | null
): boolean => {
  if (!offerDetails) {
    return false;
  }

  const normalizedTrialId = normalizeOfferIdentifier(MONTHLY_TRIAL_OFFER_ID);
  const normalizedOfferId = normalizeOfferIdentifier(offerDetails.offerId);
  if (normalizedOfferId === normalizedTrialId) {
    return true;
  }

  return offerDetails.offerTags.some((tag) => normalizeOfferIdentifier(tag) === normalizedTrialId);
};

export const resolveMonthlyTrialOffer = (
  offerDetails?: ProductSubscriptionAndroidOfferDetails[] | null
): {
  isEligible: boolean;
  offerToken: string | null;
} => {
  if (!Array.isArray(offerDetails) || offerDetails.length === 0) {
    return {
      isEligible: false,
      offerToken: null,
    };
  }

  const matchingOffer = offerDetails.find((offer) => isMonthlyTrialOffer(offer) && offer.offerToken);
  if (!matchingOffer) {
    return {
      isEligible: false,
      offerToken: null,
    };
  }

  return {
    isEligible: true,
    offerToken: matchingOffer.offerToken,
  };
};

export const getDisplayPriceForSubscriptionProduct = (
  product: Product | ProductSubscription | undefined
): string | null => {
  if (!product) {
    return null;
  }

  if (product.platform === 'android' && product.type === 'subs') {
    const preferredPrice = getPreferredAndroidSubscriptionPrice(
      product.subscriptionOfferDetailsAndroid
    );
    if (preferredPrice) {
      return preferredPrice;
    }
  }

  return product.displayPrice || null;
};

export const sortPurchasesByPremiumPriority = <T extends { productId?: string | null }>(
  purchases: T[]
): T[] => [...purchases].sort((a, b) => getProductPriority(a.productId) - getProductPriority(b.productId));

export interface PremiumRestoreAttemptResult {
  isPremium: boolean;
  validationSucceeded: boolean;
}

export const shouldTreatRestoreAsSuccess = (result: PremiumRestoreAttemptResult): boolean =>
  result.validationSucceeded && result.isPremium;
