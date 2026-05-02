import { auditedGetDoc, auditedOnSnapshot } from '@/src/services/firestoreReadAudit';
import {
  getSignedInUser,
  requireSignedInUser,
  rethrowFirestoreError,
  toFirestoreError,
} from '@/src/services/serviceSupport';
import { sanitizePosterOverrides } from '@/src/utils/posterOverrides';
import { raceWithTimeout } from '@/src/utils/timeout';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { DEFAULT_PREFERENCES, UserPreferences } from '../types/preferences';

class PreferencesService {
  private sanitizeGenreIds(value: unknown, fallback: number[]): number[] {
    if (Array.isArray(value) && value.every((item) => typeof item === 'number')) {
      return value;
    }

    return fallback;
  }

  private getUserDocRef(userId: string) {
    return doc(db, 'users', userId);
  }

  private mapPreferencesFromUserDoc(data?: Record<string, any>): UserPreferences {
    return {
      autoAddToWatching:
        data?.preferences?.autoAddToWatching ?? DEFAULT_PREFERENCES.autoAddToWatching,
      autoAddToAlreadyWatched:
        data?.preferences?.autoAddToAlreadyWatched ?? DEFAULT_PREFERENCES.autoAddToAlreadyWatched,
      autoRemoveFromShouldWatch:
        data?.preferences?.autoRemoveFromShouldWatch ??
        DEFAULT_PREFERENCES.autoRemoveFromShouldWatch,
      blurPlotSpoilers: data?.preferences?.blurPlotSpoilers ?? DEFAULT_PREFERENCES.blurPlotSpoilers,
      showListIndicators:
        data?.preferences?.showListIndicators ?? DEFAULT_PREFERENCES.showListIndicators,
      copyInsteadOfMove: data?.preferences?.copyInsteadOfMove ?? DEFAULT_PREFERENCES.copyInsteadOfMove,
      homeScreenLists: data?.preferences?.homeScreenLists,
      favoriteMovieGenreIds:
        this.sanitizeGenreIds(
          data?.preferences?.favoriteMovieGenreIds,
          DEFAULT_PREFERENCES.favoriteMovieGenreIds
        ),
      favoriteTVGenreIds:
        this.sanitizeGenreIds(
          data?.preferences?.favoriteTVGenreIds,
          DEFAULT_PREFERENCES.favoriteTVGenreIds
        ),
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
      posterOverrides: sanitizePosterOverrides(
        data?.preferences?.posterOverrides ?? DEFAULT_PREFERENCES.posterOverrides
      ),
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
    const user = getSignedInUser();
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
        if (onError) {
          onError(toFirestoreError(error));
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

    try {
      const snapshot = await raceWithTimeout(
        auditedGetDoc(userRef, {
          path: `users/${userId}`,
          queryKey: 'preferences',
          callsite: 'PreferencesService.fetchPreferences',
        }),
      );

      if (!snapshot.exists()) {
        return DEFAULT_PREFERENCES;
      }

      return this.mapPreferencesFromUserDoc(snapshot.data());
    } catch (error) {
      throw toFirestoreError(error);
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
      const user = requireSignedInUser();

      const userRef = this.getUserDocRef(user.uid);

      await raceWithTimeout(
        setDoc(
          userRef,
          {
            preferences: {
              [key]: value,
            },
          },
          { merge: true }
        ),
      );
    } catch (error) {
      rethrowFirestoreError('PreferencesService.updatePreference', error);
    }
  }

  /**
   * Get current preferences synchronously from cache
   * Returns defaults if not available
   */
  async getPreferences(): Promise<UserPreferences> {
    const user = getSignedInUser();
    if (!user) {
      return DEFAULT_PREFERENCES;
    }

    return this.fetchPreferences(user.uid);
  }
}

export const preferencesService = new PreferencesService();
