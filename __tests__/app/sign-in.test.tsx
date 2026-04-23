import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import React from 'react';
import { Alert } from 'react-native';

const mockConfigureGoogleAuth = jest.fn(() => Promise.resolve());
const mockSignInWithGoogle = jest.fn();
const mockSignInAsGuest = jest.fn();
const mockCreateUserDocument = jest.fn((_: unknown) => Promise.resolve());
const mockTrackLogin = jest.fn();
const mockSignInWithEmailAndPassword = jest.fn();
const mockCreateUserWithEmailAndPassword = jest.fn();

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

jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: jest.fn((...args: unknown[]) =>
    mockCreateUserWithEmailAndPassword(...args)
  ),
  signInWithEmailAndPassword: jest.fn((...args: unknown[]) =>
    mockSignInWithEmailAndPassword(...args)
  ),
}));

jest.mock('@/src/firebase/config', () => ({
  auth: {},
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

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff0000' }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import SignIn from '@/app/(auth)/sign-in';

type AlertButton = {
  text?: string;
  style?: string;
  onPress?: () => unknown;
};

function getLastAlertButtons(): AlertButton[] {
  const calls = (Alert.alert as jest.Mock).mock.calls;
  const lastCall = calls[calls.length - 1];
  return (lastCall?.[2] ?? []) as AlertButton[];
}

describe('SignIn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const pressEmailContinue = (getByText: (text: string) => unknown) => {
    fireEvent.press(getByText('auth.continueWithEmailPassword'));
  };

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

  it('shows emailRequired when email is empty', () => {
    const { getByPlaceholderText, getByText } = render(<SignIn />);

    fireEvent.changeText(getByPlaceholderText('auth.password'), 'secret123');
    pressEmailContinue(getByText);

    expect(Alert.alert).toHaveBeenCalledWith('common.error', 'auth.emailRequired');
  });

  it('shows passwordRequired when password is empty', () => {
    const { getByPlaceholderText, getByText } = render(<SignIn />);

    fireEvent.changeText(getByPlaceholderText('auth.email'), 'user@example.com');
    pressEmailContinue(getByText);

    expect(Alert.alert).toHaveBeenCalledWith('common.error', 'auth.passwordRequired');
  });

  it('signs in directly with existing password accounts without checking sign-in methods', async () => {
    (signInWithEmailAndPassword as jest.Mock).mockResolvedValue({
      user: { uid: 'user-1' },
    });

    const { getByPlaceholderText, getByText } = render(<SignIn />);

    fireEvent.changeText(getByPlaceholderText('auth.email'), 'user@example.com');
    fireEvent.changeText(getByPlaceholderText('auth.password'), 'secret123');
    pressEmailContinue(getByText);

    await waitFor(() => {
      expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        'user@example.com',
        'secret123'
      );
    });
    await waitFor(() => {
      expect(mockCreateUserDocument).toHaveBeenCalledWith({ uid: 'user-1' });
    });
    expect(mockTrackLogin).toHaveBeenCalledWith('email');
  });

  it('prompts to create an account when sign-in fails for a missing account', async () => {
    (signInWithEmailAndPassword as jest.Mock).mockRejectedValue({
      code: 'auth/user-not-found',
    });
    (createUserWithEmailAndPassword as jest.Mock).mockResolvedValue({
      user: { uid: 'new-user' },
    });

    const { getByPlaceholderText, getByText } = render(<SignIn />);

    fireEvent.changeText(getByPlaceholderText('auth.email'), '  new-user@example.com  ');
    fireEvent.changeText(getByPlaceholderText('auth.password'), 'secret123');
    pressEmailContinue(getByText);

    await waitFor(() => {
      expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        'new-user@example.com',
        'secret123'
      );
    });
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'auth.emailCreateAccountTitle',
        'auth.emailCreateAccountMessage',
        expect.any(Array)
      );
    });
    expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();

    const confirmButton = getLastAlertButtons().find(
      (button) => button.text === 'auth.createAccount'
    );
    if (!confirmButton?.onPress) {
      throw new Error('Expected create account confirm button');
    }

    await act(async () => {
      await confirmButton.onPress?.();
    });

    await waitFor(() => {
      expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        'new-user@example.com',
        'secret123'
      );
    });
    await waitFor(() => {
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'hasCompletedPersonalOnboarding:new-user',
        'false'
      );
    });
    await waitFor(() => {
      expect(mockCreateUserDocument).toHaveBeenCalledWith({ uid: 'new-user' });
    });
    expect(mockTrackLogin).toHaveBeenCalledWith('email');
  });

  it('prompts to create an account when sign-in fails with invalid-credential', async () => {
    (signInWithEmailAndPassword as jest.Mock).mockRejectedValue({
      code: 'auth/invalid-credential',
    });
    (createUserWithEmailAndPassword as jest.Mock).mockResolvedValue({
      user: { uid: 'new-user' },
    });

    const { getByPlaceholderText, getByText } = render(<SignIn />);

    fireEvent.changeText(getByPlaceholderText('auth.email'), 'brand-new@example.com');
    fireEvent.changeText(getByPlaceholderText('auth.password'), 'secret123');
    pressEmailContinue(getByText);

    await waitFor(() => {
      expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        'brand-new@example.com',
        'secret123'
      );
    });
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'auth.emailCreateAccountTitle',
        'auth.emailCreateAccountMessage',
        expect.any(Array)
      );
    });
    expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();

    const confirmButton = getLastAlertButtons().find(
      (button) => button.text === 'auth.createAccount'
    );
    if (!confirmButton?.onPress) {
      throw new Error('Expected create account confirm button');
    }

    await act(async () => {
      await confirmButton.onPress?.();
    });

    await waitFor(() => {
      expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        'brand-new@example.com',
        'secret123'
      );
    });
    await waitFor(() => {
      expect(mockCreateUserDocument).toHaveBeenCalledWith({ uid: 'new-user' });
    });
    expect(mockTrackLogin).toHaveBeenCalledWith('email');
  });

  it('shows invalid credentials when sign-in fails with wrong password', async () => {
    (signInWithEmailAndPassword as jest.Mock).mockRejectedValue({
      code: 'auth/wrong-password',
    });

    const { getByPlaceholderText, getByText } = render(<SignIn />);

    fireEvent.changeText(getByPlaceholderText('auth.email'), 'user@example.com');
    fireEvent.changeText(getByPlaceholderText('auth.password'), 'secret123');
    pressEmailContinue(getByText);

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('auth.signInFailed', 'auth.invalidCredentials');
    });

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();
    expect(mockTrackLogin).not.toHaveBeenCalled();
  });

  it('shows the existing-account alert when account creation is rejected as already in use', async () => {
    (signInWithEmailAndPassword as jest.Mock).mockRejectedValue({
      code: 'auth/user-not-found',
    });
    (createUserWithEmailAndPassword as jest.Mock).mockRejectedValue({
      code: 'auth/email-already-in-use',
    });

    const { getByPlaceholderText, getByText } = render(<SignIn />);

    fireEvent.changeText(getByPlaceholderText('auth.email'), 'user@example.com');
    fireEvent.changeText(getByPlaceholderText('auth.password'), 'secret123');
    pressEmailContinue(getByText);

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'auth.emailCreateAccountTitle',
        'auth.emailCreateAccountMessage',
        expect.any(Array)
      );
    });

    const confirmButton = getLastAlertButtons().find(
      (button) => button.text === 'auth.createAccount'
    );
    if (!confirmButton?.onPress) {
      throw new Error('Expected create account confirm button');
    }

    await act(async () => {
      await confirmButton.onPress?.();
    });

    await waitFor(() => {
      expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        'user@example.com',
        'secret123'
      );
    });

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'auth.emailAlreadyInUseTitle',
        'auth.emailAlreadyInUseMessage'
      );
    });

    expect(mockCreateUserDocument).not.toHaveBeenCalled();
    expect(mockTrackLogin).not.toHaveBeenCalled();
  });

  it('shows an error when sign-in is rate limited', async () => {
    (signInWithEmailAndPassword as jest.Mock).mockRejectedValue({
      code: 'auth/too-many-requests',
    });

    const { getByPlaceholderText, getByText } = render(<SignIn />);

    fireEvent.changeText(getByPlaceholderText('auth.email'), 'user@example.com');
    fireEvent.changeText(getByPlaceholderText('auth.password'), 'secret123');
    pressEmailContinue(getByText);

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('auth.signInFailed', 'auth.tooManyAttempts');
    });
    expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();
    expect(mockTrackLogin).not.toHaveBeenCalled();
  });
});
