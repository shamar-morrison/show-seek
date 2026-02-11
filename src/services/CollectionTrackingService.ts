import { getFirestoreErrorMessage } from '@/src/firebase/firestore';
import { createTimeoutWithCleanup } from '@/src/utils/timeout';
import {
  arrayRemove,
  arrayUnion,
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

/**
 * Timeout duration for Firestore operations (10 seconds)
 */
const TIMEOUT_MS = 10000;

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

  private isNotFoundError(error: unknown): boolean {
    const code = (error as { code?: string })?.code;
    return code === 'not-found' || code === 'firestore/not-found';
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
    const timeout = createTimeoutWithCleanup(TIMEOUT_MS);

    try {
      const snapshot = await Promise.race([getDocs(collectionRef), timeout.promise]).finally(() => {
        timeout.cancel();
      });
      return snapshot.docs.length;
    } catch (error) {
      throw new Error(getFirestoreErrorMessage(error));
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
    const timeout = createTimeoutWithCleanup(TIMEOUT_MS);
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

      await Promise.race([setDoc(trackingRef, data), timeout.promise]);
    } catch (error) {
      throw new Error(getFirestoreErrorMessage(error));
    } finally {
      timeout.cancel();
    }
  }

  /**
   * Stop tracking a collection.
   * Returns the list of watched movie IDs (for clearing watch history if desired).
   */
  async stopTracking(collectionId: number): Promise<number[]> {
    const getDocTimeoutHelper = createTimeoutWithCleanup(TIMEOUT_MS);
    const deleteTimeoutHelper = createTimeoutWithCleanup(TIMEOUT_MS);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Please sign in to continue');

      const trackingRef = this.getCollectionTrackingRef(user.uid, collectionId);

      // First, get the watched movie IDs to return (with timeout)
      const snapshot = await Promise.race([getDoc(trackingRef), getDocTimeoutHelper.promise]);
      getDocTimeoutHelper.cancel(); // Cancel immediately after success
      const watchedMovieIds: number[] = snapshot.exists()
        ? snapshot.data()?.watchedMovieIds || []
        : [];

      await Promise.race([deleteDoc(trackingRef), deleteTimeoutHelper.promise]);

      return watchedMovieIds;
    } catch (error) {
      throw new Error(getFirestoreErrorMessage(error));
    } finally {
      getDocTimeoutHelper.cancel();
      deleteTimeoutHelper.cancel();
    }
  }

  /**
   * Add a movie to the watched list for a tracked collection.
   * Uses atomic arrayUnion to avoid read-modify-write race conditions.
   */
  async addWatchedMovie(collectionId: number, movieId: number): Promise<void> {
    const updateTimeoutHelper = createTimeoutWithCleanup(TIMEOUT_MS);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Please sign in to continue');

      const trackingRef = this.getCollectionTrackingRef(user.uid, collectionId);
      try {
        // Use arrayUnion for atomic add (no duplicates, no race conditions)
        await Promise.race([
          updateDoc(trackingRef, {
            watchedMovieIds: arrayUnion(movieId),
            lastUpdated: Date.now(),
          }),
          updateTimeoutHelper.promise,
        ]);
      } catch (error) {
        // If collection isn't tracked yet, preserve prior no-op behavior.
        if (this.isNotFoundError(error)) {
          return;
        }
        throw error;
      }
    } catch (error) {
      throw new Error(getFirestoreErrorMessage(error));
    } finally {
      updateTimeoutHelper.cancel();
    }
  }

  /**
   * Remove a movie from the watched list for a tracked collection.
   * Uses atomic arrayRemove to avoid read-modify-write race conditions.
   */
  async removeWatchedMovie(collectionId: number, movieId: number): Promise<void> {
    const updateTimeoutHelper = createTimeoutWithCleanup(TIMEOUT_MS);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Please sign in to continue');

      const trackingRef = this.getCollectionTrackingRef(user.uid, collectionId);
      try {
        // Use arrayRemove for atomic removal (no race conditions)
        await Promise.race([
          updateDoc(trackingRef, {
            watchedMovieIds: arrayRemove(movieId),
            lastUpdated: Date.now(),
          }),
          updateTimeoutHelper.promise,
        ]);
      } catch (error) {
        // If collection isn't tracked yet, preserve prior no-op behavior.
        if (this.isNotFoundError(error)) {
          return;
        }
        throw error;
      }
    } catch (error) {
      throw new Error(getFirestoreErrorMessage(error));
    } finally {
      updateTimeoutHelper.cancel();
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
