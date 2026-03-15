import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

const mockConfigureGoogleAuth = jest.fn(() => Promise.resolve());
const mockSignInWithGoogle = jest.fn();
const mockSignInAsGuest = jest.fn();
const mockCreateUserDocument = jest.fn((_: unknown) => Promise.resolve());
const mockTrackLogin = jest.fn();

jest.mock('@/src/firebase/auth', () => ({
  configureGoogleAuth: () => mockConfigureGoogleAuth(),
  signInAsGuest: () => mockSignInAsGuest(),
  signInWithGoogle: () => mockSignInWithGoogle(),
}));

jest.mock('@/src/firebase/user', () => ({
  createUserDocument: (user: unknown) => mockCreateUserDocument(user),
}));

jest.mock('@/src/services/analytics', () => ({
  trackLogin: (...args: unknown[]) => mockTrackLogin(...args),
}));

jest.mock('@/src/components/auth/AnimatedBackground', () => ({
  AnimatedBackground: () => null,
}));

jest.mock('expo-image', () => ({
  Image: 'Image',
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff0000' }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import SignIn from '@/app/(auth)/sign-in';

describe('SignIn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('tracks Google login after a successful sign-in', async () => {
    const user = { uid: 'user-1' };
    mockSignInWithGoogle.mockResolvedValue({ success: true, user });

    const { getByText } = render(<SignIn />);

    fireEvent.press(getByText('auth.google'));

    await waitFor(() => {
      expect(mockCreateUserDocument).toHaveBeenCalledWith(user);
    });
    await waitFor(() => {
      expect(mockTrackLogin).toHaveBeenCalledWith('google');
    });
  });

  it('tracks guest login after a successful guest sign-in', async () => {
    mockSignInAsGuest.mockResolvedValue({ success: true, user: { uid: 'guest-1' } });

    const { getByText } = render(<SignIn />);

    fireEvent.press(getByText('auth.continueAsGuest'));

    await waitFor(() => {
      expect(mockSignInAsGuest).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(mockTrackLogin).toHaveBeenCalledWith('guest');
    });
  });
});
