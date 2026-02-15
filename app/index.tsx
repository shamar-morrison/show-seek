import { READ_OPTIMIZATION_FLAGS } from '@/src/config/readOptimization';
import { COLORS } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useAuth } from '@/src/context/auth';
import { usePreferences } from '@/src/hooks/usePreferences';
import { Redirect } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';

/**
 * Root index route that redirects to the appropriate tab.
 * For authenticated users, redirects to their preferred launch screen.
 * For unauthenticated users, redirects to sign-in.
 * Shows a spinner during the brief redirect for a smoother visual experience.
 */
export default function Index() {
  const { user, loading: authLoading } = useAuth();
  const { preferences, hasLoaded, isLoading: preferencesLoading } = usePreferences();
  const { accentColor } = useAccentColor();

  const isAuthenticated = !!user;
  const shouldWaitForPreferences = isAuthenticated && preferencesLoading && !hasLoaded;
  const loadingGateReasons = useMemo(() => {
    const reasons: string[] = [];
    if (authLoading) reasons.push('auth-loading');
    if (shouldWaitForPreferences) reasons.push('preferences-loading');
    return reasons;
  }, [authLoading, shouldWaitForPreferences]);

  useEffect(() => {
    if (!__DEV__ || !READ_OPTIMIZATION_FLAGS.debugInitGateLogs) {
      return;
    }

    console.log('[Index] Loading gate check', {
      gateReasons: loadingGateReasons,
      authLoading,
      isAuthenticated,
      hasLoaded,
      preferencesLoading,
      shouldWaitForPreferences,
      user: user?.uid ?? 'none',
      timestamp: Date.now(),
    });
  }, [
    loadingGateReasons,
    authLoading,
    isAuthenticated,
    hasLoaded,
    preferencesLoading,
    shouldWaitForPreferences,
    user?.uid,
  ]);

  // Show loading while waiting for auth or preferences
  if (authLoading || shouldWaitForPreferences) {
    if (__DEV__ && READ_OPTIMIZATION_FLAGS.debugInitGateLogs) {
      console.log('[Index] BLOCKING RENDER - Loading gate active', {
        gateReasons: loadingGateReasons,
        user: user?.uid ?? 'none',
        timestamp: Date.now(),
      });
    }

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
