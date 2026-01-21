import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

// Mock the auth module
const mockSignOut = jest.fn();
const mockCompleteOnboarding = jest.fn();

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    hasCompletedOnboarding: false,
    completeOnboarding: mockCompleteOnboarding,
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

// Mock component that uses the useAuth hook for onboarding
function MockOnboardingComponent() {
  const { hasCompletedOnboarding, completeOnboarding } = useAuth();

  return (
    <View>
      <Text testID="onboarding-status">
        {hasCompletedOnboarding ? 'Completed' : 'Not Completed'}
      </Text>
      <TouchableOpacity testID="complete-onboarding-button" onPress={completeOnboarding}>
        <Text>Complete Onboarding</Text>
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
    mockCompleteOnboarding.mockResolvedValue(undefined);
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

  describe('Onboarding Flow', () => {
    it('should call completeOnboarding when button is pressed', async () => {
      const { getByTestId } = render(<MockOnboardingComponent />);

      const completeButton = getByTestId('complete-onboarding-button');
      fireEvent.press(completeButton);

      await waitFor(() => {
        expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1);
      });
    });

    it('should display correct onboarding status', () => {
      const { getByTestId } = render(<MockOnboardingComponent />);

      const onboardingStatus = getByTestId('onboarding-status');
      expect(onboardingStatus.props.children).toBe('Not Completed');
    });
  });

  describe('Loading State', () => {
    it('should display content when not loading', () => {
      const { getByTestId } = render(<MockLoadingComponent />);

      expect(getByTestId('content')).toBeTruthy();
    });
  });
});
