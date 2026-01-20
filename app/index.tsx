import { COLORS } from '@/src/constants/theme';
import { useAuth } from '@/src/context/auth';
import { usePreferences } from '@/src/hooks/usePreferences';
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

/**
 * Root index route that redirects to the appropriate initial tab.
 * This file is required for production builds to properly resolve the initial route.
 * The actual auth/onboarding redirect logic is handled in _layout.tsx.
 * Shows a spinner during the brief redirect for a smoother visual experience.
 */
export default function Index() {
  const { loading: authLoading } = useAuth();
  const { preferences, isLoading: preferencesLoading } = usePreferences();

  // Must wait for auth to initialize first, otherwise auth.currentUser is null
  // and usePreferences will return DEFAULT_PREFERENCES
  if (authLoading) {
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

  // Wait for preferences to load from Firestore
  if (preferencesLoading) {
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

  // Use the user's preferred launch screen (or default to home)
  const launchScreen = preferences?.defaultLaunchScreen ?? '/(tabs)/home';

  console.log(
    '[Index] Redirecting to:',
    launchScreen,
    'authLoading:',
    authLoading,
    'preferencesLoading:',
    preferencesLoading,
    'preferences:',
    preferences
  );

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
      <Redirect href={launchScreen as any} />
    </View>
  );
}
