import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Alert } from 'react-native';
import i18n from '@/src/i18n';

/**
 * Shows a standardized premium feature alert with haptic feedback.
 *
 * @param featureNameKey - Translation key for the premium feature name (e.g., "premiumFeature.features.notes")
 * @param onDismiss - Optional callback when the alert is dismissed (via Cancel)
 */
export function showPremiumAlert(featureNameKey: string, onDismiss?: () => void): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

  const featureName = i18n.t(featureNameKey);

  Alert.alert(i18n.t('premiumFeature.title'), i18n.t('premiumFeature.message', { featureName }), [
    {
      text: i18n.t('common.cancel'),
      style: 'cancel',
      onPress: onDismiss,
    },
    {
      text: i18n.t('profile.upgradeToPremium'),
      onPress: () => router.push('/premium' as any),
    },
  ]);
}
