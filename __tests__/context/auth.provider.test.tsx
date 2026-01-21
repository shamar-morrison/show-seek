import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import React from 'react';

// Capture the auth state callback so we can trigger it in tests
let capturedAuthCallback: ((user: any) => void) | null = null;
const mockUnsubscribe = jest.fn();

// Mock firebase/auth
jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn((auth, callback) => {
    capturedAuthCallback = callback;
    return mockUnsubscribe;
  }),
  signOut: jest.fn(),
}));

// Mock the firebase config
jest.mock('@/src/firebase/config', () => ({
  auth: { currentUser: null },
}));

// Import after mocks are set up
import { AuthProvider, useAuth } from '@/src/context/auth';

describe('AuthProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedAuthCallback = null;
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  );

  describe('auth state subscription', () => {
    it('should update user state when onAuthStateChanged fires with user', async () => {
      const mockUser = { uid: 'test-user-123', email: 'test@example.com' };

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Initially loading should be true
      expect(result.current.loading).toBe(true);

      // Simulate auth state change with a user
      await act(async () => {
        capturedAuthCallback?.(mockUser);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.user).toEqual(mockUser);
    });

    it('should update user state to null when user signs out', async () => {
      const mockUser = { uid: 'test-user-123', email: 'test@example.com' };

      const { result } = renderHook(() => useAuth(), { wrapper });

      // First, simulate user being logged in
      await act(async () => {
        capturedAuthCallback?.(mockUser);
      });

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
      });

      // Now simulate sign out
      await act(async () => {
        capturedAuthCallback?.(null);
      });

      expect(result.current.user).toBeNull();
    });

    it('should set up onAuthStateChanged subscription on mount', () => {
      renderHook(() => useAuth(), { wrapper });

      expect(onAuthStateChanged).toHaveBeenCalledTimes(1);
    });

    it('should return unsubscribe function for cleanup', () => {
      const { unmount } = renderHook(() => useAuth(), { wrapper });

      unmount();

      // The unsubscribe should be called on unmount
      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });

  describe('signOut function', () => {
    it('should call firebaseSignOut when signOut is invoked', async () => {
      (firebaseSignOut as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Wait for initial loading to complete
      await act(async () => {
        capturedAuthCallback?.(null);
      });

      await act(async () => {
        await result.current.signOut();
      });

      expect(firebaseSignOut).toHaveBeenCalled();
    });

    it('should handle signOut errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (firebaseSignOut as jest.Mock).mockRejectedValue(new Error('Sign out failed'));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        capturedAuthCallback?.(null);
      });

      // Should not throw
      await act(async () => {
        await result.current.signOut();
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('onboarding status', () => {
    it('should read onboarding status from AsyncStorage on mount', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('true');

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        capturedAuthCallback?.(null);
      });

      await waitFor(() => {
        expect(result.current.hasCompletedOnboarding).toBe(true);
      });

      expect(AsyncStorage.getItem).toHaveBeenCalledWith('hasCompletedOnboarding');
    });

    it('should default hasCompletedOnboarding to false when not stored', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        capturedAuthCallback?.(null);
      });

      await waitFor(() => {
        expect(result.current.hasCompletedOnboarding).toBe(false);
      });
    });

    it('should update hasCompletedOnboarding and persist when completeOnboarding is called', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        capturedAuthCallback?.(null);
      });

      await act(async () => {
        await result.current.completeOnboarding();
      });

      expect(result.current.hasCompletedOnboarding).toBe(true);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('hasCompletedOnboarding', 'true');
    });

    it('should handle AsyncStorage read errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Storage error'));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        capturedAuthCallback?.(null);
      });

      await waitFor(() => {
        // Should default to false on error
        expect(result.current.hasCompletedOnboarding).toBe(false);
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
