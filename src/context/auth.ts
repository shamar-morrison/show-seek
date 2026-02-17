import { auth } from '@/src/firebase/config';
import { signOutGoogle } from '@/src/firebase/auth';
import { READ_OPTIMIZATION_FLAGS } from '@/src/config/readOptimization';
import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';
import { useEffect, useRef, useState } from 'react';

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean | null>(null);
  const signOutInFlight = useRef<Promise<void> | null>(null);

  const persistUserId = (userId: string) => {
    AsyncStorage.setItem('userId', userId).catch((error) => {
      console.error('Error persisting userId', error);
    });
  };

  const clearPersistedUserId = () => {
    AsyncStorage.removeItem('userId').catch((error) => {
      console.error('Error clearing persisted userId', error);
    });
  };

  // Check onboarding status
  useEffect(() => {
    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const checkOnboarding = async () => {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Onboarding status check timed out'));
        }, READ_OPTIMIZATION_FLAGS.initTimeoutMs);
      });

      try {
        const value = (await Promise.race([
          AsyncStorage.getItem('hasCompletedOnboarding'),
          timeoutPromise,
        ])) as string | null;

        if (!isMounted) return;
        setHasCompletedOnboarding(value === 'true');
      } catch (e) {
        console.error('[Auth] Onboarding check failed, defaulting to false:', e);
        if (isMounted) {
          setHasCompletedOnboarding(false);
        }
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      }
    };

    void checkOnboarding();

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  // Hydrate persisted userId for diagnostics/metadata only.
  // Firebase auth state listener remains the source of truth for `user`.
  useEffect(() => {
    const hydratePersistedUserId = async () => {
      try {
        await AsyncStorage.getItem('userId');
      } catch (error) {
        console.error('Error reading persisted userId', error);
      }
    };

    hydratePersistedUserId();
  }, []);

  // Monitor auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        clearPersistedUserId();
        setUser(null);
        setLoading(false);
        return;
      }

      persistUserId(currentUser.uid);
      setUser(currentUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signOut = async () => {
    if (signOutInFlight.current) {
      return signOutInFlight.current;
    }

    const signOutPromise = (async () => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Sign out timed out'));
        }, 10000);
      });
      let timedOut = false;

      let signOutError: unknown = null;

      try {
        const firebasePromise = firebaseSignOut(auth);
        const guardedFirebasePromise = firebasePromise.catch((error) => {
          if (timedOut) {
            console.warn('Late firebase signOut rejection after timeout:', error);
            return;
          }
          throw error;
        });

        await Promise.race([guardedFirebasePromise, timeoutPromise]);
        // Clear local state immediately after Firebase sign-out succeeds.
        setUser(null);
        setLoading(false);
      } catch (error) {
        timedOut = error instanceof Error && error.message === 'Sign out timed out';
        signOutError = error;
        console.error('Error signing out:', error);
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        // Always clear native Google session so cached credentials are reset.
        try {
          await signOutGoogle();
        } catch (error) {
          console.warn('Error signing out from Google:', error);
        }
      }

      if (signOutError) {
        throw signOutError;
      }
    })()
      .finally(() => {
        signOutInFlight.current = null;
      });

    signOutInFlight.current = signOutPromise;
    return signOutPromise;
  };

  const completeOnboarding = async () => {
    await AsyncStorage.setItem('hasCompletedOnboarding', 'true');
    setHasCompletedOnboarding(true);
  };

  return {
    user,
    isGuest: !!user?.isAnonymous,
    loading,
    hasCompletedOnboarding,
    completeOnboarding,
    signOut,
  };
});
