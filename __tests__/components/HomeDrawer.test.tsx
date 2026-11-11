import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return {
    ...actual,
    BackHandler: {
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    },
  };
});

const mockSignOut = jest.fn();
const mockOnClose = jest.fn();
const mockPush = jest.fn();
const mockAuthState = {
  user: { uid: 'user-1', displayName: 'Test User', email: 'test@example.com' },
  isGuest: false,
  signOut: mockSignOut,
};

jest.mock('@/src/context/auth', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => ({ isPremium: false }),
}));

let mockProfileBackground: { path: string; kind: 'backdrop' | 'poster' } | null = null;
const mockSetProfileBackground = jest.fn(() => Promise.resolve());
jest.mock('@/src/hooks/useProfileBackground', () => ({
  useProfileBackground: () => ({
    profileBackground: mockProfileBackground,
    setProfileBackground: mockSetProfileBackground,
    isSaving: false,
  }),
}));
// Its image component pulls in expo-image's native module.
jest.mock('@/src/components/profile/ProfileBackgroundImage', () => ({
  ProfileBackgroundImage: ({ background, fadeTo }: any) => {
    const { View } = require('react-native');
    return <View testID="profile-background" background={background} fadeTo={fadeTo} />;
  },
}));

jest.mock('@/src/components/ui/UserAvatar', () => ({
  UserAvatar: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('react-native-paper', () => ({
  Divider: () => null,
}));

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: {
    View: 'AnimatedView',
  },
  useSharedValue: (initialValue: number) => ({ value: initialValue }),
  useAnimatedStyle: () => ({}),
  withTiming: (value: number) => value,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: (...args: unknown[]) => mockPush(...args),
  }),
}));

import { HomeDrawer } from '@/src/components/HomeDrawer';
import { COLORS } from '@/src/constants/theme';

describe('HomeDrawer sign out flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.user = {
      uid: 'user-1',
      displayName: 'Test User',
      email: 'test@example.com',
    };
    mockAuthState.isGuest = false;
    mockProfileBackground = null;
  });

  it('shows the profile background behind the profile card, fading into the drawer', () => {
    mockProfileBackground = { path: '/backdrop.jpg', kind: 'backdrop' };
    const { getByTestId } = render(<HomeDrawer visible onClose={mockOnClose} />);

    expect(getByTestId('profile-background').props.background).toEqual(mockProfileBackground);
    expect(getByTestId('profile-background').props.fadeTo).toBe(COLORS.surface);
  });

  it('shows no background without one, or for guests', () => {
    expect(
      render(<HomeDrawer visible onClose={mockOnClose} />).queryByTestId('profile-background')
    ).toBeNull();

    mockProfileBackground = { path: '/backdrop.jpg', kind: 'backdrop' };
    mockAuthState.isGuest = true;
    expect(
      render(<HomeDrawer visible onClose={mockOnClose} />).queryByTestId('profile-background')
    ).toBeNull();
  });

  it('keeps drawer open while signing out and closes after signOut completes', async () => {
    let resolveSignOut: () => void = () => {};
    mockSignOut.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSignOut = () => resolve();
        })
    );

    const { getByText } = render(<HomeDrawer visible onClose={mockOnClose} />);

    fireEvent.press(getByText('Sign Out'));

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockOnClose).not.toHaveBeenCalled();
    expect(getByText('Signing Out...')).toBeTruthy();

    resolveSignOut();

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  it('shows error alert on sign-out failure and still closes drawer', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockSignOut.mockRejectedValueOnce(new Error('sign-out failed'));

    const { getByText } = render(<HomeDrawer visible onClose={mockOnClose} />);

    fireEvent.press(getByText('Sign Out'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Error', 'Sign out failed. Please try again.');
    });

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    alertSpy.mockRestore();
  });

  it('opens the account screen from the profile section, with Settings underneath', () => {
    const { getByTestId } = render(<HomeDrawer visible onClose={mockOnClose} />);

    fireEvent.press(getByTestId('home-drawer-profile'));

    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/profile/account', { withAnchor: true });
  });

  it('navigates to where-to-watch from the drawer card', () => {
    const { getByText } = render(<HomeDrawer visible onClose={mockOnClose} />);

    fireEvent.press(getByText('Where to Watch'));

    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/home/where-to-watch' });
  });

  it('falls back to the email prefix when the auth display name is blank', () => {
    mockAuthState.user = {
      uid: 'user-1',
      displayName: '   ',
      email: 'fallback.user@example.com',
    };

    const { getByText } = render(<HomeDrawer visible onClose={mockOnClose} />);

    expect(getByText('fallback.user')).toBeTruthy();
  });
});
