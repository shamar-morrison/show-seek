import { COLORS } from '@/src/constants/theme';
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

/**
 * Root index route that redirects to the home tab.
 * This file is required for production builds to properly resolve the initial route.
 * The actual auth/onboarding redirect logic is handled in _layout.tsx.
 * Shows a spinner during the brief redirect for a smoother visual experience.
 */
export default function Index() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: COLORS.background,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Redirect href="/(tabs)/home" />
    </View>
  );
}
