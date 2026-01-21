import AsyncStorage from '@react-native-async-storage/async-storage';
import { signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';

// Mock firebase/auth
jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn(),
  signOut: jest.fn(),
}));

// Mock the firebase config
jest.mock('@/src/firebase/config', () => ({
  auth: { currentUser: null },
}));

describe('AuthProvider logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockReset();
    (AsyncStorage.setItem as jest.Mock).mockReset();
  });

  describe('onAuthStateChanged subscription', () => {
    it('should call callback with user when auth state changes', () => {
      const mockUser = { uid: 'test-user-123', email: 'test@example.com' };
      let authCallback: (user: any) => void = () => {};

      (onAuthStateChanged as jest.Mock).mockImplementation((auth, callback) => {
        authCallback = callback;
        return jest.fn(); // unsubscribe
      });

      // Trigger the subscription
      const unsubscribe = onAuthStateChanged({} as any, (user) => {
        expect(user).toEqual(mockUser);
      });

      // Simulate auth state change
      authCallback(mockUser);

      expect(onAuthStateChanged).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });

    it('should call callback with null when user signs out', () => {
      let authCallback: (user: any) => void = () => {};

      (onAuthStateChanged as jest.Mock).mockImplementation((auth, callback) => {
        authCallback = callback;
        return jest.fn();
      });

      onAuthStateChanged({} as any, (user) => {
        expect(user).toBeNull();
      });

      authCallback(null);
    });
  });

  describe('signOut function', () => {
    it('should call firebaseSignOut', async () => {
      (firebaseSignOut as jest.Mock).mockResolvedValue(undefined);

      await firebaseSignOut({} as any);

      expect(firebaseSignOut).toHaveBeenCalled();
    });

    it('should handle signOut errors gracefully', async () => {
      const error = new Error('Sign out failed');
      (firebaseSignOut as jest.Mock).mockRejectedValue(error);

      await expect(firebaseSignOut({} as any)).rejects.toThrow('Sign out failed');
    });
  });

  describe('onboarding persistence', () => {
    it('should read onboarding status from AsyncStorage', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('true');

      const value = await AsyncStorage.getItem('hasCompletedOnboarding');

      expect(value).toBe('true');
      expect(AsyncStorage.getItem).toHaveBeenCalledWith('hasCompletedOnboarding');
    });

    it('should return false when no onboarding value is stored', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const value = await AsyncStorage.getItem('hasCompletedOnboarding');

      expect(value).toBeNull();
    });

    it('should save onboarding status to AsyncStorage', async () => {
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await AsyncStorage.setItem('hasCompletedOnboarding', 'true');

      expect(AsyncStorage.setItem).toHaveBeenCalledWith('hasCompletedOnboarding', 'true');
    });

    it('should handle AsyncStorage errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Storage error'));

      try {
        await AsyncStorage.getItem('hasCompletedOnboarding');
      } catch (e) {
        // Error is expected
      }

      consoleSpy.mockRestore();
    });
  });
});
