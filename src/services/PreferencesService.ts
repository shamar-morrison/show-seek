import { getFirestoreErrorMessage } from '@/src/firebase/firestore';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { DEFAULT_PREFERENCES, UserPreferences } from '../types/preferences';

class PreferencesService {
  private getUserDocRef(userId: string) {
    return doc(db, 'users', userId);
  }

  /**
   * Subscribe to user preferences with real-time updates
   * Returns DEFAULT_PREFERENCES if preferences don't exist
   */
  subscribeToPreferences(
    callback: (preferences: UserPreferences) => void,
    onError?: (error: Error) => void
  ) {
    const user = auth.currentUser;
    if (!user) {
      callback(DEFAULT_PREFERENCES);
      return () => {};
    }

    const userRef = this.getUserDocRef(user.uid);

    return onSnapshot(
      userRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          const preferences: UserPreferences = {
            autoAddToWatching:
              data?.preferences?.autoAddToWatching ?? DEFAULT_PREFERENCES.autoAddToWatching,
            autoAddToAlreadyWatched:
              data?.preferences?.autoAddToAlreadyWatched ??
              DEFAULT_PREFERENCES.autoAddToAlreadyWatched,
            blurPlotSpoilers:
              data?.preferences?.blurPlotSpoilers ?? DEFAULT_PREFERENCES.blurPlotSpoilers,
            showListIndicators:
              data?.preferences?.showListIndicators ?? DEFAULT_PREFERENCES.showListIndicators,
            homeScreenLists: data?.preferences?.homeScreenLists,
            quickMarkAsWatched:
              data?.preferences?.quickMarkAsWatched ?? DEFAULT_PREFERENCES.quickMarkAsWatched,
            defaultLaunchScreen:
              data?.preferences?.defaultLaunchScreen ?? DEFAULT_PREFERENCES.defaultLaunchScreen,
          };

          callback(preferences);
        } else {
          // User document doesn't exist yet, use defaults
          callback(DEFAULT_PREFERENCES);
        }
      },
      (error) => {
        console.error('[PreferencesService] Subscription error:', error);
        const message = getFirestoreErrorMessage(error);
        if (onError) {
          onError(new Error(message));
        }
        // Graceful degradation: return defaults on error
        callback(DEFAULT_PREFERENCES);
      }
    );
  }

  /**
   * Update a single preference value using merge
   * This preserves other preferences and user document fields
   */
  async updatePreference<K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ): Promise<void> {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Please sign in to continue');

      const userRef = this.getUserDocRef(user.uid);

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 10000);
      });

      await Promise.race([
        setDoc(
          userRef,
          {
            preferences: {
              [key]: value,
            },
          },
          { merge: true }
        ),
        timeoutPromise,
      ]);
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[PreferencesService] updatePreference error:', error);
      throw new Error(message);
    }
  }

  /**
   * Get current preferences synchronously from cache
   * Returns defaults if not available
   */
  async getPreferences(): Promise<UserPreferences> {
    return new Promise((resolve) => {
      const unsubscribe = this.subscribeToPreferences((prefs) => {
        // Use microtask to ensure unsubscribe is defined before calling it
        // (handles case where subscribeToPreferences calls callback synchronously)
        Promise.resolve().then(() => {
          unsubscribe();
          resolve(prefs);
        });
      });
    });
  }
}

export const preferencesService = new PreferencesService();
