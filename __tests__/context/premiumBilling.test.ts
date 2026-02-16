import {
  getDisplayPriceForSubscriptionProduct,
  getPlanForProductId,
  getProductIdForPlan,
  getProductPriority,
  inferPurchaseType,
  isKnownPremiumProductId,
  isMonthlyTrialOffer,
  MONTHLY_TRIAL_OFFER_ID,
  resolveMonthlyStandardOffer,
  resolveMonthlyTrialOffer,
  shouldTreatRestoreAsSuccess,
  sortPurchasesByPremiumPriority,
  SUBSCRIPTION_PRODUCT_IDS,
} from '@/src/context/premiumBilling';

describe('premiumBilling helpers', () => {
  it('maps plans to expected product IDs', () => {
    expect(getProductIdForPlan('monthly')).toBe(SUBSCRIPTION_PRODUCT_IDS.monthly);
    expect(getProductIdForPlan('yearly')).toBe(SUBSCRIPTION_PRODUCT_IDS.yearly);
  });

  it('maps known product IDs to plans', () => {
    expect(getPlanForProductId(SUBSCRIPTION_PRODUCT_IDS.monthly)).toBe('monthly');
    expect(getPlanForProductId(SUBSCRIPTION_PRODUCT_IDS.yearly)).toBe('yearly');
    expect(getPlanForProductId('unknown_product')).toBeNull();
  });

  it('infers purchase type as subscription', () => {
    expect(inferPurchaseType()).toBe('subs');
    expect(inferPurchaseType(SUBSCRIPTION_PRODUCT_IDS.monthly)).toBe('subs');
    expect(inferPurchaseType(SUBSCRIPTION_PRODUCT_IDS.yearly)).toBe('subs');
  });

  it('recognizes known subscription premium products', () => {
    expect(isKnownPremiumProductId(SUBSCRIPTION_PRODUCT_IDS.monthly)).toBe(true);
    expect(isKnownPremiumProductId(SUBSCRIPTION_PRODUCT_IDS.yearly)).toBe(true);
    expect(isKnownPremiumProductId('anything_else')).toBe(false);
  });

  it('prioritizes yearly before monthly before unknown', () => {
    const yearlyPriority = getProductPriority(SUBSCRIPTION_PRODUCT_IDS.yearly);
    const monthlyPriority = getProductPriority(SUBSCRIPTION_PRODUCT_IDS.monthly);
    const unknownPriority = getProductPriority('unknown');

    expect(yearlyPriority).toBeLessThan(monthlyPriority);
    expect(monthlyPriority).toBeLessThan(unknownPriority);
  });

  it('resolves monthly trial offers by offerId', () => {
    const trialOffer = {
      basePlanId: 'monthly',
      offerId: MONTHLY_TRIAL_OFFER_ID,
      offerTags: [],
      offerToken: 'trial-token-by-id',
      pricingPhases: { pricingPhaseList: [] },
    } as any;

    expect(isMonthlyTrialOffer(trialOffer)).toBe(true);
    expect(resolveMonthlyTrialOffer([trialOffer])).toEqual({
      isEligible: true,
      offerToken: 'trial-token-by-id',
    });
  });

  it('resolves monthly trial offers by offerTags fallback', () => {
    const trialOffer = {
      basePlanId: 'monthly',
      offerId: null,
      offerTags: ['starter', MONTHLY_TRIAL_OFFER_ID],
      offerToken: 'trial-token-by-tag',
      pricingPhases: { pricingPhaseList: [] },
    } as any;

    expect(isMonthlyTrialOffer(trialOffer)).toBe(true);
    expect(resolveMonthlyTrialOffer([trialOffer])).toEqual({
      isEligible: true,
      offerToken: 'trial-token-by-tag',
    });
  });

  it('marks trial as unavailable when no matching offer is found', () => {
    const nonTrialOffer = {
      basePlanId: 'monthly',
      offerId: 'standard-offer',
      offerTags: ['regular'],
      offerToken: 'regular-token',
      pricingPhases: { pricingPhaseList: [] },
    } as any;

    expect(resolveMonthlyTrialOffer([nonTrialOffer])).toEqual({
      isEligible: false,
      offerToken: null,
    });
  });

  it('resolves monthly trial offers by pricing phase fallback', () => {
    const trialOfferWithoutIdOrTag = {
      basePlanId: 'monthly',
      offerId: null,
      offerTags: [],
      offerToken: 'trial-token-by-phase',
      pricingPhases: {
        pricingPhaseList: [
          {
            billingCycleCount: 1,
            billingPeriod: 'P7D',
            formattedPrice: 'Free',
            priceAmountMicros: '0',
            priceCurrencyCode: 'USD',
            recurrenceMode: 2,
          },
          {
            billingCycleCount: 0,
            billingPeriod: 'P1M',
            formattedPrice: '$3.00',
            priceAmountMicros: '3000000',
            priceCurrencyCode: 'USD',
            recurrenceMode: 1,
          },
        ],
      },
    } as any;

    expect(isMonthlyTrialOffer(trialOfferWithoutIdOrTag)).toBe(true);
    expect(resolveMonthlyTrialOffer([trialOfferWithoutIdOrTag])).toEqual({
      isEligible: true,
      offerToken: 'trial-token-by-phase',
    });
  });

  it('does not mark non-monthly free-intro offers as trial fallback matches', () => {
    const nonMonthlyIntroOffer = {
      basePlanId: 'monthly',
      offerId: null,
      offerTags: [],
      offerToken: 'non-trial-token',
      pricingPhases: {
        pricingPhaseList: [
          {
            billingCycleCount: 1,
            billingPeriod: 'P7D',
            formattedPrice: 'Free',
            priceAmountMicros: '0',
            priceCurrencyCode: 'USD',
            recurrenceMode: 2,
          },
          {
            billingCycleCount: 0,
            billingPeriod: 'P1Y',
            formattedPrice: '$30.00',
            priceAmountMicros: '30000000',
            priceCurrencyCode: 'USD',
            recurrenceMode: 1,
          },
        ],
      },
    } as any;

    expect(isMonthlyTrialOffer(nonMonthlyIntroOffer)).toBe(false);
    expect(resolveMonthlyTrialOffer([nonMonthlyIntroOffer])).toEqual({
      isEligible: false,
      offerToken: null,
    });
  });

  it('resolves standard monthly offer token when trial and non-trial offers are present', () => {
    const trialOffer = {
      basePlanId: 'monthly',
      offerId: MONTHLY_TRIAL_OFFER_ID,
      offerTags: [MONTHLY_TRIAL_OFFER_ID],
      offerToken: 'trial-token',
      pricingPhases: {
        pricingPhaseList: [
          {
            billingCycleCount: 1,
            billingPeriod: 'P7D',
            formattedPrice: 'Free',
            priceAmountMicros: '0',
            priceCurrencyCode: 'USD',
            recurrenceMode: 2,
          },
          {
            billingCycleCount: 0,
            billingPeriod: 'P1M',
            formattedPrice: '$3.00',
            priceAmountMicros: '3000000',
            priceCurrencyCode: 'USD',
            recurrenceMode: 1,
          },
        ],
      },
    } as any;

    const standardOffer = {
      basePlanId: 'monthly',
      offerId: 'standard-monthly',
      offerTags: ['standard'],
      offerToken: 'standard-token',
      pricingPhases: {
        pricingPhaseList: [
          {
            billingCycleCount: 0,
            billingPeriod: 'P1M',
            formattedPrice: '$3.00',
            priceAmountMicros: '3000000',
            priceCurrencyCode: 'USD',
            recurrenceMode: 1,
          },
        ],
      },
    } as any;

    expect(resolveMonthlyStandardOffer([trialOffer, standardOffer])).toEqual({
      offerToken: 'standard-token',
    });
  });

  it('returns null standard token when only trial offer exists', () => {
    const trialOffer = {
      basePlanId: 'monthly',
      offerId: MONTHLY_TRIAL_OFFER_ID,
      offerTags: [MONTHLY_TRIAL_OFFER_ID],
      offerToken: 'trial-token',
      pricingPhases: { pricingPhaseList: [] },
    } as any;

    expect(resolveMonthlyStandardOffer([trialOffer])).toEqual({
      offerToken: null,
    });
  });

  it('does not classify trial-pattern monthly offers as standard monthly offers', () => {
    const trialPatternOffer = {
      basePlanId: 'monthly',
      offerId: null,
      offerTags: [],
      offerToken: 'trial-pattern-token',
      pricingPhases: {
        pricingPhaseList: [
          {
            billingCycleCount: 1,
            billingPeriod: 'P7D',
            formattedPrice: 'Free',
            priceAmountMicros: '0',
            priceCurrencyCode: 'USD',
            recurrenceMode: 2,
          },
          {
            billingCycleCount: 0,
            billingPeriod: 'P1M',
            formattedPrice: '$3.00',
            priceAmountMicros: '3000000',
            priceCurrencyCode: 'USD',
            recurrenceMode: 1,
          },
        ],
      },
    } as any;

    expect(resolveMonthlyStandardOffer([trialPatternOffer])).toEqual({
      offerToken: null,
    });
  });

  it('selects a paid recurring price even when first phase is free trial', () => {
    const monthlyProduct = {
      displayPrice: '$3.00',
      id: SUBSCRIPTION_PRODUCT_IDS.monthly,
      platform: 'android',
      subscriptionOfferDetailsAndroid: [
        {
          basePlanId: 'monthly',
          offerId: MONTHLY_TRIAL_OFFER_ID,
          offerTags: [MONTHLY_TRIAL_OFFER_ID],
          offerToken: 'trial-token',
          pricingPhases: {
            pricingPhaseList: [
              {
                billingCycleCount: 1,
                billingPeriod: 'P7D',
                formattedPrice: 'Free',
                priceAmountMicros: '0',
                priceCurrencyCode: 'USD',
                recurrenceMode: 2,
              },
              {
                billingCycleCount: 0,
                billingPeriod: 'P1M',
                formattedPrice: '$3.00',
                priceAmountMicros: '3000000',
                priceCurrencyCode: 'USD',
                recurrenceMode: 1,
              },
            ],
          },
        },
      ],
      type: 'subs',
    } as any;

    expect(getDisplayPriceForSubscriptionProduct(monthlyProduct)).toBe('$3.00');
  });

  it('keeps restore scan running for non-entitled validation results', () => {
    expect(
      shouldTreatRestoreAsSuccess({
        validationSucceeded: true,
        isPremium: false,
      })
    ).toBe(false);

    expect(
      shouldTreatRestoreAsSuccess({
        validationSucceeded: true,
        isPremium: true,
      })
    ).toBe(true);
  });

  it('sorts purchases deterministically by existing premium priority', () => {
    const sorted = sortPurchasesByPremiumPriority([
      { productId: SUBSCRIPTION_PRODUCT_IDS.monthly },
      { productId: SUBSCRIPTION_PRODUCT_IDS.yearly },
    ]);

    expect(sorted.map((purchase) => purchase.productId)).toEqual([
      SUBSCRIPTION_PRODUCT_IDS.yearly,
      SUBSCRIPTION_PRODUCT_IDS.monthly,
    ]);
  });
});
