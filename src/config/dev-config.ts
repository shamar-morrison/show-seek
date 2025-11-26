interface DevConfig {
  ENABLE_DEV_NAVIGATION: boolean;
  FORCE_SCREENS: {
    ONBOARDING: boolean;
    SIGN_IN: boolean;
    SIGN_UP: boolean;
    HOME: boolean;
    PROFILE: boolean;
    SEARCH: boolean;
    LIBRARY: boolean;
  };
  OVERRIDES: {
    SKIP_ONBOARDING_CHECK: boolean;
    SKIP_AUTH_CHECK: boolean;
    MOCK_AUTHENTICATED: boolean;
  };
  MOCK_USER: {
    uid: string;
    email: string;
    displayName: string;
  };
}

/**
 * DEVELOPER NAVIGATION CONFIG
 *
 * Quick access to any screen for testing/development
 *
 * USAGE:
 * 1. Set ENABLE_DEV_NAVIGATION to true
 * 2. Set ONE screen in FORCE_SCREENS to true (set others to false)
 * 3. Save and reload app
 * 4. App will navigate directly to that screen
 *
 * EXAMPLES:
 * - Test onboarding: Set FORCE_SCREENS.ONBOARDING = true
 * - Test sign-in UI: Set FORCE_SCREENS.SIGN_IN = true
 * - Skip to home: Set FORCE_SCREENS.HOME = true
 * - Work without auth: Set OVERRIDES.MOCK_AUTHENTICATED = true
 *
 * Remember to disable before committing!
 */
const DEV_CONFIG: DevConfig = {
  // Enable dev navigation overrides (only works in __DEV__ mode)
  ENABLE_DEV_NAVIGATION: false,

  // Force navigate to specific screen on app load
  // Set ONE of these to true at a time, others should be false
  FORCE_SCREENS: {
    ONBOARDING: false, // Force show onboarding flow
    SIGN_IN: false, // Force show sign-in screen
    SIGN_UP: false, // Force show sign-up screen
    HOME: false, // Force go to authenticated home
    PROFILE: false, // Force go to profile tab
    SEARCH: false, // Force go to search tab
    LIBRARY: false, // Force go to library tab
  },

  // Override specific checks
  OVERRIDES: {
    SKIP_ONBOARDING_CHECK: false, // Ignore AsyncStorage onboarding flag
    SKIP_AUTH_CHECK: false, // Bypass authentication entirely
    MOCK_AUTHENTICATED: false, // Pretend user is authenticated
  },

  // Mock user data (when MOCK_AUTHENTICATED is true)
  MOCK_USER: {
    uid: 'dev-user-123',
    email: 'dev@test.com',
    displayName: 'Dev User',
  },
};

// Only export in development mode
export default __DEV__ ? DEV_CONFIG : null;
