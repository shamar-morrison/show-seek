import { enableScreens } from 'react-native-screens';
enableScreens();

// Initialize i18n early to ensure translations are available throughout the app
import i18n from '@/src/i18n';

import { BASE_STACK_SCREEN_OPTIONS } from '@/src/constants/navigation';
import { COLORS } from '@/src/constants/theme';
import { READ_OPTIMIZATION_FLAGS } from '@/src/config/readOptimization';
import { AccentColorProvider, useAccentColor } from '@/src/context/AccentColorProvider';
import { AuthProvider, useAuth } from '@/src/context/auth';
import { GuestAccessProvider } from '@/src/context/GuestAccessContext';
import { LanguageProvider, useLanguage } from '@/src/context/LanguageProvider';
import { PremiumProvider } from '@/src/context/PremiumContext';
import { RegionProvider, useRegion } from '@/src/context/RegionProvider';
import { TraktProvider } from '@/src/context/TraktContext';
import { useDeepLinking } from '@/src/hooks/useDeepLinking';
import { usePreferences } from '@/src/hooks/usePreferences';
import { useQuickActions } from '@/src/hooks/useQuickActions';
import { resetReadBudgetForSession } from '@/src/services/ReadBudgetGuard';
import { configureRevenueCat } from '@/src/services/revenueCat';
import {
  clearFirestoreReadAuditEvents,
  getFirestoreReadAuditReport,
  logFirestoreReadAuditReport,
} from '@/src/services/firestoreReadAudit';

import { initializeReminderSync } from '@/src/utils/reminderSync';
import {
  clearReadAuditSession,
  getReadAuditSessionReport,
  logReadAuditSessionReport,
  startReadAuditSession,
} from '@/src/utils/readAuditCollector';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  Button,
  Platform,
  Text,
  UIManager,
  View,
} from 'react-native';
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
      refetchOnReconnect: false, // Prevent reconnect storms from triggering refetches
    },
  },
});

const resetClientReadState = () => {
  clearFirestoreReadAuditEvents();
  clearReadAuditSession();
  resetReadBudgetForSession();
};

interface InitDebugSnapshot {
  loading: boolean;
  hasCompletedOnboarding: boolean | null;
  isLanguageReady: boolean;
  isRegionReady: boolean;
  isAccentReady: boolean;
  preferencesLoading: boolean;
  user: string | null;
  segments: string[];
  gateReasons: string[];
  timestamp: number;
}

function RootLayoutNav() {
  const { loading, user, hasCompletedOnboarding } = useAuth();
  const { preferences, isLoading: preferencesLoading } = usePreferences();
  const { isLanguageReady } = useLanguage();
  const { isRegionReady } = useRegion();
  const { accentColor, isAccentReady } = useAccentColor();
  const segments = useSegments();
  const router = useRouter();
  const previousUidRef = useRef<string | null>(user?.uid ?? null);
  const appStateRef = useRef<AppStateStatus>(AppState?.currentState ?? 'active');
  const [debugTimeoutTriggered, setDebugTimeoutTriggered] = useState(false);
  const [debugForceContinue, setDebugForceContinue] = useState(false);
  const [debugSnapshot, setDebugSnapshot] = useState<InitDebugSnapshot | null>(null);

  const gateReasons = useMemo(() => {
    const reasons: string[] = [];
    if (loading) reasons.push('auth-loading');
    if (hasCompletedOnboarding === null) reasons.push('onboarding-null');
    if (!isLanguageReady) reasons.push('language-not-ready');
    if (!isRegionReady) reasons.push('region-not-ready');
    if (!isAccentReady) reasons.push('accent-not-ready');
    if (!!user && preferencesLoading) reasons.push('preferences-loading');
    return reasons;
  }, [
    loading,
    hasCompletedOnboarding,
    isLanguageReady,
    isRegionReady,
    isAccentReady,
    user,
    preferencesLoading,
  ]);
  const isInitializing = gateReasons.length > 0;

  // Handle deep links
  useDeepLinking();
  useQuickActions();

  useEffect(() => {
    if (!__DEV__ || !READ_OPTIMIZATION_FLAGS.debugInitGateLogs) {
      return;
    }

    console.log('[RootLayout] Init gate check:', {
      isInitializing,
      gateReasons,
      user: user?.uid ?? 'none',
      loading,
      hasCompletedOnboarding,
      isLanguageReady,
      isRegionReady,
      isAccentReady,
      preferencesLoading,
      timestamp: Date.now(),
    });
  }, [
    isInitializing,
    gateReasons,
    user?.uid,
    loading,
    hasCompletedOnboarding,
    isLanguageReady,
    isRegionReady,
    isAccentReady,
    preferencesLoading,
  ]);

  useEffect(() => {
    if (!__DEV__) {
      return;
    }

    (globalThis as any).__APP_INIT_DEBUG__ = {
      snapshot: (): InitDebugSnapshot => ({
        loading,
        hasCompletedOnboarding,
        isLanguageReady,
        isRegionReady,
        isAccentReady,
        preferencesLoading,
        user: user?.uid ?? null,
        segments: segments.map(String),
        gateReasons,
        timestamp: Date.now(),
      }),
      gateReasons: (): string[] => [...gateReasons],
    };

    return () => {
      delete (globalThis as any).__APP_INIT_DEBUG__;
    };
  }, [
    loading,
    hasCompletedOnboarding,
    isLanguageReady,
    isRegionReady,
    isAccentReady,
    preferencesLoading,
    user?.uid,
    segments,
    gateReasons,
  ]);

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
    if (!READ_OPTIMIZATION_FLAGS.enableStartupReminderSync) {
      return;
    }

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
    if (!__DEV__) {
      return;
    }

    if (READ_OPTIMIZATION_FLAGS.debugDisableReadAuditGlobalSetup) {
      if (READ_OPTIMIZATION_FLAGS.debugInitGateLogs) {
        console.log('[RootLayout] __READ_AUDIT__ setup disabled by debug flag');
      }
      return;
    }

    if (READ_OPTIMIZATION_FLAGS.debugInitGateLogs) {
      console.log('[RootLayout] __READ_AUDIT__ setup enabled');
    }

    const reportAuditState = (context: string) => {
      logFirestoreReadAuditReport(context);
      logReadAuditSessionReport(context);
      return {
        firestore: getFirestoreReadAuditReport(),
        session: getReadAuditSessionReport(),
      };
    };

    (globalThis as any).__READ_AUDIT__ = {
      report: (context = 'manual') => reportAuditState(context),
      clear: () => {
        resetClientReadState();
        const uid = user?.uid;
        startReadAuditSession(uid);
        return reportAuditState('manual-clear');
      },
    };

    return () => {
      delete (globalThis as any).__READ_AUDIT__;
    };
  }, [user?.uid]);

  useEffect(() => {
    const currentUid = user?.uid ?? null;
    const previousUid = previousUidRef.current;
    const authChanged = previousUid !== currentUid;

    if (authChanged) {
      const context = `auth-transition:${previousUid ?? 'none'}->${currentUid ?? 'none'}`;
      logFirestoreReadAuditReport(context);
      logReadAuditSessionReport(context);
    }

    const isSignOut = !!previousUid && !currentUid;
    const isAccountSwitch = !!previousUid && !!currentUid && previousUid !== currentUid;

    if (isSignOut || isAccountSwitch) {
      if (READ_OPTIMIZATION_FLAGS.debugDisableAuthTransitionCacheClear) {
        if (READ_OPTIMIZATION_FLAGS.debugInitGateLogs) {
          console.log('[RootLayout] queryClient.clear() skipped by debug flag', {
            previousUid,
            currentUid,
          });
        }
      } else if (typeof (queryClient as { clear?: () => void }).clear === 'function') {
        queryClient.clear();
      }
      resetClientReadState();
    }

    if (authChanged || !getReadAuditSessionReport()) {
      startReadAuditSession(currentUid ?? undefined);
    }

    previousUidRef.current = currentUid;
  }, [user?.uid]);

  useEffect(() => {
    if (READ_OPTIMIZATION_FLAGS.debugDisableAppStateAuditLogging) {
      return;
    }

    if (!AppState?.addEventListener) {
      return;
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      const isBackgroundTransition =
        previousState === 'active' && (nextState === 'inactive' || nextState === 'background');
      const isForegroundTransition =
        (previousState === 'inactive' || previousState === 'background') && nextState === 'active';

      if (isBackgroundTransition) {
        logFirestoreReadAuditReport('app-background');
        logReadAuditSessionReport('app-background');
      }

      if (isForegroundTransition) {
        logFirestoreReadAuditReport('app-foreground');
        logReadAuditSessionReport('app-foreground');
      }

      appStateRef.current = nextState;
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!__DEV__ || !READ_OPTIMIZATION_FLAGS.debugEnableTimeoutEscapeHatch) {
      return;
    }

    if (!isInitializing || debugForceContinue || debugTimeoutTriggered) {
      return;
    }

    const timer = setTimeout(() => {
      const snapshot: InitDebugSnapshot = {
        loading,
        hasCompletedOnboarding,
        isLanguageReady,
        isRegionReady,
        isAccentReady,
        preferencesLoading,
        user: user?.uid ?? null,
        segments: segments.map(String),
        gateReasons: [...gateReasons],
        timestamp: Date.now(),
      };

      console.error('[RootLayout] TIMEOUT - App stuck loading for 5+ seconds', snapshot);
      setDebugSnapshot(snapshot);
      setDebugTimeoutTriggered(true);
    }, READ_OPTIMIZATION_FLAGS.debugInitTimeoutMs);

    return () => clearTimeout(timer);
  }, [
    isInitializing,
    debugForceContinue,
    debugTimeoutTriggered,
    loading,
    hasCompletedOnboarding,
    isLanguageReady,
    isRegionReady,
    isAccentReady,
    preferencesLoading,
    user?.uid,
    segments,
    gateReasons,
  ]);

  useEffect(() => {
    if (isInitializing) {
      return;
    }

    if (debugTimeoutTriggered) {
      setDebugTimeoutTriggered(false);
    }
    if (debugForceContinue) {
      setDebugForceContinue(false);
    }
  }, [isInitializing, debugTimeoutTriggered, debugForceContinue]);

  useEffect(() => {
    const waitingForPreferences = !!user && preferencesLoading;
    if (loading || !isLanguageReady || !isRegionReady || !isAccentReady || waitingForPreferences) {
      return;
    }

    // Hide splash screen once we know the auth state and language/region are ready
    SplashScreen.hideAsync();

    const inAuthGroup = segments[0] === '(auth)';
    const isOnboarding = segments[0] === 'onboarding';

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

  if (debugTimeoutTriggered && debugSnapshot) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: COLORS.background,
          justifyContent: 'center',
          paddingHorizontal: 20,
          gap: 12,
        }}
      >
        <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: '700' }}>
          Debug: App Stuck Loading
        </Text>
        <Text style={{ color: COLORS.textSecondary }}>
          Snapshot captured after {READ_OPTIMIZATION_FLAGS.debugInitTimeoutMs}ms
        </Text>
        <Text
          selectable
          style={{
            color: COLORS.text,
            fontSize: 12,
            fontFamily: Platform.select({
              ios: 'Menlo',
              android: 'monospace',
              default: 'monospace',
            }),
          }}
        >
          {JSON.stringify(debugSnapshot, null, 2)}
        </Text>
        <Button
          title="Force Continue (Debug)"
          onPress={() => {
            setDebugForceContinue(true);
            setDebugTimeoutTriggered(false);
          }}
        />
        <Button
          title="Reload App"
          onPress={async () => {
            try {
              if (Platform.OS === 'web' && typeof window !== 'undefined') {
                window.location.reload();
                return;
              }
              const updatesModule = await import('expo-updates');
              await updatesModule.reloadAsync();
            } catch (error) {
              console.error('[RootLayout] Failed to reload app from debug panel', error);
            }
          }}
        />
      </View>
    );
  }

  const shouldBlockRender = isInitializing && !debugForceContinue;
  if (shouldBlockRender) {
    if (__DEV__ && READ_OPTIMIZATION_FLAGS.debugInitGateLogs) {
      console.log('[RootLayout] BLOCKING RENDER - Init gate active', {
        gateReasons,
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
  useEffect(() => {
    void configureRevenueCat().catch((error) => {
      console.error('[RootLayout] RevenueCat configuration failed', error);
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <GuestAccessProvider>
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
        </GuestAccessProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
