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
      getIdTokenResult: async () => ({} as any),
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

  // Check for forced screens
  if (config.FORCE_SCREENS.ONBOARDING) {
    console.log('[DEV NAV] Force screen: ONBOARDING');
    router.replace('/onboarding');
    return true;
  }
  if (config.FORCE_SCREENS.SIGN_IN) {
    console.log('[DEV NAV] Force screen: SIGN_IN');
    router.replace('/(auth)/sign-in');
    return true;
  }
  if (config.FORCE_SCREENS.SIGN_UP) {
    console.log('[DEV NAV] Force screen: SIGN_UP');
    router.replace('/(auth)/sign-up');
    return true;
  }
  if (config.FORCE_SCREENS.HOME) {
    console.log('[DEV NAV] Force screen: HOME');
    router.replace('/(tabs)');
    return true;
  }
  if (config.FORCE_SCREENS.PROFILE) {
    console.log('[DEV NAV] Force screen: PROFILE');
    router.replace('/(tabs)/profile');
    return true;
  }
  if (config.FORCE_SCREENS.SEARCH) {
    console.log('[DEV NAV] Force screen: SEARCH');
    router.replace('/(tabs)/search');
    return true;
  }
  if (config.FORCE_SCREENS.LIBRARY) {
    console.log('[DEV NAV] Force screen: LIBRARY');
    router.replace('/(tabs)/library');
    return true;
  }

  // If skipping auth check, allow access to main app
  if (config.OVERRIDES.SKIP_AUTH_CHECK) {
    console.log('[DEV NAV] Skipping auth check');
    if (isOnboarding || inAuthGroup) {
      router.replace('/(tabs)');
    }
    // If already in tabs or other screens, do nothing (allow access)
    return true;
  }

  return false;
};
