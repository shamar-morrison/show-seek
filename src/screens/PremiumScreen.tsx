import { legal } from '@/app/(auth)/legal';
import {
  CollapsibleCategory,
  CollapsibleFeatureItem,
} from '@/src/components/ui/CollapsibleCategory';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { PREMIUM_CATEGORIES, PremiumCategory } from '@/src/constants/premiumFeatures';
import { ACTIVE_OPACITY, COLORS, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { usePremium } from '@/src/context/PremiumContext';
import { screenStyles } from '@/src/styles/screenStyles';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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

export default function PremiumScreen() {
  const { isPremium, isLoading, purchasePremium, restorePurchases, resetTestPurchase, price } =
    usePremium();
  const router = useRouter();
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const [isRestoring, setIsRestoring] = React.useState(false);
  const wasPremiumRef = React.useRef(isPremium);

  // Watch for premium status change to show success
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
      await purchasePremium();
      // Success is handled by the listener updating isPremium state
    } catch (error: any) {
      // Only show error for real errors, not cancellations
      if (error.code !== 'E_USER_CANCELLED' && error.message !== 'User canceled') {
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
    <SafeAreaView style={screenStyles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Ionicons name="star" size={60} color={accentColor} />
          <Text style={styles.title}>{t('premium.unlockTitle')}</Text>
          <Text style={styles.subtitle}>{t('premium.unlockSubtitle')}</Text>
        </View>

        <View style={styles.features}>
          {PREMIUM_CATEGORIES.map((category, index) => (
            <FeatureCategorySection
              key={category.id}
              category={category}
              defaultExpanded={index === 0}
            />
          ))}
        </View>

        <View style={styles.pricing}>
          <Text style={[styles.price, { color: accentColor }]}>{price || 'US$30.00'}</Text>
          <Text style={styles.paymentType}>{t('premium.oneTimePayment')}</Text>
        </View>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: accentColor }]}
          onPress={handlePurchase}
          activeOpacity={ACTIVE_OPACITY}
        >
          <Text style={styles.buttonText}>{t('premium.unlockButton')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.restoreButton, isRestoring && { opacity: ACTIVE_OPACITY }]}
          onPress={handleRestore}
          disabled={isRestoring}
        >
          {isRestoring ? (
            <ActivityIndicator size="small" color={COLORS.text} />
          ) : (
            <Text style={styles.restoreButtonText}>{t('premium.restorePurchase')}</Text>
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

const styles = StyleSheet.create({
  scrollContent: {
    padding: 24,
    alignItems: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: SPACING.m,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
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
  // Category styles
  // Pricing & buttons
  pricing: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  price: {
    fontSize: SPACING.xl,
    fontWeight: 'bold',
  },
  paymentType: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  button: {
    width: '100%',
    paddingVertical: SPACING.m,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: SPACING.m,
  },
  buttonText: {
    color: COLORS.black,
    fontSize: 18,
    fontWeight: 'bold',
  },
  restoreButton: {
    paddingVertical: 12,
  },
  restoreButtonText: {
    color: COLORS.textSecondary,
    fontSize: 16,
  },
  legalLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xl,
    marginTop: SPACING.m,
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
