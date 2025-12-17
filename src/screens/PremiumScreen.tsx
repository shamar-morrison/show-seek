import { COLORS } from '@/src/constants/theme';
import { usePremium } from '@/src/context/PremiumContext';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
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
  const { isPremium, isLoading, purchasePremium, restorePurchases, price } = usePremium();
  const navigation = useNavigation();

  const handlePurchase = async () => {
    try {
      const success = await purchasePremium();
      // Only show success if the purchase actually completed
      if (success) {
        Alert.alert('Success', 'You are now a Premium member!');
        navigation.goBack();
      }
      // If not successful and no error, user cancelled - do nothing
    } catch (error: any) {
      // Only show error for real errors, not cancellations
      Alert.alert('Purchase Failed', error.message || 'Something went wrong');
    }
  };

  const handleRestore = async () => {
    try {
      await restorePurchases();
      // If detailed success message needed, handled in context or here if restorePurchases returned status
      Alert.alert('Restore Complete', 'Purchases have been restored.');
    } catch (error: any) {
      Alert.alert('Restore Failed', error.message);
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
          <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
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
          <FeatureItem icon="list" text="Unlimited Custom Lists" />
          <FeatureItem icon="infinite" text="Unlimited Items per List" />
          <FeatureItem icon="heart" text="Support Indie Development" />
        </View>

        <View style={styles.pricing}>
          <Text style={styles.price}>{price || '$5.00'}</Text>
          <Text style={styles.paymentType}>One-time payment</Text>
        </View>

        <TouchableOpacity style={styles.button} onPress={handlePurchase}>
          <Text style={styles.buttonText}>Unlock Premium</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.restoreButton} onPress={handleRestore}>
          <Text style={styles.restoreButtonText}>Restore Purchase</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function FeatureItem({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.featureItem}>
      <Ionicons name={icon} size={24} color={COLORS.text} style={{ marginRight: 15 }} />
      <Text style={styles.featureText}>{text}</Text>
    </View>
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
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: 16,
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
    marginTop: 16,
    marginBottom: 32,
  },
  features: {
    width: '100%',
    marginBottom: 40,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  featureText: {
    fontSize: 16,
    color: COLORS.text,
  },
  pricing: {
    alignItems: 'center',
    marginBottom: 32,
  },
  price: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  paymentType: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  button: {
    backgroundColor: COLORS.primary,
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonText: {
    color: '#000',
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
