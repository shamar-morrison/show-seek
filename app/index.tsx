import { COLORS } from '@/src/constants/theme';
import { useAuth } from '@/src/context/auth';
import { usePreferences } from '@/src/hooks/usePreferences';
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

/**
 * Root index route that redirects to the appropriate tab.
 * For authenticated non-guest users, redirects to their preferred launch screen.
 * For guests and unauthenticated users, redirects to home.
 * Shows a spinner during the brief redirect for a smoother visual experience.
 */
export default function Index() {
  const { user, loading: authLoading } = useAuth();
  const { preferences, isLoading: preferencesLoading, hasLoaded } = usePreferences();

  // For authenticated non-guest users, wait for preferences to actually load from Firestore
  const isNonGuestUser = user && !user.isAnonymous;
  // We need to wait until hasLoaded is true for non-guest users
  const shouldWaitForPreferences = isNonGuestUser && !hasLoaded;

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
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // Determine the destination based on user type and preferences
  const destination = isNonGuestUser
    ? preferences?.defaultLaunchScreen || '/(tabs)/home'
    : '/(tabs)/home';

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
      <Redirect href={destination} />
    </View>
  );
}
