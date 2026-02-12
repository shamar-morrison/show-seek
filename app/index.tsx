import { COLORS } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useAuth } from '@/src/context/auth';
import { usePreferences } from '@/src/hooks/usePreferences';
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

/**
 * Root index route that redirects to the appropriate tab.
 * For authenticated users, redirects to their preferred launch screen.
 * For unauthenticated users, redirects to sign-in.
 * Shows a spinner during the brief redirect for a smoother visual experience.
 */
export default function Index() {
  const { user, loading: authLoading } = useAuth();
  const { preferences, hasLoaded } = usePreferences();
  const { accentColor } = useAccentColor();

  const isAuthenticated = !!user;
  const shouldWaitForPreferences = isAuthenticated && !hasLoaded;

  // Show loading while waiting for auth or preferences
  if (authLoading || shouldWaitForPreferences) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: COLORS.background,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ActivityIndicator size="large" color={accentColor} />
      </View>
    );
  }

  // Determine the destination based on user type and preferences
  const destination = isAuthenticated
    ? preferences?.defaultLaunchScreen || '/(tabs)/home'
    : '/(auth)/sign-in';

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: COLORS.background,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <ActivityIndicator size="large" color={accentColor} />
      <Redirect href={destination} />
    </View>
  );
}
