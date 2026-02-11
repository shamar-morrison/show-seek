export type PremiumPlan = 'monthly' | 'yearly';
export type PremiumPurchaseType = 'in-app' | 'subs';

export const LEGACY_LIFETIME_PRODUCT_ID = 'premium_unlock';

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
