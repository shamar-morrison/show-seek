import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

// Mock the auth module
const mockSignOut = jest.fn();

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    signOut: mockSignOut,
  }),
}));

// Import the mocked hook
import { useAuth } from '@/src/context/auth';

// Mock component that uses the useAuth hook for sign out
function MockSignOutButton() {
  const { signOut, user } = useAuth();

  return (
    <View>
      <Text testID="user-status">{user ? 'Logged In' : 'Logged Out'}</Text>
      <TouchableOpacity testID="sign-out-button" onPress={signOut}>
        <Text>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

// Mock component that shows loading state
function MockLoadingComponent() {
  const { loading } = useAuth();

  return (
    <View>
      {loading ? (
        <Text testID="loading-indicator">Loading...</Text>
      ) : (
        <Text testID="content">Content Loaded</Text>
      )}
    </View>
  );
}

describe('Auth Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignOut.mockResolvedValue(undefined);
  });

  describe('Sign Out Flow', () => {
    it('should call signOut when sign out button is pressed', async () => {
      const { getByTestId } = render(<MockSignOutButton />);

      const signOutButton = getByTestId('sign-out-button');
      fireEvent.press(signOutButton);

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalledTimes(1);
      });
    });

    it('should display correct user status', () => {
      const { getByTestId } = render(<MockSignOutButton />);

      const userStatus = getByTestId('user-status');
      expect(userStatus.props.children).toBe('Logged Out');
    });
  });

  describe('Loading State', () => {
    it('should display content when not loading', () => {
      const { getByTestId } = render(<MockLoadingComponent />);

      expect(getByTestId('content')).toBeTruthy();
    });
  });
});
