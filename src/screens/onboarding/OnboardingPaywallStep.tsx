import { legal } from '@/app/(auth)/legal';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { ACTIVE_OPACITY, COLORS, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { type PremiumPlan } from '@/src/context/premiumBilling';
import { usePremium } from '@/src/context/PremiumContext';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BadgeCheck, X } from 'lucide-react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface OnboardingPaywallStepProps {
  onClose: () => void;
}

export default function OnboardingPaywallStep({ onClose }: OnboardingPaywallStepProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const {
    isPremium,
    isLoading,
    monthlyTrial,
    purchasePremium,
    restorePurchases,
    prices,
  } = usePremium();
  const [selectedPlan, setSelectedPlan] = React.useState<PremiumPlan>('yearly');
  const [isRestoring, setIsRestoring] = React.useState(false);
  const wasPremiumRef = React.useRef(isPremium);

  const monthlyPrice = prices.monthly || t('premium.monthlyPriceFallback');
  const yearlyPrice = prices.yearly || t('premium.yearlyPriceFallback');
  const monthlyTrialNote =
    selectedPlan === 'monthly' && monthlyTrial.isEligible
      ? t('premium.freeTrialEligibleMessage')
      : null;

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

  return (
    <View style={styles.screen}>
      <Image
        source={require('@/assets/images/movie_collage.png')}
        style={[styles.backdropImage, styles.backdropImageInner]}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.68)', 'rgba(0,0,0,0.78)', 'rgba(0,0,0,1)', 'rgba(0,0,0,1)']}
        locations={[0, 0.12, 0.2, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.backdropOverlay}
      />

      <SafeAreaView style={styles.mainContent} edges={['top']}>
        <TouchableOpacity
          onPress={onClose}
          activeOpacity={ACTIVE_OPACITY}
          style={styles.closeButton}
          testID="onboarding-paywall-close-button"
        >
          <X size={22} color={COLORS.white} />
        </TouchableOpacity>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={[styles.premiumLabel, { color: accentColor }]}>ShowSeek Premium</Text>
            <Text style={styles.title}>{t('premium.unlockTitle')}</Text>
            <Text style={styles.subtitle}>{t('premium.unlockSubtitle')}</Text>
            {monthlyTrialNote ? (
              <Text style={styles.autoTrialNote} testID="billing-helper-text">
                {monthlyTrialNote}
              </Text>
            ) : null}
          </View>

          <View style={styles.planList}>
            <PlanOptionCard
              testID="onboarding-plan-monthly"
              planName={t('premium.monthlyPlanName')}
              planPrice={monthlyPrice}
              planPeriod={t('premium.perMonth')}
              badgeText={monthlyTrial.isEligible ? t('premium.trialBadge') : undefined}
              badgeTestID="onboarding-plan-monthly-badge"
              isSelected={selectedPlan === 'monthly'}
              accentColor={accentColor}
              onPress={() => setSelectedPlan('monthly')}
            />

            <PlanOptionCard
              testID="onboarding-plan-yearly"
              planName={t('premium.yearlyPlanName')}
              planPrice={yearlyPrice}
              planPeriod={t('premium.perYear')}
              badgeText={t('premium.bestValueBadge')}
              badgeTestID="onboarding-plan-yearly-badge"
              isSelected={selectedPlan === 'yearly'}
              accentColor={accentColor}
              onPress={() => setSelectedPlan('yearly')}
            />
          </View>
        </ScrollView>
      </SafeAreaView>

      <SafeAreaView style={styles.footerSafeArea} edges={['bottom']}>
        <View style={styles.footerContent}>
          <TouchableOpacity
            testID="onboarding-subscribe-button"
            style={[styles.button, { backgroundColor: accentColor }]}
            onPress={handlePurchase}
            activeOpacity={ACTIVE_OPACITY}
          >
            <Text style={styles.buttonText}>{t('premium.subscribeButton')}</Text>
          </TouchableOpacity>

          <View style={styles.legalLinks}>
            <TouchableOpacity onPress={() => Linking.openURL(legal.tos)}>
              <Text style={styles.legalLinkText}>{t('settings.terms')}</Text>
            </TouchableOpacity>
            <Text style={styles.legalDot}>•</Text>
            <TouchableOpacity
              onPress={handleRestore}
              disabled={isRestoring}
              style={isRestoring ? { opacity: ACTIVE_OPACITY } : undefined}
            >
              {isRestoring ? (
                <ActivityIndicator size="small" color={COLORS.textSecondary} />
              ) : (
                <Text style={styles.legalLinkText}>{t('common.restore')}</Text>
              )}
            </TouchableOpacity>
            <Text style={styles.legalDot}>•</Text>
            <TouchableOpacity onPress={() => Linking.openURL(legal.privacy)}>
              <Text style={styles.legalLinkText}>{t('settings.privacy')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function PlanOptionCard({
  accentColor,
  badgeText,
  badgeTestID,
  disabled,
  isSelected,
  onPress,
  planPeriod,
  planName,
  planPrice,
  secondaryPriceText,
  testID,
}: {
  accentColor: string;
  badgeText?: string;
  badgeTestID?: string;
  disabled?: boolean;
  isSelected: boolean;
  onPress: () => void;
  planPeriod?: string;
  planName: string;
  planPrice: string;
  secondaryPriceText?: string;
  testID: string;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      style={[
        styles.planCard,
        {
          borderColor: isSelected ? accentColor : COLORS.surfaceLight,
          backgroundColor: isSelected ? 'rgba(255,255,255,0.06)' : COLORS.surface,
        },
        disabled && { opacity: 0.4 },
      ]}
      activeOpacity={ACTIVE_OPACITY}
      onPress={onPress}
      disabled={disabled}
    >
      <View style={styles.planHeaderRow}>
        <View style={styles.planNameRow}>
          {isSelected ? (
            <BadgeCheck size={18} color={accentColor} />
          ) : (
            <View style={styles.checkIconPlaceholder} />
          )}
          <Text style={styles.planName}>{planName}</Text>
        </View>
        {secondaryPriceText ? (
          <View style={styles.planPriceContainer}>
            <Text style={[styles.planPriceInline, { color: accentColor }]}>{planPrice}</Text>
            <Text style={styles.planPriceSecondary}>{secondaryPriceText}</Text>
          </View>
        ) : (
          <Text style={[styles.planPriceInline, { color: accentColor }]}>
            {planPrice} {planPeriod}
          </Text>
        )}
      </View>
      {badgeText ? (
        <View style={[styles.badge, { backgroundColor: accentColor }]}>
          <Text testID={badgeTestID} style={styles.badgeText}>
            {badgeText}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  backdropImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '35%',
  },
  backdropImageInner: {
    opacity: 0.75,
    transform: [{ scale: 1.22 }],
  },
  backdropOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  mainContent: {
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    right: SPACING.l,
    top: SPACING.s,
    zIndex: 10,
    padding: SPACING.s,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: SPACING.l,
    paddingBottom: 40,
  },
  header: {
    width: '100%',
    marginBottom: SPACING.xl,
  },
  premiumLabel: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: SPACING.s,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'left',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'left',
  },
  autoTrialNote: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: SPACING.s,
  },
  planList: {
    width: '100%',
    marginBottom: SPACING.l,
    gap: SPACING.l,
  },
  planCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: SPACING.l,
    overflow: 'visible',
  },
  planHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
    flexShrink: 1,
  },
  checkIconPlaceholder: {
    width: 18,
    height: 18,
  },
  planName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  planPriceInline: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'right',
  },
  planPriceContainer: {
    alignItems: 'flex-end',
  },
  planPriceSecondary: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'right',
    marginTop: 2,
  },
  badge: {
    position: 'absolute',
    top: -10,
    right: 12,
    borderRadius: 999,
    paddingHorizontal: SPACING.s,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    color: COLORS.white,
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
  footerSafeArea: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(0,0,0,0.82)',
    paddingHorizontal: 24,
    paddingTop: SPACING.m,
  },
  footerContent: {
    paddingBottom: SPACING.s,
  },
  legalLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.m,
    gap: SPACING.s,
  },
  legalLinkText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  legalDot: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
});
