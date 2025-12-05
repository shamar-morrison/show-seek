import { Redirect } from 'expo-router';

/**
 * Root index route that redirects to the home tab.
 * This file is required for production builds to properly resolve the initial route.
 * The actual auth/onboarding redirect logic is handled in _layout.tsx.
 */
export default function Index() {
  return <Redirect href="/(tabs)/home" />;
}
