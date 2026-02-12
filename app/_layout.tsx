import { enableScreens } from 'react-native-screens';
enableScreens();

// Initialize i18n early to ensure translations are available throughout the app
import i18n from '@/src/i18n';

import { BASE_STACK_SCREEN_OPTIONS } from '@/src/constants/navigation';
import { COLORS } from '@/src/constants/theme';
import { AccentColorProvider, useAccentColor } from '@/src/context/AccentColorProvider';
import { AuthProvider, useAuth } from '@/src/context/auth';
import { LanguageProvider, useLanguage } from '@/src/context/LanguageProvider';
import { PremiumProvider } from '@/src/context/PremiumContext';
import { RegionProvider, useRegion } from '@/src/context/RegionProvider';
import { TraktProvider } from '@/src/context/TraktContext';
import { useDeepLinking } from '@/src/hooks/useDeepLinking';
import { usePreferences } from '@/src/hooks/usePreferences';
import { useQuickActions } from '@/src/hooks/useQuickActions';

import { initializeReminderSync } from '@/src/utils/reminderSync';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, Platform, UIManager, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 60 * 3, // 3 hours
      refetchOnWindowFocus: false, // Reduce unnecessary refetches
    },
  },
});

function RootLayoutNav() {
  const { loading, user, hasCompletedOnboarding } = useAuth();
  const { preferences, isLoading: preferencesLoading } = usePreferences();
  const { isLanguageReady } = useLanguage();
  const { isRegionReady } = useRegion();
  const { accentColor, isAccentReady } = useAccentColor();
  const segments = useSegments();
  const router = useRouter();

  // Handle deep links
  useDeepLinking();
  useQuickActions();

  // Handle notification taps
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;

      if (data.type === 'reminder' && data.mediaType && data.mediaId) {
        // Navigate to movie detail screen
        // Use timeout to ensure navigation is ready
        setTimeout(() => {
          router.push(`/(tabs)/home/${data.mediaType}/${data.mediaId}` as any);
        }, 100);
      }
    });

    return () => subscription.remove();
  }, [router]);

  // Initialize reminder sync on app launch
  useEffect(() => {
    initializeReminderSync().catch((error) => {
      console.error('[reminderSync] Failed to initialize', error);
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    Notifications.setNotificationChannelAsync('default', {
      name: i18n.t('notifications.channelName'),
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: accentColor,
      sound: 'default',
    }).catch((error) => {
      console.error('[NotificationChannel] Failed to create default channel', error);
    });
  }, [accentColor]);

  useEffect(() => {
    const waitingForPreferences = !!user && preferencesLoading;
    if (loading || !isLanguageReady || !isRegionReady || !isAccentReady || waitingForPreferences) {
      return;
    }

    // Hide splash screen once we know the auth state and language/region are ready
    SplashScreen.hideAsync();

    const inAuthGroup = segments[0] === '(auth)';
    const isOnboarding = segments[0] === 'onboarding';

    if (loading) return;

    if (!hasCompletedOnboarding && !isOnboarding) {
      // If not onboarded, go to onboarding
      router.replace('/onboarding');
    } else if (hasCompletedOnboarding && !user && !inAuthGroup) {
      // If onboarded but not logged in, go to sign-in
      router.replace('/(auth)/sign-in');
    } else if (user && (inAuthGroup || isOnboarding)) {
      // If logged in and in auth/onboarding, go to preferred launch screen
      const destination = preferences?.defaultLaunchScreen || '/(tabs)/home';
      router.replace(destination as any);
    }
  }, [
    user,
    loading,
    hasCompletedOnboarding,
    segments,
    router,
    isLanguageReady,
    isRegionReady,
    isAccentReady,
    preferences,
    preferencesLoading,
  ]);

  // Show loading state while auth, language, region, or preferences are loading
  // Also wait for hasCompletedOnboarding to be resolved to prevent onboarding flash
  const isInitializing =
    loading ||
    hasCompletedOnboarding === null ||
    !isLanguageReady ||
    !isRegionReady ||
    !isAccentReady ||
    (!!user && preferencesLoading);
  if (isInitializing) {
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

  return (
    <>
      <StatusBar style="light" backgroundColor={COLORS.background} translucent={false} />

      <Stack screenOptions={BASE_STACK_SCREEN_OPTIONS}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PremiumProvider>
          <TraktProvider>
            <LanguageProvider>
              <RegionProvider>
                <AccentColorProvider>
                  <GestureHandlerRootView style={{ flex: 1, backgroundColor: COLORS.background }}>
                    <RootLayoutNav />
                  </GestureHandlerRootView>
                </AccentColorProvider>
              </RegionProvider>
            </LanguageProvider>
          </TraktProvider>
        </PremiumProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
