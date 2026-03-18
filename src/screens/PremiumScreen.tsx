import {
  PremiumFeaturesSection,
  PremiumPaywallFooter,
  PremiumPaywallScreenShell,
  type PremiumPaywallPlanOption,
} from '@/src/components/premium/PremiumPaywallLayout';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { COLORS, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useAuth } from '@/src/context/auth';
import { type PremiumPlan } from '@/src/context/premiumBilling';
import { usePremium } from '@/src/context/PremiumContext';
import { trackPremiumPaywallView } from '@/src/services/analytics';
import { screenStyles } from '@/src/styles/screenStyles';
import { resolvePreferredDisplayName } from '@/src/utils/userUtils';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Purchases from 'react-native-purchases';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PremiumScreen() {
  const {
    isPremium,
    isLoading,
    monthlyTrial,
    purchasePremium,
    restorePurchases,
    resetTestPurchase,
    prices,
  } = usePremium();
  const router = useRouter();
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const { user } = useAuth();
  const [isRestoring, setIsRestoring] = React.useState(false);
  const [selectedPlan, setSelectedPlan] = React.useState<PremiumPlan>('yearly');
  const wasPremiumRef = React.useRef(isPremium);

  React.useEffect(() => {
    if (!isLoading && !isPremium) {
      void trackPremiumPaywallView();
    }
  }, [isLoading, isPremium]);

  const monthlyPrice = prices.monthly || t('premium.monthlyPriceFallback');
  const yearlyPrice = prices.yearly || t('premium.yearlyPriceFallback');
  const monthlyTrialNote =
    selectedPlan === 'monthly' && monthlyTrial.isEligible
      ? t('premium.freeTrialEligibleMessage')
      : null;
  const resolvedDisplayName = resolvePreferredDisplayName(user?.displayName, null, user?.email);
  const readyTitle = resolvedDisplayName
    ? t('premium.readyTitle', { name: resolvedDisplayName })
    : t('premium.readyTitleFallback');

  React.useEffect(() => {
    if (!wasPremiumRef.current && isPremium) {
      Alert.alert(t('premium.successTitle'), t('premium.successMessage'), [
        { text: t('common.ok'), onPress: () => router.back() },
      ]);
    }
    wasPremiumRef.current = isPremium;
  }, [isPremium, router, t]);

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

  const testOfferings = async () => {
    try {
      const offerings = await Purchases.getOfferings();
      const premiumPackageCount = offerings.all.Premium?.availablePackages?.length ?? 0;
      Alert.alert('Offerings', JSON.stringify(premiumPackageCount));
    } catch (error) {
      console.error('[RevenueCat Debug] Test fetch failed:', error);
      Alert.alert('Error', String(error));
    }
  };

  if (isLoading) {
    return <FullScreenLoading />;
  }

  if (isPremium) {
    return (
      <SafeAreaView style={screenStyles.container}>
        <View style={styles.content}>
          <Ionicons name="checkmark-circle" size={80} color={accentColor} />
          <Text style={styles.title}>{t('premium.alreadyPremiumTitle')}</Text>
          <Text style={styles.description}>{t('premium.alreadyPremiumDescription')}</Text>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: accentColor }]}
            onPress={() => router.back()}
          >
            <Text style={styles.buttonText}>{t('common.goBack')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const plans: PremiumPaywallPlanOption[] = [
    {
      testID: 'plan-monthly',
      badgeTestID: 'plan-monthly-badge',
      badgeText: monthlyTrial.isEligible ? t('premium.trialBadge') : undefined,
      isSelected: selectedPlan === 'monthly',
      onPress: () => setSelectedPlan('monthly'),
      planName: t('premium.monthlyPlanName'),
      planPeriod: t('premium.perMonth'),
      planPrice: monthlyPrice,
    },
    {
      testID: 'plan-yearly',
      badgeTestID: 'plan-yearly-badge',
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
      closeButtonTestID="premium-close-button"
      footer={
        <PremiumPaywallFooter
          accentColor={accentColor}
          footerExtras={
            __DEV__ ? (
              <View>
                <TouchableOpacity
                  testID="test-offerings-button"
                  style={[styles.restoreButton, { marginTop: 10, opacity: 0.9 }]}
                  onPress={() => {
                    void testOfferings();
                  }}
                >
                  <Text style={styles.restoreButtonText}>Test Offerings (Dev)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.restoreButton, { marginTop: 10, opacity: 0.9 }]}
                  onPress={async () => {
                    Alert.alert(t('premium.devResetTitle'), t('premium.devResetMessage'), [
                      { text: t('common.cancel'), style: 'cancel' },
                      {
                        text: t('common.reset'),
                        style: 'destructive',
                        onPress: async () => {
                          if (resetTestPurchase) await resetTestPurchase();
                        },
                      },
                    ]);
                  }}
                >
                  <Text style={styles.restoreButtonText}>{t('premium.devResetButton')}</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          isRestoring={isRestoring}
          monthlyTrialNote={monthlyTrialNote}
          onRestore={handleRestore}
          onSubscribe={handlePurchase}
          plans={plans}
          subscribeButtonLabel={t('premium.subscribeButton')}
          subscribeButtonTestID="subscribe-button"
        />
      }
      onClose={() => router.back()}
      subtitle={t('premium.unlockSubtitle')}
      title={readyTitle}
    >
      <PremiumFeaturesSection />
    </PremiumPaywallScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginTop: SPACING.m,
    marginBottom: 8,
  },
  description: {
    fontSize: 18,
    color: COLORS.text,
    textAlign: 'center',
    marginTop: SPACING.m,
    marginBottom: SPACING.xl,
  },
  button: {
    width: '100%',
    paddingVertical: SPACING.m,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: COLORS.black,
    fontSize: 18,
    fontWeight: 'bold',
  },
  restoreButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  restoreButtonText: {
    color: COLORS.textSecondary,
    fontSize: 16,
  },
});
