import {
  CollapsibleCategory,
  CollapsibleFeatureItem,
} from '@/src/components/ui/CollapsibleCategory';
import { PREMIUM_CATEGORIES, PremiumCategory } from '@/src/constants/premiumFeatures';
import { ACTIVE_OPACITY, COLORS, SPACING } from '@/src/constants/theme';
import { usePremium } from '@/src/context/PremiumContext';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
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
  const [isRestoring, setIsRestoring] = React.useState(false);

  // Watch for premium status change to show success
  React.useEffect(() => {
    if (isPremium) {
      Alert.alert('Success', 'You are now a Premium member!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    }
  }, [isPremium]);

  const handlePurchase = async () => {
    try {
      await purchasePremium();
      // Success is handled by the listener updating isPremium state
    } catch (error: any) {
      // Only show error for real errors, not cancellations
      if (error.code !== 'E_USER_CANCELLED' && error.message !== 'User canceled') {
        Alert.alert('Purchase Failed', error.message || 'Something went wrong');
      }
    }
  };

  const handleRestore = async () => {
    if (isRestoring) return;

    setIsRestoring(true);
    try {
      const restored = await restorePurchases();
      if (restored) {
        Alert.alert('Restore Complete', 'Purchases have been restored.');
      } else {
        Alert.alert('No Purchases', 'No premium purchase history found.');
      }
    } catch (error: any) {
      Alert.alert('Restore Failed', error.message);
    } finally {
      setIsRestoring(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // If already premium, show status
  if (isPremium) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Ionicons name="checkmark-circle" size={80} color={COLORS.primary} />
          <Text style={styles.title}>You are Premium!</Text>
          <Text style={styles.description}>Thank you for supporting the app.</Text>
          <TouchableOpacity style={styles.button} onPress={() => router.back()}>
            <Text style={styles.buttonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Ionicons name="star" size={60} color={COLORS.primary} />
          <Text style={styles.title}>Unlock Premium</Text>
          <Text style={styles.subtitle}>Get the most out of your tracking experience</Text>
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
          <Text style={styles.price}>{price || 'US$10.00'}</Text>
          <Text style={styles.paymentType}>One-time payment</Text>
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={handlePurchase}
          activeOpacity={ACTIVE_OPACITY}
        >
          <Text style={styles.buttonText}>Unlock Premium</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.restoreButton, isRestoring && { opacity: ACTIVE_OPACITY }]}
          onPress={handleRestore}
          disabled={isRestoring}
        >
          {isRestoring ? (
            <ActivityIndicator size="small" color={COLORS.text} />
          ) : (
            <Text style={styles.restoreButtonText}>Restore Purchase</Text>
          )}
        </TouchableOpacity>

        {/* DEV ONLY: Reset purchase button for testing */}
        {__DEV__ && (
          <TouchableOpacity
            style={[styles.restoreButton, { marginTop: 10, opacity: ACTIVE_OPACITY }]}
            onPress={async () => {
              Alert.alert(
                'DEV: Reset Purchase?',
                'This will consume the purchase so you can buy it again.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Reset',
                    style: 'destructive',
                    onPress: async () => {
                      if (resetTestPurchase) await resetTestPurchase();
                    },
                  },
                ]
              );
            }}
          >
            <Text style={styles.restoreButtonText}>[DEV] Reset Purchase</Text>
          </TouchableOpacity>
        )}
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
  return (
    <CollapsibleCategory title={category.title} defaultExpanded={defaultExpanded}>
      {category.features.map((feature) => (
        <CollapsibleFeatureItem
          key={feature.id}
          text={feature.title}
          icon={feature.icon}
          description={feature.description}
          isNew={feature.isNew}
        />
      ))}
    </CollapsibleCategory>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
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
    color: COLORS.primary,
  },
  paymentType: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  button: {
    backgroundColor: COLORS.primary,
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
});
