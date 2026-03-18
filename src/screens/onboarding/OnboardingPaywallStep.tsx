import {
  PremiumFeaturesSection,
  PremiumPaywallFooter,
  PremiumPaywallScreenShell,
  type PremiumPaywallPlanOption,
} from '@/src/components/premium/PremiumPaywallLayout';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { type PremiumPlan } from '@/src/context/premiumBilling';
import { usePremium } from '@/src/context/PremiumContext';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

interface OnboardingPaywallStepProps {
  displayName: string;
  onClose: () => void;
}

export default function OnboardingPaywallStep({
  displayName,
  onClose,
}: OnboardingPaywallStepProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const { isPremium, isLoading, monthlyTrial, purchasePremium, restorePurchases, prices } =
    usePremium();
  const [selectedPlan, setSelectedPlan] = React.useState<PremiumPlan>('yearly');
  const [isRestoring, setIsRestoring] = React.useState(false);
  const wasPremiumRef = React.useRef(isPremium);

  const monthlyPrice = prices.monthly || t('premium.monthlyPriceFallback');
  const yearlyPrice = prices.yearly || t('premium.yearlyPriceFallback');
  const monthlyTrialNote =
    selectedPlan === 'monthly' && monthlyTrial.isEligible
      ? t('premium.freeTrialEligibleMessage')
      : null;
  const trimmedDisplayName = displayName.trim();
  const readyTitle = trimmedDisplayName
    ? t('premium.readyTitle', { name: trimmedDisplayName })
    : t('premium.readyTitleFallback');

  React.useEffect(() => {
    if (!wasPremiumRef.current && isPremium) {
      Alert.alert(t('premium.successTitle'), t('premium.successMessage'), [
        { text: t('common.ok'), onPress: onClose },
      ]);
    }
    wasPremiumRef.current = isPremium;
  }, [isPremium, onClose, t]);

  const handlePurchase = async () => {
    try {
      await purchasePremium(selectedPlan);
    } catch (error: any) {
      const code = String(error?.code || '').toLowerCase();
      const message = String(error?.message || '').toLowerCase();
      const isUserCanceled =
        code === 'e_user_cancelled' ||
        code === 'user-cancelled' ||
        message === 'user canceled' ||
        message.includes('user cancelled');

      if (!isUserCanceled) {
        Alert.alert(t('premium.purchaseFailedTitle'), error.message || t('errors.generic'));
      }
    }
  };

  const handleRestore = async () => {
    if (isRestoring) return;

    setIsRestoring(true);
    try {
      const restored = await restorePurchases();
      if (restored) {
        Alert.alert(t('premium.restoreCompleteTitle'), t('premium.restoreCompleteMessage'));
      } else {
        Alert.alert(t('premium.noPurchasesTitle'), t('premium.noPurchasesMessage'));
      }
    } catch (error: any) {
      Alert.alert(t('premium.restoreFailedTitle'), error?.message || t('errors.generic'));
    } finally {
      setIsRestoring(false);
    }
  };

  if (isLoading) {
    return <FullScreenLoading />;
  }

  const plans: PremiumPaywallPlanOption[] = [
    {
      testID: 'onboarding-plan-monthly',
      badgeTestID: 'onboarding-plan-monthly-badge',
      badgeText: monthlyTrial.isEligible ? t('premium.trialBadge') : undefined,
      isSelected: selectedPlan === 'monthly',
      onPress: () => setSelectedPlan('monthly'),
      planName: t('premium.monthlyPlanName'),
      planPeriod: t('premium.perMonth'),
      planPrice: monthlyPrice,
    },
    {
      testID: 'onboarding-plan-yearly',
      badgeTestID: 'onboarding-plan-yearly-badge',
      badgeText: t('premium.bestValueBadge'),
      isSelected: selectedPlan === 'yearly',
      onPress: () => setSelectedPlan('yearly'),
      planName: t('premium.yearlyPlanName'),
      planPeriod: t('premium.perYear'),
      planPrice: yearlyPrice,
    },
  ];

  return (
    <PremiumPaywallScreenShell
      closeButtonTestID="onboarding-paywall-close-button"
      closeButtonFadeDurationMs={450}
      closeButtonRevealDelayMs={3000}
      footer={
        <PremiumPaywallFooter
          accentColor={accentColor}
          isRestoring={isRestoring}
          monthlyTrialNote={monthlyTrialNote}
          onRestore={handleRestore}
          onSubscribe={handlePurchase}
          plans={plans}
          subscribeButtonLabel={t('premium.subscribeButton')}
          subscribeButtonTestID="onboarding-subscribe-button"
        />
      }
      onClose={onClose}
      subtitle={t('premium.onboardingUnlockSubtitle')}
      title={readyTitle}
    >
      <PremiumFeaturesSection />
    </PremiumPaywallScreenShell>
  );
}
