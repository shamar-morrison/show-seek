import React from 'react';
import { render } from '@testing-library/react-native';

const mockRedirect = jest.fn();
const mockTabsRender = jest.fn();

const mockAuthState = {
  user: null as null | { uid: string },
  loading: false,
};

const mockPreferencesState = {
  preferences: { hideTabLabels: false },
};

jest.mock('expo-router', () => {
  const React = require('react');
  const Tabs = ({ children, ...props }: { children: React.ReactNode }) => {
    mockTabsRender(props);
    return React.createElement(React.Fragment, null, children);
  };
  Tabs.Screen = () => null;

  const Redirect = (props: unknown) => {
    mockRedirect(props);
    return null;
  };

  return { Tabs, Redirect };
});

jest.mock('@/src/context/auth', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff0000' }),
}));

jest.mock('@/src/hooks/usePreferences', () => ({
  usePreferences: () => mockPreferencesState,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

import TabLayout from '@/app/(tabs)/_layout';

describe('TabLayout auth guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.user = null;
    mockAuthState.loading = false;
    mockPreferencesState.preferences = { hideTabLabels: false };
  });

  it('redirects to sign-in when user is unauthenticated', () => {
    render(<TabLayout />);

    expect(mockRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ href: '/(auth)/sign-in' })
    );
    expect(mockTabsRender).not.toHaveBeenCalled();
  });

  it('renders tabs when user is authenticated', () => {
    mockAuthState.user = { uid: 'user-1' };

    render(<TabLayout />);

    expect(mockTabsRender).toHaveBeenCalledTimes(1);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('shows loading fallback when auth is still loading', () => {
    mockAuthState.loading = true;

    render(<TabLayout />);

    expect(mockTabsRender).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
