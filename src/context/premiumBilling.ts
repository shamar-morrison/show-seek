import { MONTHLY_TRIAL_OFFER_ID } from '@/functions/src/shared/premiumOfferConstants';

export interface PricingPhaseAndroid {
  billingPeriod?: string | null;
  formattedPrice?: string | null;
  priceAmountMicros?: string | null;
  recurrenceMode?: number | null;
}

export interface ProductSubscriptionAndroidOfferDetails {
  offerId?: string | null;
  offerTags?: string[] | null;
  offerToken?: string | null;
  pricingPhases?: {
    pricingPhaseList?: PricingPhaseAndroid[] | null;
  } | null;
}

type BillingProduct = {
  displayPrice?: string | null;
  platform?: string | null;
  subscriptionOfferDetailsAndroid?: ProductSubscriptionAndroidOfferDetails[] | null;
  type?: string | null;
};

export type PremiumPlan = 'monthly' | 'yearly';
export type PremiumPurchaseType = 'subs';

export { MONTHLY_TRIAL_OFFER_ID };

export const SUBSCRIPTION_PRODUCT_IDS: Record<PremiumPlan, string> = {
  monthly: 'monthly_showseek_sub',
  yearly: 'showseek_yearly_sub',
};

export const SUBSCRIPTION_PRODUCT_ID_LIST: string[] = [
  SUBSCRIPTION_PRODUCT_IDS.monthly,
  SUBSCRIPTION_PRODUCT_IDS.yearly,
];

export const PREMIUM_PRODUCT_PRIORITY: string[] = [
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

export const isSubscriptionProduct = (productId?: string | null): boolean =>
  getPlanForProductId(productId) !== null;

export const isKnownPremiumProductId = (productId?: string | null): boolean =>
  isSubscriptionProduct(productId);

export const inferPurchaseType = (_productId?: string | null): PremiumPurchaseType => 'subs';

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

const hasZeroPrice = (phase?: PricingPhaseAndroid | null): boolean => {
  if (!phase) {
    return false;
  }

  const amountMicros = Number(phase.priceAmountMicros ?? '0');
  return Number.isFinite(amountMicros) && amountMicros === 0;
};

const normalizeBillingPeriod = (billingPeriod?: string | null): string =>
  String(billingPeriod ?? '')
    .trim()
    .toUpperCase();

const isSevenDayBillingPeriod = (billingPeriod: string): boolean =>
  billingPeriod === 'P7D' || billingPeriod === 'P1W';

const isMonthlyBillingPeriod = (billingPeriod: string): boolean => billingPeriod === 'P1M';

const hasTrialPricingPattern = (
  offerDetails?: ProductSubscriptionAndroidOfferDetails | null
): boolean => {
  if (!offerDetails) {
    return false;
  }

  const pricingPhases = offerDetails.pricingPhases?.pricingPhaseList ?? [];
  if (pricingPhases.length === 0) {
    return false;
  }

  const hasSevenDayFreePhase = pricingPhases.some(
    (phase) =>
      hasZeroPrice(phase) && isSevenDayBillingPeriod(normalizeBillingPeriod(phase.billingPeriod))
  );
  if (!hasSevenDayFreePhase) {
    return false;
  }

  return pricingPhases.some(
    (phase) =>
      hasPositivePrice(phase) &&
      phase.recurrenceMode === 1 &&
      isMonthlyBillingPeriod(normalizeBillingPeriod(phase.billingPeriod))
  );
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

const hasRecurringMonthlyPaidPhase = (
  offerDetails?: ProductSubscriptionAndroidOfferDetails | null
): boolean => {
  if (!offerDetails) {
    return false;
  }

  const pricingPhases = offerDetails.pricingPhases?.pricingPhaseList ?? [];
  return pricingPhases.some(
    (phase) =>
      hasPositivePrice(phase) &&
      phase.recurrenceMode === 1 &&
      isMonthlyBillingPeriod(normalizeBillingPeriod(phase.billingPeriod))
  );
};

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

  const offerTags = Array.isArray(offerDetails.offerTags) ? offerDetails.offerTags : [];
  if (offerTags.some((tag) => normalizeOfferIdentifier(tag) === normalizedTrialId)) {
    return true;
  }

  return hasTrialPricingPattern(offerDetails);
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
    offerToken: matchingOffer.offerToken ?? null,
  };
};

export const resolveMonthlyStandardOffer = (
  offerDetails?: ProductSubscriptionAndroidOfferDetails[] | null
): {
  offerToken: string | null;
} => {
  if (!Array.isArray(offerDetails) || offerDetails.length === 0) {
    return {
      offerToken: null,
    };
  }

  const standardOffers = offerDetails.filter(
    (offer) => !isMonthlyTrialOffer(offer) && !!offer.offerToken
  );

  if (standardOffers.length === 0) {
    return {
      offerToken: null,
    };
  }

  const preferredStandardOffer =
    standardOffers.find((offer) => hasRecurringMonthlyPaidPhase(offer)) ?? standardOffers[0];

  return {
    offerToken: preferredStandardOffer.offerToken ?? null,
  };
};

export const getDisplayPriceForSubscriptionProduct = (
  product: BillingProduct | undefined
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
