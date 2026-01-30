import { getFirestoreErrorMessage } from '@/src/firebase/firestore';
import { createTimeoutWithCleanup } from '@/src/utils/timeout';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import type { TrackedCollection } from '../types/collectionTracking';

/**
 * Maximum number of collections free users can track
 */
export const MAX_FREE_COLLECTIONS = 2;

class CollectionTrackingService {
  /**
   * Get reference to a collection tracking document
   */
  private getCollectionTrackingRef(userId: string, collectionId: number) {
    return doc(db, 'users', userId, 'collection_tracking', collectionId.toString());
  }

  /**
   * Get reference to the collection_tracking subcollection
   */
  private getCollectionTrackingCollectionRef(userId: string) {
    return collection(db, 'users', userId, 'collection_tracking');
  }

  /**
   * Subscribe to all tracked collections for the current user.
   * Returns empty array if no collections tracked.
   * Includes 10-second first-event timeout for slow/stalled connections.
   */
  subscribeToTrackedCollections(
    callback: (collections: TrackedCollection[]) => void,
    onError?: (error: Error) => void
  ) {
    const user = auth.currentUser;
    if (!user) {
      callback([]);
      return () => {};
    }

    const collectionRef = this.getCollectionTrackingCollectionRef(user.uid);
    let firstEventReceived = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let unsubscribeSnapshot: (() => void) | null = null;

    // Set up 10-second first-event timeout
    timeoutId = setTimeout(() => {
      if (!firstEventReceived) {
        console.error('[CollectionTrackingService] First event timeout - no response in 10s');
        // Clean up the listener
        if (unsubscribeSnapshot) {
          unsubscribeSnapshot();
          unsubscribeSnapshot = null;
        }
        // Notify error
        if (onError) {
          onError(new Error('Connection timed out. Please check your network.'));
        }
        // Fallback to empty state
        callback([]);
      }
    }, 10000);

    unsubscribeSnapshot = onSnapshot(
      collectionRef,
      (snapshot) => {
        // Clear timeout on first event
        if (!firstEventReceived) {
          firstEventReceived = true;
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
        }

        const collections: TrackedCollection[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          collections.push({
            collectionId: data.collectionId,
            name: data.name,
            totalMovies: data.totalMovies,
            watchedMovieIds: data.watchedMovieIds || [],
            startedAt: data.startedAt,
            lastUpdated: data.lastUpdated,
          });
        });
        callback(collections);
      },
      (error) => {
        // Clear timeout on error
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        console.error('[CollectionTrackingService] Subscription error:', error);
        const message = getFirestoreErrorMessage(error);
        if (onError) {
          onError(new Error(message));
        }
        // Graceful degradation
        callback([]);
      }
    );

    // Return unsubscribe function that cleans up both listener and timeout
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }
    };
  }

  /**
   * Subscribe to a single collection's tracking data.
   * Returns null if collection is not tracked.
   * Includes 10-second first-event timeout for slow/stalled connections.
   */
  subscribeToCollection(
    collectionId: number,
    callback: (collection: TrackedCollection | null) => void,
    onError?: (error: Error) => void
  ) {
    const user = auth.currentUser;
    if (!user) {
      callback(null);
      return () => {};
    }

    const trackingRef = this.getCollectionTrackingRef(user.uid, collectionId);
    let firstEventReceived = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let unsubscribeSnapshot: (() => void) | null = null;

    // Set up 10-second first-event timeout
    timeoutId = setTimeout(() => {
      if (!firstEventReceived) {
        console.error('[CollectionTrackingService] First event timeout - no response in 10s');
        // Clean up the listener
        if (unsubscribeSnapshot) {
          unsubscribeSnapshot();
          unsubscribeSnapshot = null;
        }
        // Notify error
        if (onError) {
          onError(new Error('Connection timed out. Please check your network.'));
        }
        // Fallback to null state
        callback(null);
      }
    }, 10000);

    unsubscribeSnapshot = onSnapshot(
      trackingRef,
      (snapshot) => {
        // Clear timeout on first event
        if (!firstEventReceived) {
          firstEventReceived = true;
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
        }

        if (snapshot.exists()) {
          const data = snapshot.data();
          callback({
            collectionId: data.collectionId,
            name: data.name,
            totalMovies: data.totalMovies,
            watchedMovieIds: data.watchedMovieIds || [],
            startedAt: data.startedAt,
            lastUpdated: data.lastUpdated,
          });
        } else {
          callback(null);
        }
      },
      (error) => {
        // Clear timeout on error
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        console.error('[CollectionTrackingService] Subscription error:', error);
        const message = getFirestoreErrorMessage(error);
        if (onError) {
          onError(new Error(message));
        }
        callback(null);
      }
    );

    // Return unsubscribe function that cleans up both listener and timeout
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }
    };
  }

  /**
   * Check if a collection is being tracked (one-time check)
   */
  async isCollectionTracked(collectionId: number): Promise<boolean> {
    const user = auth.currentUser;
    if (!user) return false;

    const trackingRef = this.getCollectionTrackingRef(user.uid, collectionId);
    const snapshot = await getDoc(trackingRef);
    return snapshot.exists();
  }

  /**
   * Get the count of currently tracked collections (for premium limit check)
   */
  async getTrackedCollectionCount(): Promise<number> {
    const user = auth.currentUser;
    if (!user) return 0;

    const collectionRef = this.getCollectionTrackingCollectionRef(user.uid);
    const timeout = createTimeoutWithCleanup(10000);

    try {
      const snapshot = await Promise.race([getDocs(collectionRef), timeout.promise]).finally(() => {
        timeout.cancel();
      });
      return snapshot.docs.length;
    } catch (error) {
      console.error('[CollectionTrackingService] Error getting count:', error);
      return 0;
    }
  }

  /**
   * Start tracking a collection
   */
  async startTracking(
    collectionId: number,
    name: string,
    totalMovies: number,
    initialWatchedMovieIds: number[] = []
  ): Promise<void> {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Please sign in to continue');

      const trackingRef = this.getCollectionTrackingRef(user.uid, collectionId);
      const now = Date.now();

      const data: TrackedCollection = {
        collectionId,
        name,
        totalMovies,
        watchedMovieIds: initialWatchedMovieIds,
        startedAt: now,
        lastUpdated: now,
      };

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 10000);
      });

      await Promise.race([setDoc(trackingRef, data), timeoutPromise]);
    } catch (error) {
      throw new Error(getFirestoreErrorMessage(error));
    }
  }

  /**
   * Stop tracking a collection.
   * Returns the list of watched movie IDs (for clearing watch history if desired).
   */
  async stopTracking(collectionId: number): Promise<number[]> {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Please sign in to continue');

      const trackingRef = this.getCollectionTrackingRef(user.uid, collectionId);

      // First, get the watched movie IDs to return
      const snapshot = await getDoc(trackingRef);
      const watchedMovieIds: number[] = snapshot.exists()
        ? snapshot.data()?.watchedMovieIds || []
        : [];

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 10000);
      });

      await Promise.race([deleteDoc(trackingRef), timeoutPromise]);

      return watchedMovieIds;
    } catch (error) {
      throw new Error(getFirestoreErrorMessage(error));
    }
  }

  /**
   * Add a movie to the watched list for a tracked collection
   */
  async addWatchedMovie(collectionId: number, movieId: number): Promise<void> {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Please sign in to continue');

      const trackingRef = this.getCollectionTrackingRef(user.uid, collectionId);
      const snapshot = await getDoc(trackingRef);

      if (!snapshot.exists()) {
        // Collection is not being tracked, nothing to do
        return;
      }

      const data = snapshot.data();
      const watchedMovieIds: number[] = data.watchedMovieIds || [];

      // Don't add if already in the list
      if (watchedMovieIds.includes(movieId)) {
        return;
      }

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 10000);
      });

      await Promise.race([
        updateDoc(trackingRef, {
          watchedMovieIds: [...watchedMovieIds, movieId],
          lastUpdated: Date.now(),
        }),
        timeoutPromise,
      ]);
    } catch (error) {
      throw new Error(getFirestoreErrorMessage(error));
    }
  }

  /**
   * Remove a movie from the watched list for a tracked collection
   */
  async removeWatchedMovie(collectionId: number, movieId: number): Promise<void> {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Please sign in to continue');

      const trackingRef = this.getCollectionTrackingRef(user.uid, collectionId);
      const snapshot = await getDoc(trackingRef);

      if (!snapshot.exists()) {
        return;
      }

      const data = snapshot.data();
      const watchedMovieIds: number[] = data.watchedMovieIds || [];
      const updatedIds = watchedMovieIds.filter((id) => id !== movieId);

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 10000);
      });

      await Promise.race([
        updateDoc(trackingRef, {
          watchedMovieIds: updatedIds,
          lastUpdated: Date.now(),
        }),
        timeoutPromise,
      ]);
    } catch (error) {
      throw new Error(getFirestoreErrorMessage(error));
    }
  }

  /**
   * Get all tracked collections (one-time fetch)
   */
  async getAllTrackedCollections(): Promise<TrackedCollection[]> {
    const user = auth.currentUser;
    if (!user) return [];

    const collectionRef = this.getCollectionTrackingCollectionRef(user.uid);
    const timeout = createTimeoutWithCleanup(10000);

    try {
      const snapshot = await Promise.race([getDocs(collectionRef), timeout.promise]).finally(() => {
        timeout.cancel();
      });

      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          collectionId: data.collectionId,
          name: data.name,
          totalMovies: data.totalMovies,
          watchedMovieIds: data.watchedMovieIds || [],
          startedAt: data.startedAt,
          lastUpdated: data.lastUpdated,
        };
      });
    } catch (error) {
      console.error('[CollectionTrackingService] Error fetching collections:', error);
      throw new Error(getFirestoreErrorMessage(error));
    }
  }
}

// Export singleton instance
export const collectionTrackingService = new CollectionTrackingService();
