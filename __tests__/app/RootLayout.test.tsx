import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

let mockSegments: string[] = ['(tabs)'];
const mockReplace = jest.fn();

const mockAuthState = {
  user: null as null | { uid?: string },
  loading: false,
  hasCompletedOnboarding: true as boolean | null,
};

const mockPreferencesState = {
  preferences: { defaultLaunchScreen: '/(tabs)/home' },
  isLoading: false,
};

jest.mock('react-native-screens', () => ({
  enableScreens: jest.fn(),
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(),
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@tanstack/react-query', () => ({
  QueryClient: jest.fn(() => ({})),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('expo-router', () => {
  const React = require('react');
  const Stack = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  Stack.Screen = () => null;

  return {
    useRouter: () => ({
      replace: mockReplace,
      push: jest.fn(),
      back: jest.fn(),
    }),
    useSegments: () => mockSegments,
    Stack,
  };
});

jest.mock('@/src/context/auth', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => mockAuthState,
}));

jest.mock('@/src/hooks/usePreferences', () => ({
  usePreferences: () => mockPreferencesState,
}));

jest.mock('@/src/context/LanguageProvider', () => ({
  LanguageProvider: ({ children }: { children: React.ReactNode }) => children,
  useLanguage: () => ({ isLanguageReady: true }),
}));

jest.mock('@/src/context/RegionProvider', () => ({
  RegionProvider: ({ children }: { children: React.ReactNode }) => children,
  useRegion: () => ({ isRegionReady: true }),
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  AccentColorProvider: ({ children }: { children: React.ReactNode }) => children,
  useAccentColor: () => ({ accentColor: '#ff0000', isAccentReady: true }),
}));

jest.mock('@/src/context/PremiumContext', () => ({
  PremiumProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/src/context/TraktContext', () => ({
  TraktProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/src/hooks/useDeepLinking', () => ({
  useDeepLinking: jest.fn(),
}));

jest.mock('@/src/hooks/useQuickActions', () => ({
  useQuickActions: jest.fn(),
}));

jest.mock('@/src/utils/reminderSync', () => ({
  initializeReminderSync: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/src/services/revenueCat', () => ({
  configureRevenueCat: jest.fn(() => Promise.resolve(false)),
}));

jest.mock('@/src/i18n', () => ({
  t: jest.fn(() => 'Notifications'),
}));

import RootLayout from '@/app/_layout';

beforeAll(() => {
  global.requestAnimationFrame = (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  };
});

afterAll(() => {
  // @ts-expect-error - cleanup test shim
  delete global.requestAnimationFrame;
});

describe('RootLayout routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSegments = ['(tabs)'];
    mockAuthState.user = null;
    mockAuthState.loading = false;
    mockAuthState.hasCompletedOnboarding = true;
    mockPreferencesState.preferences = { defaultLaunchScreen: '/(tabs)/home' };
    mockPreferencesState.isLoading = false;
  });

  it('redirects to onboarding when onboarding is incomplete', async () => {
    mockAuthState.hasCompletedOnboarding = false;
    mockSegments = ['(tabs)'];

    render(<RootLayout />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/onboarding');
    });
  });

  it('redirects to sign-in when onboarded but not authenticated', async () => {
    mockAuthState.hasCompletedOnboarding = true;
    mockAuthState.user = null;
    mockSegments = ['(tabs)'];

    render(<RootLayout />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
    });
  });

  it('redirects authenticated users in auth flow to preferred launch screen', async () => {
    mockAuthState.hasCompletedOnboarding = true;
    mockAuthState.user = { uid: 'user-1' };
    mockSegments = ['(auth)'];
    mockPreferencesState.preferences = { defaultLaunchScreen: '/(tabs)/stats' };

    render(<RootLayout />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)/stats');
    });
  });

  it('redirects to sign-in when auth transitions from authenticated to unauthenticated on tabs', async () => {
    mockAuthState.hasCompletedOnboarding = true;
    mockAuthState.user = { uid: 'user-1' };
    mockSegments = ['(tabs)'];

    const { rerender } = render(<RootLayout />);

    expect(mockReplace).not.toHaveBeenCalled();

    mockAuthState.user = null;
    rerender(<RootLayout />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
    });
  });
});
