import { COLORS } from '@/src/constants/theme';
import { usePremium } from '@/src/context/PremiumContext';
import { useRouter } from 'expo-router';
import { Crown, Lock } from 'lucide-react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface PremiumWidgetGateProps {
  children: React.ReactNode;
}

export function PremiumWidgetGate({ children }: PremiumWidgetGateProps) {
  const { t } = useTranslation();
  const { isPremium } = usePremium();
  const router = useRouter();

  if (isPremium) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconContainer}>
          <Crown size={48} color="#FFD700" />
        </View>

        <Text style={styles.title}>{t('premiumFeature.title')}</Text>
        <Text style={styles.description}>
          {t('widgets.premiumGateDescription')}
        </Text>

        <TouchableOpacity style={styles.button} onPress={() => router.push('/premium')}>
          <Lock size={18} color="#000" style={styles.lockIcon} />
          <Text style={styles.buttonText}>{t('widgets.unlockWidgets')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  button: {
    flexDirection: 'row',
    backgroundColor: '#FFD700',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
  },
  lockIcon: {
    marginRight: 8,
  },
  buttonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
