import { auth, db } from '@/src/firebase/config';
import { READ_OPTIMIZATION_FLAGS } from '@/src/config/readOptimization';
import { getFirestoreErrorMessage } from '@/src/firebase/firestore';
import {
  auditedGetDoc,
  auditedGetDocs,
  auditedOnSnapshot,
} from '@/src/services/firestoreReadAudit';
import { FavoriteEpisode } from '@/src/types/favoriteEpisode';
import { createTimeout } from '@/src/utils/timeout';
import {
  collection,
  deleteDoc,
  doc,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';

/**
 * Subscription entry for a single userId
 */
interface SubscriptionEntry {
  /** The Firestore unsubscribe function */
  unsubscribe: () => void;
  /** Set of callbacks to notify on data updates */
  callbacks: Set<(episodes: FavoriteEpisode[]) => void>;
  /** Set of error callbacks */
  errorCallbacks: Set<(error: Error) => void>;
  /** Latest data for immediate delivery to new subscribers */
  latestData: FavoriteEpisode[] | null;
}

class FavoriteEpisodeService {
  private isDebugLoggingEnabled() {
    return __DEV__ && READ_OPTIMIZATION_FLAGS.enableServiceQueryDebugLogs;
  }

  private logDebug(event: string, payload: Record<string, unknown>) {
    if (!this.isDebugLoggingEnabled()) {
      return;
    }

    console.log(`[FavoriteEpisodeService.${event}]`, payload);
  }

  /**
   * Subscription registry: maps userId to active subscription entry
   * This ensures only one Firestore listener per userId, shared by all hook instances
   */
  private subscriptionRegistry = new Map<string, SubscriptionEntry>();

  /**
   * Get reference to a specific favorite episode document
   */
  private getFavoriteEpisodeRef(userId: string, episodeId: string) {
    return doc(db, 'users', userId, 'favorite_episodes', episodeId);
  }

  /**
   * Get reference to user's favorite episodes collection
   */
  private getFavoriteEpisodesCollection(userId: string) {
    return collection(db, 'users', userId, 'favorite_episodes');
  }

  /**
   * Subscribe to all favorite episodes for the current user.
   * Uses a shared subscription registry to deduplicate Firestore listeners.
   */
  subscribeToFavoriteEpisodes(
    userId: string,
    callback: (episodes: FavoriteEpisode[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    if (!userId) return () => {};

    const existingEntry = this.subscriptionRegistry.get(userId);

    if (existingEntry) {
      // Add callback to existing subscription
      existingEntry.callbacks.add(callback);
      if (onError) {
        existingEntry.errorCallbacks.add(onError);
      }

      // Immediately deliver latest data if available
      if (existingEntry.latestData !== null) {
        callback(existingEntry.latestData);
      }

      // Return unsubscribe function that removes this callback
      return () => {
        existingEntry.callbacks.delete(callback);
        if (onError) {
          existingEntry.errorCallbacks.delete(onError);
        }
        // Clean up the subscription if no more callbacks
        if (existingEntry.callbacks.size === 0) {
          existingEntry.unsubscribe();
          this.subscriptionRegistry.delete(userId);
        }
      };
    }

    // Create new subscription
    const callbacks = new Set<(episodes: FavoriteEpisode[]) => void>([callback]);
    const errorCallbacks = new Set<(error: Error) => void>();
    if (onError) {
      errorCallbacks.add(onError);
    }

    const episodesRef = this.getFavoriteEpisodesCollection(userId);
    const q = query(episodesRef, orderBy('addedAt', 'desc'));

    const unsubscribe = auditedOnSnapshot(
      q,
      (snapshot) => {
        const episodes = snapshot.docs.map((doc) => doc.data() as FavoriteEpisode);
        // Update latest data
        const entry = this.subscriptionRegistry.get(userId);
        if (entry) {
          entry.latestData = episodes;
          // Notify all callbacks
          entry.callbacks.forEach((cb) => cb(episodes));
        }
      },
      (error) => {
        console.error('[FavoriteEpisodeService] Subscription error:', error);
        const message = getFirestoreErrorMessage(error);
        const entry = this.subscriptionRegistry.get(userId);
        if (entry) {
          entry.errorCallbacks.forEach((cb) => cb(new Error(message)));
        }
      },
      {
        path: `users/${userId}/favorite_episodes`,
        queryKey: 'favoriteEpisodes',
        callsite: 'FavoriteEpisodeService.subscribeToFavoriteEpisodes',
      }
    );

    // Store in registry
    const entry: SubscriptionEntry = {
      unsubscribe,
      callbacks,
      errorCallbacks,
      latestData: null,
    };
    this.subscriptionRegistry.set(userId, entry);

    // Return unsubscribe function
    return () => {
      entry.callbacks.delete(callback);
      if (onError) {
        entry.errorCallbacks.delete(onError);
      }
      // Clean up if no more callbacks
      if (entry.callbacks.size === 0) {
        entry.unsubscribe();
        this.subscriptionRegistry.delete(userId);
      }
    };
  }

  /**
   * Add an episode to favorites
   */
  async addFavoriteEpisode(userId: string, episodeData: Omit<FavoriteEpisode, 'addedAt'>) {
    try {
      const user = auth.currentUser;
      if (!user || user.uid !== userId) {
        throw new Error('Please sign in to continue');
      }

      const episodeRef = this.getFavoriteEpisodeRef(userId, episodeData.id);
      const favoriteData: FavoriteEpisode = {
        ...episodeData,
        addedAt: Date.now(),
      };

      await Promise.race([setDoc(episodeRef, favoriteData), createTimeout()]);
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[FavoriteEpisodeService] addFavoriteEpisode error:', error);
      throw new Error(message);
    }
  }

  /**
   * Remove an episode from favorites
   */
  async removeFavoriteEpisode(userId: string, episodeId: string) {
    try {
      const user = auth.currentUser;
      if (!user || user.uid !== userId) {
        throw new Error('Please sign in to continue');
      }

      const episodeRef = this.getFavoriteEpisodeRef(userId, episodeId);
      await Promise.race([deleteDoc(episodeRef), createTimeout()]);
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[FavoriteEpisodeService] removeFavoriteEpisode error:', error);
      throw new Error(message);
    }
  }

  /**
   * Get all favorite episodes for a user
   */
  async getFavoriteEpisodes(userId: string): Promise<FavoriteEpisode[]> {
    try {
      const user = auth.currentUser;
      if (!user || user.uid !== userId) {
        throw new Error('Please sign in to continue');
      }

      this.logDebug('getFavoriteEpisodes:start', {
        userId,
        path: `users/${userId}/favorite_episodes`,
      });

      const episodesRef = this.getFavoriteEpisodesCollection(userId);
      const q = query(episodesRef, orderBy('addedAt', 'desc'));
      const snapshot = await Promise.race([
        auditedGetDocs(q, {
          path: `users/${userId}/favorite_episodes`,
          queryKey: 'favoriteEpisodes',
          callsite: 'FavoriteEpisodeService.getFavoriteEpisodes',
        }),
        createTimeout(),
      ]);

      const episodes = snapshot.docs.map((doc) => doc.data() as FavoriteEpisode);
      this.logDebug('getFavoriteEpisodes:result', {
        userId,
        docCount: snapshot.size,
        resultCount: episodes.length,
      });
      return episodes;
    } catch (error) {
      this.logDebug('getFavoriteEpisodes:error', {
        userId,
        error,
      });
      const message = getFirestoreErrorMessage(error);
      console.error('[FavoriteEpisodeService] getFavoriteEpisodes error:', error);
      throw new Error(message);
    }
  }

  async getFavoriteEpisode(userId: string, episodeId: string): Promise<FavoriteEpisode | null> {
    try {
      const user = auth.currentUser;
      if (!user || user.uid !== userId) {
        throw new Error('Please sign in to continue');
      }

      const episodeRef = this.getFavoriteEpisodeRef(userId, episodeId);
      const snapshot = await Promise.race([
        auditedGetDoc(episodeRef, {
          path: `users/${userId}/favorite_episodes/${episodeId}`,
          queryKey: 'favoriteEpisodeById',
          callsite: 'FavoriteEpisodeService.getFavoriteEpisode',
        }),
        createTimeout(),
      ]);

      if (!snapshot.exists()) {
        return null;
      }

      return snapshot.data() as FavoriteEpisode;
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[FavoriteEpisodeService] getFavoriteEpisode error:', error);
      throw new Error(message);
    }
  }
}

export const favoriteEpisodeService = new FavoriteEpisodeService();
