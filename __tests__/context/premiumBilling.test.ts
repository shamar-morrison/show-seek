import {
  getPlanForProductId,
  getProductIdForPlan,
  getProductPriority,
  inferPurchaseType,
  isKnownPremiumProductId,
  LEGACY_LIFETIME_PRODUCT_ID,
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
    expect(getPlanForProductId(LEGACY_LIFETIME_PRODUCT_ID)).toBeNull();
    expect(getPlanForProductId('unknown_product')).toBeNull();
  });

  it('infers purchase type from product ID', () => {
    expect(inferPurchaseType(LEGACY_LIFETIME_PRODUCT_ID)).toBe('in-app');
    expect(inferPurchaseType(SUBSCRIPTION_PRODUCT_IDS.monthly)).toBe('subs');
    expect(inferPurchaseType(SUBSCRIPTION_PRODUCT_IDS.yearly)).toBe('subs');
  });

  it('recognizes known premium products', () => {
    expect(isKnownPremiumProductId(LEGACY_LIFETIME_PRODUCT_ID)).toBe(true);
    expect(isKnownPremiumProductId(SUBSCRIPTION_PRODUCT_IDS.monthly)).toBe(true);
    expect(isKnownPremiumProductId(SUBSCRIPTION_PRODUCT_IDS.yearly)).toBe(true);
    expect(isKnownPremiumProductId('anything_else')).toBe(false);
  });

  it('prioritizes legacy lifetime before subscription plans', () => {
    const lifetimePriority = getProductPriority(LEGACY_LIFETIME_PRODUCT_ID);
    const yearlyPriority = getProductPriority(SUBSCRIPTION_PRODUCT_IDS.yearly);
    const monthlyPriority = getProductPriority(SUBSCRIPTION_PRODUCT_IDS.monthly);
    const unknownPriority = getProductPriority('unknown');

    expect(lifetimePriority).toBeLessThan(yearlyPriority);
    expect(yearlyPriority).toBeLessThan(monthlyPriority);
    expect(monthlyPriority).toBeLessThan(unknownPriority);
  });
});
