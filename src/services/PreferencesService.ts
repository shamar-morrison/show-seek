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
            hideWatchedContent:
              data?.preferences?.hideWatchedContent ?? DEFAULT_PREFERENCES.hideWatchedContent,
            hideUnreleasedContent:
              data?.preferences?.hideUnreleasedContent ?? DEFAULT_PREFERENCES.hideUnreleasedContent,
            markPreviousEpisodesWatched:
              data?.preferences?.markPreviousEpisodesWatched ??
              DEFAULT_PREFERENCES.markPreviousEpisodesWatched,
            hideTabLabels: data?.preferences?.hideTabLabels ?? DEFAULT_PREFERENCES.hideTabLabels,
            dataSaver: data?.preferences?.dataSaver ?? DEFAULT_PREFERENCES.dataSaver,
            // Onboarding-related fields
            // For onboardingCompleted: if undefined and user has no preferences at all, use default (false)
            // This distinguishes new users (no preferences) from existing users (have other preferences but no onboardingCompleted)
            onboardingCompleted:
              data?.preferences?.onboardingCompleted ??
              (data?.preferences ? undefined : DEFAULT_PREFERENCES.onboardingCompleted),
            favoriteGenres: data?.preferences?.favoriteGenres ?? DEFAULT_PREFERENCES.favoriteGenres,
            watchProviders: data?.preferences?.watchProviders ?? DEFAULT_PREFERENCES.watchProviders,
            preferredContentTypes:
              data?.preferences?.preferredContentTypes ?? DEFAULT_PREFERENCES.preferredContentTypes,
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
   * Remove undefined values from an object to make it Firestore-compatible
   * Firestore doesn't accept undefined values - they must be omitted entirely
   */
  private sanitizeForFirestore<T extends Record<string, any>>(obj: T): Partial<T> {
    const sanitized: any = {};
    Object.keys(obj).forEach((key) => {
      if (obj[key] !== undefined) {
        sanitized[key] = obj[key];
      }
    });
    return sanitized;
  }

  /**
   * Update multiple preferences at once using merge
   * This is more efficient than calling updatePreference multiple times
   */
  async updatePreferences(preferences: Partial<UserPreferences>): Promise<void> {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Please sign in to continue');

      const userRef = this.getUserDocRef(user.uid);

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 10000);
      });

      // Sanitize to remove undefined values that Firestore rejects
      const sanitizedPreferences = this.sanitizeForFirestore(preferences);

      await Promise.race([
        setDoc(
          userRef,
          {
            preferences: sanitizedPreferences,
          },
          { merge: true }
        ),
        timeoutPromise,
      ]);
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[PreferencesService] updatePreferences error:', error);
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
