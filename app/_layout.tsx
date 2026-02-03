import { enableScreens } from 'react-native-screens';
enableScreens();

// Initialize i18n early to ensure translations are available throughout the app
import '@/src/i18n';

import { COLORS } from '@/src/constants/theme';
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

// Create notification channel for Android - required for Android 13+ permission prompt
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('default', {
    name: 'Release Reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: COLORS.primary,
    sound: 'default',
  }).catch((error) => {
    console.error('[NotificationChannel] Failed to create default channel', error);
  });
}

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
  const { loading, user } = useAuth();
  const {
    preferences,
    isLoading: preferencesLoading,
    hasLoaded: preferencesHasLoaded,
  } = usePreferences();
  const { isLanguageReady } = useLanguage();
  const { isRegionReady } = useRegion();
  const segments = useSegments();
  const router = useRouter();

  // Track last navigation to prevent race conditions
  const lastNavigationRef = React.useRef<string | null>(null);

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
    // For non-anonymous users, wait for preferences to load before routing
    const waitingForPreferences =
      user && !user.isAnonymous && (preferencesLoading || !preferencesHasLoaded);
    if (loading || !isLanguageReady || !isRegionReady || waitingForPreferences) {
      console.log('[Routing] Waiting...', {
        loading,
        isLanguageReady,
        isRegionReady,
        preferencesLoading,
        preferencesHasLoaded,
        hasUser: !!user,
        isAnonymous: user?.isAnonymous,
      });
      return;
    }

    // Hide splash screen once we know the auth state and language/region are ready
    SplashScreen.hideAsync();

    const inAuthGroup = segments[0] === '(auth)';
    const isOnboarding = segments[0] === 'onboarding';

    console.log('[Routing] Making decision...', {
      hasUser: !!user,
      isAnonymous: user?.isAnonymous,
      inAuthGroup,
      isOnboarding,
      onboardingCompleted: preferences?.onboardingCompleted,
      preferencesHasLoaded,
    });

    // Helper to navigate with deduplication
    const safeNavigate = (destination: string) => {
      if (lastNavigationRef.current === destination) return;
      lastNavigationRef.current = destination;
      console.log('[Routing] Navigating to:', destination);
      // Use requestAnimationFrame to defer navigation past any pending unmounts
      requestAnimationFrame(() => {
        router.replace(destination as any);
      });
    };

    // Routing logic
    if (!user && !inAuthGroup) {
      // Not logged in, go to sign-in
      safeNavigate('/(auth)/sign-in');
    } else if (
      user &&
      !user.isAnonymous &&
      preferences?.onboardingCompleted === false &&
      !isOnboarding
    ) {
      // New user who hasn't completed onboarding - redirect to onboarding from anywhere
      safeNavigate('/onboarding');
    } else if (user && !user.isAnonymous && inAuthGroup) {
      // Logged in as a real user and still in auth group - go to home (or default screen)
      // Only reach here if onboarding is already completed or undefined (existing user)
      const destination = preferences?.defaultLaunchScreen || '/(tabs)/home';
      safeNavigate(destination);
    } else if (user && !user.isAnonymous && isOnboarding) {
      // User is on onboarding - only redirect if they've already completed it
      if (preferences?.onboardingCompleted === true) {
        const destination = preferences?.defaultLaunchScreen || '/(tabs)/home';
        safeNavigate(destination);
      }
    } else if (user && user.isAnonymous && inAuthGroup) {
      // Guest user in auth group — navigate to home (guests skip wizard)
      setTimeout(() => {
        safeNavigate('/(tabs)/home');
      }, 50);
    } else if (user && user.isAnonymous && isOnboarding) {
      // Guest on onboarding screen — redirect to home
      safeNavigate('/(tabs)/home');
    }
  }, [
    user,
    loading,
    segments,
    router,
    isLanguageReady,
    isRegionReady,
    preferences,
    preferencesLoading,
    preferencesHasLoaded,
  ]);

  // Show loading state while auth, language, region, or preferences are loading
  const isInitializing =
    loading ||
    !isLanguageReady ||
    !isRegionReady ||
    (user && !user.isAnonymous && preferencesLoading);
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
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" backgroundColor={COLORS.background} translucent={false} />

      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.background },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontWeight: 'bold' },
          contentStyle: { backgroundColor: COLORS.background },
          headerBackTitle: '',
        }}
      >
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
                <GestureHandlerRootView style={{ flex: 1, backgroundColor: COLORS.background }}>
                  <RootLayoutNav />
                </GestureHandlerRootView>
              </RegionProvider>
            </LanguageProvider>
          </TraktProvider>
        </PremiumProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
