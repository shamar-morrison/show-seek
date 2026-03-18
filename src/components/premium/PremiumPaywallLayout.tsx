import { legal } from '@/app/(auth)/legal';
import {
  CollapsibleCategory,
  CollapsibleFeatureItem,
} from '@/src/components/ui/CollapsibleCategory';
import { PREMIUM_CATEGORIES, type PremiumCategory } from '@/src/constants/premiumFeatures';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BadgeCheck, X } from 'lucide-react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Animated,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export interface PremiumPaywallPlanOption {
  testID: string;
  badgeTestID?: string;
  badgeText?: string;
  disabled?: boolean;
  isSelected: boolean;
  onPress: () => void;
  planName: string;
  planPeriod?: string;
  planPrice: string;
  secondaryPriceText?: string;
}

interface PremiumPaywallScreenShellProps {
  children: React.ReactNode;
  closeButtonTestID: string;
  closeButtonFadeDurationMs?: number;
  closeButtonRevealDelayMs?: number;
  footer: React.ReactNode;
  onClose: () => void;
  subtitle: string;
  title: string;
  contentBottomPadding?: number;
}

interface PremiumPaywallFooterProps {
  accentColor: string;
  isRestoring: boolean;
  monthlyTrialNote?: string | null;
  onRestore: () => void;
  onSubscribe: () => void;
  plans: PremiumPaywallPlanOption[];
  footerExtras?: React.ReactNode;
  subscribeButtonLabel: string;
  subscribeButtonTestID: string;
}

interface PremiumFeaturesSectionProps {
  categories?: PremiumCategory[];
}

export function PremiumPaywallScreenShell({
  children,
  closeButtonTestID,
  closeButtonFadeDurationMs = 0,
  closeButtonRevealDelayMs = 0,
  contentBottomPadding = SPACING.xl,
  footer,
  onClose,
  subtitle,
  title,
}: PremiumPaywallScreenShellProps) {
  const closeButtonOpacity = React.useRef(
    new Animated.Value(closeButtonRevealDelayMs > 0 ? 0 : 1)
  ).current;
  const [isCloseButtonInteractive, setIsCloseButtonInteractive] = React.useState(
    closeButtonRevealDelayMs <= 0
  );

  React.useEffect(() => {
    if (closeButtonRevealDelayMs <= 0) {
      closeButtonOpacity.setValue(1);
      setIsCloseButtonInteractive(true);
      return;
    }

    closeButtonOpacity.setValue(0);
    setIsCloseButtonInteractive(false);

    const timer = setTimeout(() => {
      setIsCloseButtonInteractive(true);

      if (closeButtonFadeDurationMs <= 0) {
        closeButtonOpacity.setValue(1);
        return;
      }

      Animated.timing(closeButtonOpacity, {
        toValue: 1,
        duration: closeButtonFadeDurationMs,
        useNativeDriver: true,
      }).start();
    }, closeButtonRevealDelayMs);

    return () => {
      clearTimeout(timer);
      if (typeof closeButtonOpacity.stopAnimation === 'function') {
        closeButtonOpacity.stopAnimation();
      }
    };
  }, [closeButtonFadeDurationMs, closeButtonOpacity, closeButtonRevealDelayMs]);

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
        <Animated.View style={[styles.closeButtonWrapper, { opacity: closeButtonOpacity }]}>
          <TouchableOpacity
            onPress={isCloseButtonInteractive ? onClose : undefined}
            activeOpacity={ACTIVE_OPACITY}
            disabled={!isCloseButtonInteractive}
            style={styles.closeButton}
            testID={closeButtonTestID}
          >
            <X size={22} color={COLORS.white} />
          </TouchableOpacity>
        </Animated.View>

        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}
        >
          <View style={styles.hero}>
            <View style={styles.logoContainer}>
              <Image
                source={require('@/assets/images/icon.png')}
                style={styles.logo}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            </View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>

          {children}
        </ScrollView>
      </SafeAreaView>

      <SafeAreaView style={styles.footerSafeArea} edges={['bottom']}>
        <View style={styles.footerContent} testID="premium-footer">
          {footer}
        </View>
      </SafeAreaView>
    </View>
  );
}

export function PremiumPaywallFooter({
  accentColor,
  footerExtras,
  isRestoring,
  monthlyTrialNote,
  onRestore,
  onSubscribe,
  plans,
  subscribeButtonLabel,
  subscribeButtonTestID,
}: PremiumPaywallFooterProps) {
  const { t } = useTranslation();

  return (
    <>
      {monthlyTrialNote ? (
        <Text style={styles.trialNote} testID="billing-helper-text">
          {monthlyTrialNote}
        </Text>
      ) : null}

      <View style={styles.planList} testID="premium-plan-list">
        {plans.map((plan) => (
          <PremiumPlanOptionCard key={plan.testID} accentColor={accentColor} {...plan} />
        ))}
      </View>

      <TouchableOpacity
        testID={subscribeButtonTestID}
        style={[styles.button, { backgroundColor: accentColor }]}
        onPress={onSubscribe}
        activeOpacity={ACTIVE_OPACITY}
      >
        <Text style={styles.buttonText}>{subscribeButtonLabel}</Text>
      </TouchableOpacity>

      <View style={styles.legalLinks}>
        <TouchableOpacity onPress={() => Linking.openURL(legal.tos)}>
          <Text style={styles.legalLinkText}>{t('settings.terms')}</Text>
        </TouchableOpacity>
        <Text style={styles.legalDot}>•</Text>
        <TouchableOpacity
          onPress={onRestore}
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

      {footerExtras ? <View style={styles.footerExtras}>{footerExtras}</View> : null}
    </>
  );
}

export function PremiumFeaturesSection({
  categories = PREMIUM_CATEGORIES,
}: PremiumFeaturesSectionProps) {
  const { t } = useTranslation();

  const orderedCategories = React.useMemo(
    () =>
      [...categories].sort((a, b) => {
        if (a.id === 'lists') return 1;
        if (b.id === 'lists') return -1;
        return 0;
      }),
    [categories]
  );

  return (
    <View style={styles.featuresSection} testID="premium-features-section">
      <Text style={styles.featuresTitle}>{t('premium.whatsIncluded')}</Text>
      <View style={styles.featuresList}>
        {orderedCategories.map((category) => (
          <PremiumFeatureCategorySection key={category.id} category={category} />
        ))}
      </View>
    </View>
  );
}

function PremiumFeatureCategorySection({ category }: { category: PremiumCategory }) {
  const { t } = useTranslation();

  return (
    <CollapsibleCategory
      testID={`premium-category-${category.id}`}
      title={t(category.titleKey)}
      defaultExpanded
    >
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

function PremiumPlanOptionCard({
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
}: PremiumPaywallPlanOption & { accentColor: string }) {
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
  closeButtonWrapper: {
    position: 'absolute',
    right: SPACING.l,
    top: SPACING.xxl,
    zIndex: 10,
  },
  closeButton: {
    padding: SPACING.s,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: SPACING.xl,
  },
  hero: {
    width: '100%',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  logoContainer: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    marginBottom: SPACING.m,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.s,
    lineHeight: 22,
  },
  featuresSection: {
    width: '100%',
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    color: COLORS.text,
    marginBottom: SPACING.m,
  },
  featuresList: {
    width: '100%',
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
  trialNote: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: SPACING.s,
  },
  planList: {
    width: '100%',
    marginBottom: SPACING.l,
    gap: SPACING.l,
  },
  planCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: SPACING.l,
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
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: COLORS.black,
    fontSize: 18,
    fontWeight: 'bold',
  },
  legalLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.m,
  },
  legalLinkText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  legalDot: {
    color: COLORS.textSecondary,
    marginHorizontal: SPACING.s,
    fontSize: 14,
  },
  footerExtras: {
    marginTop: SPACING.s,
  },
});
