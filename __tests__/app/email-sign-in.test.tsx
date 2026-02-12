import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import React from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';

jest.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: jest.fn(),
}));

jest.mock('@/src/firebase/config', () => ({
  auth: {},
}));

jest.mock('@/src/components/auth/AnimatedBackground', () => ({
  AnimatedBackground: () => null,
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

import EmailSignIn from '@/app/(auth)/email-sign-in';

describe('EmailSignIn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const pressPrimarySignIn = (getAllByText: (text: string) => any[]) => {
    const nodes = getAllByText('auth.signIn');
    fireEvent.press(nodes[nodes.length - 1]);
  };

  it('shows emailRequired when email is empty', () => {
    const { getByPlaceholderText, getAllByText } = render(<EmailSignIn />);

    fireEvent.changeText(getByPlaceholderText('auth.password'), 'secret123');
    pressPrimarySignIn(getAllByText);

    expect(Alert.alert).toHaveBeenCalledWith('common.error', 'auth.emailRequired');
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('shows passwordRequired when password is empty', () => {
    const { getByPlaceholderText, getAllByText } = render(<EmailSignIn />);

    fireEvent.changeText(getByPlaceholderText('auth.email'), 'user@example.com');
    pressPrimarySignIn(getAllByText);

    expect(Alert.alert).toHaveBeenCalledWith('common.error', 'auth.passwordRequired');
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('maps auth/too-many-requests to auth.tooManyAttempts', async () => {
    (signInWithEmailAndPassword as jest.Mock).mockRejectedValue({
      code: 'auth/too-many-requests',
    });

    const { getByPlaceholderText, getAllByText } = render(<EmailSignIn />);

    fireEvent.changeText(getByPlaceholderText('auth.email'), 'user@example.com');
    fireEvent.changeText(getByPlaceholderText('auth.password'), 'secret123');
    pressPrimarySignIn(getAllByText);

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('auth.signInFailed', 'auth.tooManyAttempts');
    });
  });
});
