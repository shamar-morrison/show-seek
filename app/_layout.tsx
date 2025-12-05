import { enableScreens } from 'react-native-screens';
enableScreens();

import DevIndicator from '@/src/components/DevIndicator';
import { COLORS } from '@/src/constants/theme';
import { AuthProvider, useAuth } from '@/src/context/auth';
import { useDeepLinking } from '@/src/hooks/useDeepLinking';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';
import { initializeReminderSync } from '@/src/utils/reminderSync';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false, // Reduce unnecessary refetches
    },
  },
});

function RootLayoutNav() {
  const { loading, user, hasCompletedOnboarding } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Handle deep links
  useDeepLinking();

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
    initializeReminderSync();
  }, []);

  useEffect(() => {
    if (loading) return;

    // Hide splash screen once we know the auth state
    SplashScreen.hideAsync();

    const inAuthGroup = segments[0] === '(auth)';
    const isOnboarding = segments[0] === 'onboarding';

    if (loading) return;

    // Logic for redirection
    if (
      require('@/src/utils/dev-navigation').handleDevNavigation(router, isOnboarding, inAuthGroup)
    ) {
      return;
    }

    if (!hasCompletedOnboarding && !isOnboarding) {
      // If not onboarded, go to onboarding
      router.replace('/onboarding');
    } else if (hasCompletedOnboarding && !user && !inAuthGroup) {
      // If onboarded but not logged in, go to sign-in
      router.replace('/(auth)/sign-in');
    } else if (user && (inAuthGroup || isOnboarding)) {
      // If logged in and in auth/onboarding, go to home
      router.replace('/(tabs)/home');
    }
  }, [user, loading, hasCompletedOnboarding, segments, router]);

  if (loading) {
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
      {__DEV__ && <DevIndicator />}
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.background },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontWeight: 'bold' },
          contentStyle: { backgroundColor: COLORS.background },
          headerBackTitle: '',
        }}
      >
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
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: COLORS.background }}>
          <RootLayoutNav />
        </GestureHandlerRootView>
      </AuthProvider>
    </QueryClientProvider>
  );
}
