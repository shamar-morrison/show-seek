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

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({
    user: { uid: 'user-1', displayName: 'Test User', email: 'test@example.com' },
    signOut: mockSignOut,
  }),
}));

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => ({ isPremium: false }),
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

import { HomeDrawer } from '@/src/components/HomeDrawer';

describe('HomeDrawer sign out flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
