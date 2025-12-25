import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Alert } from 'react-native';

/**
 * Shows a standardized premium feature alert with haptic feedback.
 *
 * @param featureName - The name of the premium feature (e.g., "Notes", "Reminders")
 * @param onDismiss - Optional callback when the alert is dismissed (via Cancel)
 */
export function showPremiumAlert(featureName: string, onDismiss?: () => void): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

  const isPlural = featureName.endsWith('s');
  const verb = isPlural ? 'are' : 'is';

  Alert.alert('Premium Feature', `${featureName} ${verb} only available for premium members.`, [
    {
      text: 'Cancel',
      style: 'cancel',
      onPress: onDismiss,
    },
    {
      text: 'Upgrade',
      onPress: () => router.push('/premium' as any),
    },
  ]);
}
