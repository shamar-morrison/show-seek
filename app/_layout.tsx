import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider, useAuth } from "@/src/context/auth";
import { COLORS } from "@/src/constants/theme";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

function RootLayoutNav() {
  const { loading, user, hasCompletedOnboarding } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    // Hide splash screen once we know the auth state
    SplashScreen.hideAsync();

    const inAuthGroup = segments[0] === "(auth)";
    const isOnboarding = segments[0] === "onboarding";

    if (loading) return;

    // Logic for redirection
    if (!hasCompletedOnboarding && !isOnboarding) {
      // If not onboarded, go to onboarding
       router.replace("/onboarding");
    } else if (hasCompletedOnboarding && !user && !inAuthGroup) {
      // If onboarded but not logged in, go to sign-in
       router.replace("/(auth)/sign-in");
    } else if (user && (inAuthGroup || isOnboarding)) {
      // If logged in and in auth/onboarding, go to home
      router.replace("/(tabs)");
    }
  }, [user, loading, hasCompletedOnboarding, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" backgroundColor={COLORS.background} translucent={false} />
      <Stack screenOptions={{ 
        headerStyle: { backgroundColor: COLORS.background },
        headerTintColor: COLORS.text,
        headerTitleStyle: { fontWeight: 'bold' },
        contentStyle: { backgroundColor: COLORS.background },
        headerBackTitle: "",
      }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="movie/[id]" options={{ title: '', headerTransparent: true }} />
        <Stack.Screen name="tv/[id]" options={{ title: '', headerTransparent: true }} />
        <Stack.Screen name="person/[id]" options={{ title: '', headerTransparent: true }} />
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