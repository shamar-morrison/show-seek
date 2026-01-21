import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

// Mock the auth context
const mockSignInWithEmail = jest.fn();
const mockSignOut = jest.fn();

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    signInWithEmail: mockSignInWithEmail,
    signOut: mockSignOut,
    isGuest: false,
  }),
}));

// Create a minimal mock sign-in component for integration testing
function MockSignInForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    try {
      await mockSignInWithEmail(email, password);
    } catch (err) {
      setError('Sign in failed');
    }
  };

  return (
    <View>
      <TextInput
        testID="email-input"
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        autoCapitalize="none"
      />
      <TextInput
        testID="password-input"
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
      />
      <TouchableOpacity testID="sign-in-button" onPress={handleSubmit}>
        <Text>Sign In</Text>
      </TouchableOpacity>
      {error && <Text testID="error-message">{error}</Text>}
    </View>
  );
}

describe('Auth Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignInWithEmail.mockResolvedValue(undefined);
  });

  describe('Sign In Flow', () => {
    it('should call signInWithEmail with email and password', async () => {
      const { getByTestId } = render(<MockSignInForm />);

      const emailInput = getByTestId('email-input');
      const passwordInput = getByTestId('password-input');
      const signInButton = getByTestId('sign-in-button');

      fireEvent.changeText(emailInput, 'test@example.com');
      fireEvent.changeText(passwordInput, 'password123');
      fireEvent.press(signInButton);

      await waitFor(() => {
        expect(mockSignInWithEmail).toHaveBeenCalledWith('test@example.com', 'password123');
      });
    });

    it('should call signInWithEmail exactly once per submission', async () => {
      const { getByTestId } = render(<MockSignInForm />);

      const emailInput = getByTestId('email-input');
      const passwordInput = getByTestId('password-input');
      const signInButton = getByTestId('sign-in-button');

      fireEvent.changeText(emailInput, 'user@test.com');
      fireEvent.changeText(passwordInput, 'secret');
      fireEvent.press(signInButton);

      await waitFor(() => {
        expect(mockSignInWithEmail).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle sign in errors gracefully', async () => {
      mockSignInWithEmail.mockRejectedValue(new Error('Invalid credentials'));

      const { getByTestId, findByTestId } = render(<MockSignInForm />);

      fireEvent.changeText(getByTestId('email-input'), 'bad@email.com');
      fireEvent.changeText(getByTestId('password-input'), 'wrong');
      fireEvent.press(getByTestId('sign-in-button'));

      const errorMessage = await findByTestId('error-message');
      expect(errorMessage).toBeTruthy();
    });

    it('should handle empty credentials submission', async () => {
      const { getByTestId } = render(<MockSignInForm />);

      const signInButton = getByTestId('sign-in-button');
      fireEvent.press(signInButton);

      await waitFor(() => {
        expect(mockSignInWithEmail).toHaveBeenCalledWith('', '');
      });
    });
  });
});
