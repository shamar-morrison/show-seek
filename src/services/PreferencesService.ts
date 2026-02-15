import { getFirestoreErrorMessage } from '@/src/firebase/firestore';
import { auditedGetDoc, auditedOnSnapshot } from '@/src/services/firestoreReadAudit';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { DEFAULT_PREFERENCES, UserPreferences } from '../types/preferences';

class PreferencesService {
  private getUserDocRef(userId: string) {
    return doc(db, 'users', userId);
  }

  private mapPreferencesFromUserDoc(data?: Record<string, any>): UserPreferences {
    return {
      autoAddToWatching:
        data?.preferences?.autoAddToWatching ?? DEFAULT_PREFERENCES.autoAddToWatching,
      autoAddToAlreadyWatched:
        data?.preferences?.autoAddToAlreadyWatched ?? DEFAULT_PREFERENCES.autoAddToAlreadyWatched,
      blurPlotSpoilers: data?.preferences?.blurPlotSpoilers ?? DEFAULT_PREFERENCES.blurPlotSpoilers,
      showListIndicators:
        data?.preferences?.showListIndicators ?? DEFAULT_PREFERENCES.showListIndicators,
      copyInsteadOfMove: data?.preferences?.copyInsteadOfMove ?? DEFAULT_PREFERENCES.copyInsteadOfMove,
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
      showOriginalTitles:
        data?.preferences?.showOriginalTitles ?? DEFAULT_PREFERENCES.showOriginalTitles,
    };
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

    return auditedOnSnapshot(
      userRef,
      (snapshot) => {
        if (snapshot.exists()) {
          callback(this.mapPreferencesFromUserDoc(snapshot.data()));
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
      },
      {
        path: `users/${user.uid}`,
        queryKey: 'preferences',
        callsite: 'PreferencesService.subscribeToPreferences',
      }
    );
  }

  async fetchPreferences(userId: string): Promise<UserPreferences> {
    const userRef = this.getUserDocRef(userId);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Request timed out')), 10000);
    });

    try {
      const snapshot = await Promise.race([
        auditedGetDoc(userRef, {
          path: `users/${userId}`,
          queryKey: 'preferences',
          callsite: 'PreferencesService.fetchPreferences',
        }),
        timeoutPromise,
      ]);

      if (!snapshot.exists()) {
        return DEFAULT_PREFERENCES;
      }

      return this.mapPreferencesFromUserDoc(snapshot.data());
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      throw new Error(message);
    }
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
    const user = auth.currentUser;
    if (!user) {
      return DEFAULT_PREFERENCES;
    }

    return this.fetchPreferences(user.uid);
  }
}

export const preferencesService = new PreferencesService();
