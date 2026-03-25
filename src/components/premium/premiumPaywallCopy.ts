import {
  getPremiumBillingPeriodLabelTranslationKey,
  getPremiumBillingPeriodTranslationKey,
  type PremiumPlan,
  type PremiumPlanBillingDetails,
} from '@/src/context/premiumBilling';
import { type TFunction } from 'i18next';

interface ResolvePremiumBillingDisclosureArgs {
  billingDetails: PremiumPlanBillingDetails;
  fallbackPrice: string;
  isMonthlyTrialEligible: boolean;
  plan: PremiumPlan;
  t: TFunction;
}

const formatBillingPeriod = (
  t: TFunction,
  period: PremiumPlanBillingDetails['recurringPeriod']
): string =>
  period.value === 1
    ? t(getPremiumBillingPeriodLabelTranslationKey(period.unit))
    : t(getPremiumBillingPeriodTranslationKey(period.unit), { count: period.value });

export const resolvePremiumBillingDisclosure = ({
  billingDetails,
  fallbackPrice,
  isMonthlyTrialEligible,
  plan,
  t,
}: ResolvePremiumBillingDisclosureArgs): string => {
  const recurringPrice = billingDetails.recurringPrice ?? fallbackPrice;
  const recurringPeriod = formatBillingPeriod(t, billingDetails.recurringPeriod);
  const storeName = t(billingDetails.storeLabelKey);

  if (plan === 'monthly' && isMonthlyTrialEligible && billingDetails.trialPeriod) {
    return t('premium.monthlyTrialEligibleHelperText', {
      period: recurringPeriod,
      price: recurringPrice,
      storeName,
      trialPeriod: formatBillingPeriod(t, billingDetails.trialPeriod),
    });
  }

  if (plan === 'monthly') {
    return t('premium.monthlyNoTrialHelperText', {
      period: recurringPeriod,
      price: recurringPrice,
      storeName,
    });
  }

  return t('premium.yearlyPlanHelperText', {
    period: recurringPeriod,
    price: recurringPrice,
    storeName,
  });
};
