import { legal } from '@/app/(auth)/legal';
import {
  CollapsibleCategory,
  CollapsibleFeatureItem,
} from '@/src/components/ui/CollapsibleCategory';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { PREMIUM_CATEGORIES, PremiumCategory } from '@/src/constants/premiumFeatures';
import { ACTIVE_OPACITY, COLORS, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { type PremiumPlan } from '@/src/context/premiumBilling';
import { usePremium } from '@/src/context/PremiumContext';
import { screenStyles } from '@/src/styles/screenStyles';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { BadgeCheck } from 'lucide-react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PremiumScreen() {
  const {
    isPremium,
    isLoading,
    purchasePremium,
    restorePurchases,
    resetTestPurchase,
    prices,
    monthlyTrial,
  } = usePremium();
  const router = useRouter();
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const [isRestoring, setIsRestoring] = React.useState(false);
  const [selectedPlan, setSelectedPlan] = React.useState<PremiumPlan>('yearly');
  const [useFreeTrial, setUseFreeTrial] = React.useState(false);
  const [trialInlineMessageKey, setTrialInlineMessageKey] = React.useState<string | null>(null);
  const wasPremiumRef = React.useRef(isPremium);

  const monthlyPrice = prices.monthly || t('premium.monthlyPriceFallback');
  const yearlyPrice = prices.yearly || t('premium.yearlyPriceFallback');
  const isMonthlySelected = selectedPlan === 'monthly';
  const isTrialToggleEnabled = monthlyTrial.isEligible;
  const isMonthlyTrialDisplayActive = useFreeTrial && isTrialToggleEnabled;
  const monthlyPlanHeadline = isMonthlyTrialDisplayActive ? 'One Week Free' : monthlyPrice;
  const monthlyPlanPeriod = isMonthlyTrialDisplayActive ? undefined : t('premium.perMonth');
  const monthlyPlanSecondaryPrice = isMonthlyTrialDisplayActive
    ? `then ${monthlyPrice} ${t('premium.perMonth')}`
    : undefined;
  const trialStatusMessageKey = trialInlineMessageKey ?? monthlyTrial.reasonKey;

  // Watch for premium status change to show success
  React.useEffect(() => {
    if (!wasPremiumRef.current && isPremium) {
      Alert.alert(t('premium.successTitle'), t('premium.successMessage'), [
        { text: t('common.ok'), onPress: () => router.back() },
      ]);
    }
    wasPremiumRef.current = isPremium;
  }, [isPremium, router, t]);

  React.useEffect(() => {
    if (!monthlyTrial.isEligible && useFreeTrial) {
      setUseFreeTrial(false);
    }
  }, [monthlyTrial.isEligible, useFreeTrial]);

  const handlePurchase = async () => {
    try {
      setTrialInlineMessageKey(null);
      await purchasePremium(selectedPlan, {
        useTrial: selectedPlan === 'monthly' && useFreeTrial,
      });
      // Success is handled by the listener updating isPremium state
    } catch (error: any) {
      // Only show error for real errors, not cancellations
      const code = String(error?.code || '').toLowerCase();
      const message = String(error?.message || '').toLowerCase();
      const isTrialIneligible = code === 'trial_ineligible';
      const isUserCanceled =
        code === 'e_user_cancelled' ||
        code === 'user-cancelled' ||
        message === 'user canceled' ||
        message.includes('user cancelled');

      if (isTrialIneligible) {
        const reasonKey =
          typeof error?.reasonKey === 'string'
            ? error.reasonKey
            : 'premium.freeTrialRejectedMessage';
        setUseFreeTrial(false);
        setTrialInlineMessageKey(reasonKey);
        return;
      }

      if (!isUserCanceled) {
        Alert.alert(t('premium.purchaseFailedTitle'), error.message || t('errors.generic'));
      }
    }
  };

  const handleTrialToggle = (nextValue: boolean) => {
    if (!isTrialToggleEnabled) {
      setUseFreeTrial(false);
      return;
    }

    if (nextValue && !isMonthlySelected) {
      setSelectedPlan('monthly');
    }

    setUseFreeTrial(nextValue);

    if (!nextValue) {
      setTrialInlineMessageKey(null);
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
      Alert.alert(t('premium.restoreFailedTitle'), error.message);
    } finally {
      setIsRestoring(false);
    }
  };

  if (isLoading) {
    return <FullScreenLoading />;
  }

  // If already premium, show status
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
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={[styles.premiumLabel, { color: accentColor }]}>ShowSeek Premium</Text>
            <Text style={styles.title}>{t('premium.unlockTitle')}</Text>
            <Text style={styles.subtitle}>{t('premium.unlockSubtitle')}</Text>
          </View>

          <TouchableOpacity
            activeOpacity={ACTIVE_OPACITY}
            style={styles.trialContainer}
            onPress={() => handleTrialToggle(!(useFreeTrial && isTrialToggleEnabled))}
            disabled={!isTrialToggleEnabled}
          >
            <View style={styles.trialRow}>
              <Text style={styles.trialLabel}>{t('premium.freeTrialToggleLabel')}</Text>
              <Switch
                testID="free-trial-toggle"
                value={useFreeTrial && isTrialToggleEnabled}
                onValueChange={handleTrialToggle}
                disabled={!isTrialToggleEnabled}
                trackColor={{
                  false: COLORS.surfaceLight,
                  true: accentColor,
                }}
                thumbColor={COLORS.white}
              />
            </View>

            {useFreeTrial && isTrialToggleEnabled ? (
              <Text testID="free-trial-helper-text" style={styles.trialHelperText}>
                {t('premium.freeTrialHelperText')}
              </Text>
            ) : null}

            {trialStatusMessageKey ? (
              <Text testID="free-trial-inline-message" style={styles.trialInlineMessage}>
                {t(trialStatusMessageKey)}
              </Text>
            ) : null}
          </TouchableOpacity>

          <View style={styles.planList}>
            <PlanOptionCard
              testID="plan-monthly"
              planName={t('premium.monthlyPlanName')}
              planPrice={monthlyPlanHeadline}
              planPeriod={monthlyPlanPeriod}
              secondaryPriceText={monthlyPlanSecondaryPrice}
              isSelected={selectedPlan === 'monthly'}
              accentColor={accentColor}
              onPress={() => setSelectedPlan('monthly')}
            />

            <PlanOptionCard
              testID="plan-yearly"
              planName={t('premium.yearlyPlanName')}
              planPrice={yearlyPrice}
              planPeriod={t('premium.perYear')}
              badgeText={t('premium.bestValueBadge')}
              isSelected={selectedPlan === 'yearly'}
              accentColor={accentColor}
              onPress={() => setSelectedPlan('yearly')}
              disabled={useFreeTrial && isTrialToggleEnabled}
            />
          </View>

          <Text style={styles.featuresTitle}>{t('premium.whatsIncluded')}</Text>
          <View style={styles.features}>
            {PREMIUM_CATEGORIES.map((category, index) => (
              <FeatureCategorySection
                key={category.id}
                category={category}
                defaultExpanded={index === 0}
              />
            ))}
          </View>

          <View style={styles.legalLinks}>
            <TouchableOpacity onPress={() => Linking.openURL(legal.tos)}>
              <Text style={styles.legalLinkText}>{t('settings.terms')}</Text>
            </TouchableOpacity>
            <Text style={styles.legalDot}>•</Text>
            <TouchableOpacity onPress={() => Linking.openURL(legal.privacy)}>
              <Text style={styles.legalLinkText}>{t('settings.privacy')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>

      <SafeAreaView style={styles.footerSafeArea} edges={['bottom']}>
        <View style={styles.footerContent}>
          <TouchableOpacity
            testID="subscribe-button"
            style={[styles.button, { backgroundColor: accentColor }]}
            onPress={handlePurchase}
            activeOpacity={ACTIVE_OPACITY}
          >
            <Text style={styles.buttonText}>{t('premium.subscribeButton')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.restoreButton, isRestoring && { opacity: ACTIVE_OPACITY }]}
            onPress={handleRestore}
            disabled={isRestoring}
          >
            {isRestoring ? (
              <ActivityIndicator size="small" color={COLORS.text} />
            ) : (
              <Text style={styles.restoreButtonText}>{t('premium.restorePurchases')}</Text>
            )}
          </TouchableOpacity>

          {/* DEV ONLY: Reset purchase button for testing */}
          {__DEV__ && (
            <TouchableOpacity
              style={[styles.restoreButton, { marginTop: 10, opacity: ACTIVE_OPACITY }]}
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
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

/**
 * Collapsible category section showing a group of premium features
 */
function FeatureCategorySection({
  category,
  defaultExpanded = false,
}: {
  category: PremiumCategory;
  defaultExpanded?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <CollapsibleCategory title={t(category.titleKey)} defaultExpanded={defaultExpanded}>
      {category.features.map((feature) => (
        <CollapsibleFeatureItem
          key={feature.id}
          text={t(feature.titleKey)}
          icon={feature.icon}
          description={feature.descriptionKey ? t(feature.descriptionKey) : undefined}
          isNew={feature.isNew}
        />
      ))}
    </CollapsibleCategory>
  );
}

function PlanOptionCard({
  accentColor,
  badgeText,
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
          <Text testID="plan-yearly-badge" style={styles.badgeText}>
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
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: SPACING.l,
    paddingBottom: 50,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
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
  description: {
    fontSize: 18,
    color: COLORS.text,
    textAlign: 'center',
    marginTop: SPACING.m,
    marginBottom: SPACING.xl,
  },
  features: {
    width: '100%',
    marginBottom: SPACING.xl,
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    color: COLORS.text,
    marginBottom: SPACING.m,
  },
  planList: {
    width: '100%',
    marginBottom: SPACING.l,
    gap: SPACING.l,
  },
  trialContainer: {
    width: '100%',
    marginBottom: SPACING.l,
    padding: SPACING.m,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    backgroundColor: 'rgba(255,255,255,0.04)',
    gap: SPACING.s,
  },
  trialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.s,
  },
  trialLabel: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 1,
  },
  trialHelperText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  trialInlineMessage: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
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
  restoreButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  restoreButtonText: {
    color: COLORS.textSecondary,
    fontSize: 16,
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
  },
  legalLinkText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  legalDot: {
    color: COLORS.textSecondary,
    marginHorizontal: SPACING.s,
    fontSize: 14,
  },
});
