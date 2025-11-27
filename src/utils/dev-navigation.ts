import { Router } from 'expo-router';
import { User } from 'firebase/auth';

// Helper to safely get config
const getDevConfig = () => {
  if (__DEV__) {
    try {
      return require('@/src/config/dev-config').default;
    } catch (e) {
      return null;
    }
  }
  return null;
};

export const shouldSkipOnboarding = (): boolean => {
  const config = getDevConfig();
  if (config?.ENABLE_DEV_NAVIGATION && config.OVERRIDES.SKIP_ONBOARDING_CHECK) {
    console.log('[DEV NAV] Skipping onboarding check');
    return true;
  }
  return false;
};

export const getMockUser = (): User | null => {
  const config = getDevConfig();
  if (config?.ENABLE_DEV_NAVIGATION && config.OVERRIDES.MOCK_AUTHENTICATED) {
    console.log('[DEV NAV] Mocking authenticated user');

    // Validate required fields
    if (!config.MOCK_USER.uid || !config.MOCK_USER.email || !config.MOCK_USER.displayName) {
      console.error(
        '[DEV NAV] Missing required fields in MOCK_USER config (uid, email, displayName)'
      );
      return null;
    }

    // Create a minimal mock that satisfies User interface
    return {
      ...config.MOCK_USER,
      emailVerified: true,
      isAnonymous: false,
      metadata: {},
      providerData: [],
      refreshToken: '',
      tenantId: null,
      delete: async () => {},
      getIdToken: async () => 'mock-token',
      getIdTokenResult: async () => ({}) as any,
      reload: async () => {},
      toJSON: () => ({}),
      phoneNumber: null,
      photoURL: null,
      providerId: 'firebase',
    } as User;
  }
  return null;
};

export const handleDevNavigation = (
  router: Router,
  isOnboarding: boolean,
  inAuthGroup: boolean
): boolean => {
  const config = getDevConfig();
  if (!config?.ENABLE_DEV_NAVIGATION) return false;

  console.log('[DEV NAV] Dev navigation enabled');

  // Map of force screen keys to routes
  const forceScreenRoutes: Record<string, string> = {
    ONBOARDING: '/onboarding',
    SIGN_IN: '/(auth)/sign-in',
    SIGN_UP: '/(auth)/sign-up',
    HOME: '/(tabs)',
    PROFILE: '/(tabs)/profile',
    SEARCH: '/(tabs)/search',
    LIBRARY: '/(tabs)/library',
  };

  const activeForceScreen = Object.entries(config.FORCE_SCREENS).find(([_, v]) => v);
  if (activeForceScreen) {
    const [screenKey] = activeForceScreen;
    const route = forceScreenRoutes[screenKey];
    if (route) {
      console.log(`[DEV NAV] Force screen: ${screenKey}`);
      router.replace(route as any);
      return true;
    } else {
      console.warn(`[DEV NAV] Unknown force screen key: ${screenKey}`);
    }
  }

  // If skipping auth check, allow access to main app
  if (config.OVERRIDES.SKIP_AUTH_CHECK) {
    console.log('[DEV NAV] Skipping auth check');
    if (isOnboarding || inAuthGroup) {
      router.replace('/(tabs)/home');
    }
    // If already in tabs or other screens, do nothing (allow access)
    return true;
  }

  return false;
};
