import { auth, db } from '@/src/firebase/config';
import { signOutGoogle } from '@/src/firebase/auth';
import { READ_OPTIMIZATION_FLAGS } from '@/src/config/readOptimization';
import {
  getPersonalOnboardingCacheKey,
  persistPersonalOnboardingCache,
} from '@/src/utils/personalOnboardingCache';
import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean | null>(null);
  // Tri-state: null = unresolved (loading/timeout), true = completed, false = not completed.
  // Mirrors PremiumContext's cachedPremiumStatus pattern.
  // The router must only redirect to personalized onboarding on explicit `false`, never on `null`.
  const [hasCompletedPersonalOnboarding, setHasCompletedPersonalOnboarding] = useState<
    boolean | null
  >(null);
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

  const persistPersonalOnboardingState = (userId: string, value: boolean) => {
    persistPersonalOnboardingCache(userId, value).catch((error) => {
      console.error('Error persisting personal onboarding state', error);
    });
  };

  const resetSession = () => {
    clearPersistedUserId();
    setUser(null);
    setHasCompletedPersonalOnboarding(null);
    setLoading(false);
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
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        resetSession();
        return;
      }

      persistUserId(currentUser.uid);
      setUser(currentUser);

      if (currentUser.isAnonymous) {
        setHasCompletedPersonalOnboarding(true);
        setLoading(false);
        return;
      }

      // Mirror PremiumContext's null-on-unresolved pattern.
      // null = "not yet determined" — prevents the router from acting on a stale default.
      // Only set false when Firestore has been successfully read and explicitly returned false.
      setHasCompletedPersonalOnboarding(null);
      setLoading(true);

      const uid = currentUser.uid;
      const isCurrentSession = () => isMounted && auth.currentUser?.uid === uid;
      const personalOnboardingCacheKey = getPersonalOnboardingCacheKey(uid);
      let hasCachedPersonalOnboarding = false;

      try {
        const cachedValue = await AsyncStorage.getItem(personalOnboardingCacheKey);
        if (cachedValue !== null && isCurrentSession()) {
          hasCachedPersonalOnboarding = true;
          setHasCompletedPersonalOnboarding(cachedValue === 'true');
          setLoading(false);
        }
      } catch (error) {
        console.error('Error reading personal onboarding cache', error);
      }

      // Check personal onboarding status from Firestore (with one retry on timeout).
      // Mirrors PremiumContext's null-on-miss/timeout pattern to prevent defaulting to false
      // and incorrectly routing existing users through onboarding.
      // NOTE: initTimeoutMs is currently 3s — tight on cold start over slow networks.
      // Consider increasing separately if timeouts remain frequent.
      const fetchWithTimeout = () => {
        let tid: ReturnType<typeof setTimeout> | null = null;
        const tp = new Promise<never>((_, reject) => {
          tid = setTimeout(() => {
            reject(new Error('Personal onboarding check timed out'));
          }, READ_OPTIMIZATION_FLAGS.initTimeoutMs);
        });
        return Promise.race([getDoc(doc(db, 'users', uid)), tp]).finally(() => {
          if (tid) clearTimeout(tid);
        });
      };

      try {
        let userDoc: Awaited<ReturnType<typeof fetchWithTimeout>>;
        try {
          userDoc = await fetchWithTimeout();
        } catch {
          // Retry once — initTimeoutMs (3s) may be too tight on cold start.
          userDoc = await fetchWithTimeout();
        }
        if (!isCurrentSession()) {
          return;
        }
        const userData = userDoc.data() as Record<string, unknown> | undefined;
        const hasCompletedPersonalOnboarding = userData?.hasCompletedPersonalOnboarding === true;
        setHasCompletedPersonalOnboarding(hasCompletedPersonalOnboarding);
        persistPersonalOnboardingState(uid, hasCompletedPersonalOnboarding);
      } catch (e) {
        if (!isCurrentSession()) {
          return;
        }
        console.warn(
          hasCachedPersonalOnboarding
            ? '[Auth] Personal onboarding check failed, keeping cached state:'
            : '[Auth] Personal onboarding check failed after retry, leaving unresolved (null):',
          e
        );
        // Mirror PremiumContext: leave as null (unresolved) on failure without cache.
        // null prevents the router from redirecting to onboarding incorrectly.
        // AsyncStorage is NOT written here — next launch will retry from scratch.
        if (!hasCachedPersonalOnboarding) {
          setHasCompletedPersonalOnboarding(null);
        }
      } finally {
        if (isCurrentSession() && !hasCachedPersonalOnboarding) {
          setLoading(false);
        }
      }
    });
    return () => {
      isMounted = false;
      unsubscribe();
    };
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
        resetSession();
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
    })().finally(() => {
      signOutInFlight.current = null;
    });

    signOutInFlight.current = signOutPromise;
    return signOutPromise;
  };

  const completeOnboarding = async () => {
    await AsyncStorage.setItem('hasCompletedOnboarding', 'true');
    setHasCompletedOnboarding(true);
  };

  const completePersonalOnboarding = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return;
    }

    if (currentUser.isAnonymous) {
      setHasCompletedPersonalOnboarding(true);
      return;
    }

    try {
      await setDoc(
        doc(db, 'users', currentUser.uid),
        { hasCompletedPersonalOnboarding: true },
        { merge: true }
      );
      persistPersonalOnboardingState(currentUser.uid, true);
      setHasCompletedPersonalOnboarding(true);
    } catch (e) {
      console.error('[Auth] Failed to persist personal onboarding completion:', e);
      throw e;
    }
  };

  return {
    user,
    isGuest: !!user?.isAnonymous,
    loading,
    hasCompletedOnboarding,
    hasCompletedPersonalOnboarding,
    completeOnboarding,
    completePersonalOnboarding,
    resetSession,
    signOut,
  };
});
