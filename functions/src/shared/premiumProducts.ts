export const DEFAULT_LEGACY_LIFETIME_PRODUCT_ID = 'premium_unlock';

export const LEGACY_LIFETIME_PRODUCT_IDS = [
  DEFAULT_LEGACY_LIFETIME_PRODUCT_ID,
  'rc_promo_premium_lifetime',
] as const;

const LEGACY_LIFETIME_PRODUCT_ID_SET = new Set(
  LEGACY_LIFETIME_PRODUCT_IDS.map((productId) => productId.toLowerCase())
);

export const MONTHLY_SUBSCRIPTION_PRODUCT_ID = 'monthly_showseek_sub';
export const YEARLY_SUBSCRIPTION_PRODUCT_ID = 'showseek_yearly_sub';

export const PREMIUM_ENTITLEMENT_ID = 'premium';

export const isLegacyLifetimeProductId = (productId?: string | null): boolean => {
  if (!productId) {
    return false;
  }

  return LEGACY_LIFETIME_PRODUCT_ID_SET.has(productId.trim().toLowerCase());
};
