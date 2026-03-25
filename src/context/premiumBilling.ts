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
  defaultOption?: BillingSubscriptionOption | null;
  displayPrice?: string | null;
  introPrice?: BillingIntroPrice | null;
  platform?: string | null;
  priceString?: string | null;
  subscriptionPeriod?: string | null;
  subscriptionOfferDetailsAndroid?: ProductSubscriptionAndroidOfferDetails[] | null;
  type?: string | null;
};

interface BillingIntroPrice {
  period?: string | null;
  periodNumberOfUnits?: number | null;
  periodUnit?: string | null;
}

interface BillingPeriodSource {
  iso8601?: string | null;
  unit?: string | null;
  value?: number | null;
}

interface BillingPriceSource {
  formatted?: string | null;
}

interface BillingPricingPhase {
  billingPeriod?: BillingPeriodSource | null;
  price?: BillingPriceSource | null;
}

interface BillingSubscriptionOption {
  billingPeriod?: BillingPeriodSource | null;
  freePhase?: BillingPricingPhase | null;
  fullPricePhase?: BillingPricingPhase | null;
}

export type PremiumPlan = 'monthly' | 'yearly';
export type PremiumPurchaseType = 'subs';
export type PremiumBillingPeriodUnit = 'day' | 'week' | 'month' | 'year' | 'unknown';
export type PremiumStoreSubscriptionLabelKey =
  | 'premium.storeNameGooglePlay'
  | 'premium.storeNameAppStore'
  | 'premium.storeNameGeneric';

export interface PremiumBillingPeriod {
  iso8601: string | null;
  unit: PremiumBillingPeriodUnit;
  value: number;
}

export interface PremiumPlanBillingDetails {
  hasTrialAvailable: boolean;
  recurringPeriod: PremiumBillingPeriod;
  recurringPrice: string | null;
  storeLabelKey: PremiumStoreSubscriptionLabelKey;
  trialPeriod: PremiumBillingPeriod | null;
}

export { MONTHLY_TRIAL_OFFER_ID };

export const PREMIUM_AUTH_REQUIRED_ERROR_CODE = 'AUTH_REQUIRED';

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

const normalizePeriodUnit = (value?: string | null): PremiumBillingPeriodUnit => {
  switch (
    String(value ?? '')
      .trim()
      .toUpperCase()
  ) {
    case 'DAY':
    case 'D':
      return 'day';
    case 'WEEK':
    case 'W':
      return 'week';
    case 'MONTH':
    case 'M':
      return 'month';
    case 'YEAR':
    case 'Y':
      return 'year';
    default:
      return 'unknown';
  }
};

const createBillingPeriod = (
  value: number,
  unit: PremiumBillingPeriodUnit,
  iso8601?: string | null
): PremiumBillingPeriod | null => {
  if (!Number.isFinite(value) || value <= 0 || unit === 'unknown') {
    return null;
  }

  return {
    iso8601: iso8601 ?? null,
    unit,
    value,
  };
};

const parseIso8601Period = (value?: string | null): PremiumBillingPeriod | null => {
  const normalizedValue = String(value ?? '')
    .trim()
    .toUpperCase();

  const match = normalizedValue.match(/^P(\d+)(D|W|M|Y)$/);
  if (!match) {
    return null;
  }

  const [, parsedValue, parsedUnit] = match;
  return createBillingPeriod(Number(parsedValue), normalizePeriodUnit(parsedUnit), normalizedValue);
};

const resolveBillingPeriodFromSource = (
  periodSource?: BillingPeriodSource | null
): PremiumBillingPeriod | null => {
  if (!periodSource) {
    return null;
  }

  const directPeriod = createBillingPeriod(
    Number(periodSource.value ?? 0),
    normalizePeriodUnit(periodSource.unit),
    periodSource.iso8601
  );
  if (directPeriod) {
    return directPeriod;
  }

  return parseIso8601Period(periodSource.iso8601);
};

const resolveIntroPricePeriod = (
  introPrice?: BillingIntroPrice | null
): PremiumBillingPeriod | null => {
  if (!introPrice) {
    return null;
  }

  const directPeriod = createBillingPeriod(
    Number(introPrice.periodNumberOfUnits ?? 0),
    normalizePeriodUnit(introPrice.periodUnit),
    introPrice.period
  );
  if (directPeriod) {
    return directPeriod;
  }

  return parseIso8601Period(introPrice.period);
};

const getFallbackRecurringPeriod = (plan: PremiumPlan): PremiumBillingPeriod => ({
  iso8601: plan === 'monthly' ? 'P1M' : 'P1Y',
  unit: plan === 'monthly' ? 'month' : 'year',
  value: 1,
});

const getFallbackTrialPeriod = (plan: PremiumPlan): PremiumBillingPeriod | null =>
  plan === 'monthly'
    ? {
        iso8601: 'P7D',
        unit: 'day',
        value: 7,
      }
    : null;

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

  const matchingOffer = offerDetails.find(
    (offer) => isMonthlyTrialOffer(offer) && offer.offerToken
  );
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

export const resolveStoreSubscriptionLabelKey = (
  platform?: string | null
): PremiumStoreSubscriptionLabelKey => {
  switch (
    String(platform ?? '')
      .trim()
      .toLowerCase()
  ) {
    case 'android':
      return 'premium.storeNameGooglePlay';
    case 'ios':
      return 'premium.storeNameAppStore';
    default:
      return 'premium.storeNameGeneric';
  }
};

export const getPremiumBillingPeriodTranslationKey = (
  unit: PremiumBillingPeriodUnit
): 'premium.periodDay' | 'premium.periodWeek' | 'premium.periodMonth' | 'premium.periodYear' => {
  switch (unit) {
    case 'day':
      return 'premium.periodDay';
    case 'week':
      return 'premium.periodWeek';
    case 'year':
      return 'premium.periodYear';
    case 'month':
    case 'unknown':
    default:
      return 'premium.periodMonth';
  }
};

export const getPremiumBillingPeriodLabelTranslationKey = (
  unit: PremiumBillingPeriodUnit
):
  | 'premium.periodDayLabel'
  | 'premium.periodWeekLabel'
  | 'premium.periodMonthLabel'
  | 'premium.periodYearLabel' => {
  switch (unit) {
    case 'day':
      return 'premium.periodDayLabel';
    case 'week':
      return 'premium.periodWeekLabel';
    case 'year':
      return 'premium.periodYearLabel';
    case 'month':
    case 'unknown':
    default:
      return 'premium.periodMonthLabel';
  }
};

export const resolvePremiumPlanBillingDetails = ({
  plan,
  platform,
  product,
}: {
  plan: PremiumPlan;
  platform?: string | null;
  product?: BillingProduct | null;
}): PremiumPlanBillingDetails => {
  const recurringPrice =
    product?.defaultOption?.fullPricePhase?.price?.formatted ??
    product?.priceString ??
    getDisplayPriceForSubscriptionProduct(product ?? undefined);
  const recurringPeriod =
    resolveBillingPeriodFromSource(product?.defaultOption?.billingPeriod) ??
    resolveBillingPeriodFromSource(product?.defaultOption?.fullPricePhase?.billingPeriod) ??
    parseIso8601Period(product?.subscriptionPeriod) ??
    getFallbackRecurringPeriod(plan);
  const hasTrialAvailable =
    product?.defaultOption?.freePhase?.billingPeriod != null || product?.introPrice != null;
  const trialPeriod = hasTrialAvailable
    ? (resolveBillingPeriodFromSource(product?.defaultOption?.freePhase?.billingPeriod) ??
      resolveIntroPricePeriod(product?.introPrice) ??
      getFallbackTrialPeriod(plan))
    : null;

  return {
    hasTrialAvailable,
    recurringPeriod,
    recurringPrice,
    storeLabelKey: resolveStoreSubscriptionLabelKey(platform),
    trialPeriod,
  };
};

export const sortPurchasesByPremiumPriority = <T extends { productId?: string | null }>(
  purchases: T[]
): T[] =>
  [...purchases].sort((a, b) => getProductPriority(a.productId) - getProductPriority(b.productId));

export interface PremiumRestoreAttemptResult {
  isPremium: boolean;
  validationSucceeded: boolean;
}

export const createPremiumAuthRequiredError = (): Error & {
  code: typeof PREMIUM_AUTH_REQUIRED_ERROR_CODE;
} => {
  const error = new Error(PREMIUM_AUTH_REQUIRED_ERROR_CODE) as Error & {
    code: typeof PREMIUM_AUTH_REQUIRED_ERROR_CODE;
  };
  error.name = 'PremiumAuthRequiredError';
  error.code = PREMIUM_AUTH_REQUIRED_ERROR_CODE;
  return error;
};

export const isPremiumAuthRequiredError = (
  error: unknown
): error is Error & { code: typeof PREMIUM_AUTH_REQUIRED_ERROR_CODE } =>
  error instanceof Error &&
  (error.message === PREMIUM_AUTH_REQUIRED_ERROR_CODE ||
    (error as { code?: string }).code === PREMIUM_AUTH_REQUIRED_ERROR_CODE);

export const shouldTreatRestoreAsSuccess = (result: PremiumRestoreAttemptResult): boolean =>
  result.validationSucceeded && result.isPremium;
