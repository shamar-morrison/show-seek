import { auth } from '@/src/firebase/config';
import { signOutGoogle } from '@/src/firebase/auth';
import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';
import { useEffect, useRef, useState } from 'react';

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean | null>(null);
  const isCleaningAnonymousUser = useRef(false);
  const signOutInFlight = useRef<Promise<void> | null>(null);

  // Check onboarding status
  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const value = await AsyncStorage.getItem('hasCompletedOnboarding');
        setHasCompletedOnboarding(value === 'true');
      } catch (e) {
        console.error('Error reading onboarding status', e);
        setHasCompletedOnboarding(false);
      }
    };
    checkOnboarding();
  }, []);

  // Monitor auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      // Guest mode has been removed. Treat anonymous users as signed out.
      if (currentUser?.isAnonymous) {
        setUser(null);
        setLoading(false);

        if (!isCleaningAnonymousUser.current) {
          isCleaningAnonymousUser.current = true;
          firebaseSignOut(auth)
            .catch((error) => {
              console.error('Error clearing anonymous session:', error);
            })
            .finally(() => {
              isCleaningAnonymousUser.current = false;
            });
        }
        return;
      }

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
    loading,
    hasCompletedOnboarding,
    completeOnboarding,
    signOut,
  };
});
