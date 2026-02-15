import { db } from '@/src/firebase/config';
import { READ_QUERY_CACHE_WINDOWS } from '@/src/config/readOptimization';
import { getFirestoreErrorMessage } from '@/src/firebase/firestore';
import { auditedGetDocs } from '@/src/services/firestoreReadAudit';
import { collectionTrackingService } from '@/src/services/CollectionTrackingService';
import { WatchInstance } from '@/src/types/watchedMovies';
import { createTimeout } from '@/src/utils/timeout';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth } from '../firebase/config';

/**
 * Fetch watch instances for a movie (one-time fetch for initial data)
 */
const fetchWatchInstances = async (userId: string, movieId: number): Promise<WatchInstance[]> => {
  const watchesRef = collection(db, `users/${userId}/watched_movies/${movieId}/watches`);
  const snapshot = await auditedGetDocs(watchesRef, {
    path: `users/${userId}/watched_movies/${movieId}/watches`,
    queryKey: 'watchedMoviesByMovie',
    callsite: 'useWatchedMovies.fetchWatchInstances',
  });

  const watchInstances: WatchInstance[] = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    watchInstances.push({
      id: doc.id,
      watchedAt: data.watchedAt instanceof Timestamp ? data.watchedAt.toDate() : new Date(),
      movieId: typeof data.movieId === 'number' ? data.movieId : Number(data.movieId),
    });
  });

  // Sort by most recent first
  return watchInstances.sort((a, b) => b.watchedAt.getTime() - a.watchedAt.getTime());
};

/**
 * Best-effort sync to keep collection tracking consistent when a movie becomes unwatched.
 * Never throws: watch removal remains the source of truth.
 */
const syncCollectionTrackingAfterUnwatch = async (movieId: number): Promise<void> => {
  try {
    const trackedCollections = await collectionTrackingService.getAllTrackedCollections();
    const affectedCollections = trackedCollections.filter((collection) =>
      collection.watchedMovieIds?.includes(movieId)
    );

    if (affectedCollections.length === 0) return;

    const results = await Promise.allSettled(
      affectedCollections.map((collection) =>
        collectionTrackingService.removeWatchedMovie(collection.collectionId, movieId)
      )
    );

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.warn(
          `[useWatchedMovies] Failed to remove movie ${movieId} from tracked collection ${affectedCollections[index].collectionId}:`,
          result.reason
        );
      }
    });
  } catch (error) {
    console.error(
      `[useWatchedMovies] Failed to sync collection tracking after unwatch for movie ${movieId}:`,
      error
    );
  }
};

/**
 * Hook to get a movie's watch history with React Query caching.
 * Uses explicit invalidation/optimistic updates from mutations instead of realtime listeners.
 */
export const useWatchedMovies = (movieId: number) => {
  const userId = auth.currentUser?.uid;
  const queryClient = useQueryClient();
  const queryKey = ['watchedMovies', userId, movieId];

  // Use React Query for caching
  const query = useQuery({
    queryKey,
    queryFn: () => fetchWatchInstances(userId!, movieId),
    enabled: !!userId && !!movieId,
    staleTime: READ_QUERY_CACHE_WINDOWS.statusStaleTimeMs,
    gcTime: READ_QUERY_CACHE_WINDOWS.statusGcTimeMs,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const instances = query.data ?? [];
  const count = instances.length;
  const lastWatchedAt = count > 0 ? instances[0].watchedAt : null;

  return {
    instances,
    count,
    lastWatchedAt,
    isLoading: query.isLoading,
  };
};

/**
 * Mutation hook for adding a new watch instance
 */
export const useAddWatch = (movieId: number) => {
  const queryClient = useQueryClient();
  const userId = auth.currentUser?.uid;

  return useMutation({
    mutationKey: ['addWatch', movieId],
    mutationFn: async (watchedAt: Date) => {
      const currentUserId = auth.currentUser?.uid;
      if (!currentUserId) throw new Error('Please sign in to continue');

      // Generate a unique ID using timestamp + random suffix
      const watchId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const watchRef = doc(
        db,
        `users/${currentUserId}/watched_movies/${movieId}/watches/${watchId}`
      );

      await setDoc(watchRef, {
        watchedAt: Timestamp.fromDate(watchedAt),
        movieId: movieId,
      });

      return { id: watchId, watchedAt, movieId };
    },
    // Optimistic update for instant UI feedback
    onMutate: async (watchedAt) => {
      const queryKey = ['watchedMovies', userId, movieId];
      await queryClient.cancelQueries({ queryKey });

      const previousData = queryClient.getQueryData<WatchInstance[]>(queryKey);

      // Optimistically add the new watch
      const optimisticWatch: WatchInstance = {
        id: `temp_${Date.now()}`,
        watchedAt,
        movieId,
      };

      queryClient.setQueryData<WatchInstance[]>(queryKey, (old) => {
        const newData = [optimisticWatch, ...(old ?? [])];
        return newData.sort((a, b) => b.watchedAt.getTime() - a.watchedAt.getTime());
      });

      return { previousData };
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(['watchedMovies', userId, movieId], context.previousData);
      }
      const message = getFirestoreErrorMessage(error);
      console.error('[useAddWatch] Error:', error);
      throw new Error(message);
    },
  });
};

/**
 * Mutation hook for clearing all watch instances for a movie
 */
export const useClearWatches = (movieId: number) => {
  const queryClient = useQueryClient();
  const userId = auth.currentUser?.uid;

  return useMutation({
    mutationKey: ['clearWatches', movieId],
    mutationFn: async () => {
      const currentUserId = auth.currentUser?.uid;
      if (!currentUserId) throw new Error('Please sign in to continue');

      const watchesRef = collection(db, `users/${currentUserId}/watched_movies/${movieId}/watches`);

      const snapshot = (await Promise.race([
        auditedGetDocs(watchesRef, {
          path: `users/${currentUserId}/watched_movies/${movieId}/watches`,
          queryKey: 'watchedMoviesByMovie',
          callsite: 'useWatchedMovies.useClearWatches',
        }),
        createTimeout(10000),
      ])) as Awaited<
        ReturnType<typeof getDocs>
      >;

      if (snapshot.empty) return;

      // Use batch delete for efficiency (max 500 per batch)
      const batchSize = 500;
      const docs = snapshot.docs;

      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = docs.slice(i, i + batchSize);

        chunk.forEach((doc) => {
          batch.delete(doc.ref);
        });

        await Promise.race([batch.commit(), createTimeout(10000)]);
      }

      await syncCollectionTrackingAfterUnwatch(movieId);
    },
    // Optimistic update
    onMutate: async () => {
      const queryKey = ['watchedMovies', userId, movieId];
      await queryClient.cancelQueries({ queryKey });

      const previousData = queryClient.getQueryData<WatchInstance[]>(queryKey);

      // Optimistically clear all watches
      queryClient.setQueryData<WatchInstance[]>(queryKey, []);

      return { previousData };
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(['watchedMovies', userId, movieId], context.previousData);
      }
      const message = getFirestoreErrorMessage(error);
      console.error('[useClearWatches] Error:', error);
      throw new Error(message);
    },
  });
};

/**
 * Mutation hook for deleting a single watch instance
 */
export const useDeleteWatch = (movieId: number) => {
  const queryClient = useQueryClient();
  const userId = auth.currentUser?.uid;

  return useMutation({
    mutationKey: ['deleteWatch', movieId],
    mutationFn: async (instanceId: string) => {
      const currentUserId = auth.currentUser?.uid;
      if (!currentUserId) throw new Error('Please sign in to continue');

      const watchRef = doc(
        db,
        `users/${currentUserId}/watched_movies/${movieId}/watches/${instanceId}`
      );

      await deleteDoc(watchRef);

      const watchesRef = collection(db, `users/${currentUserId}/watched_movies/${movieId}/watches`);
      const remainingSnapshot = (await Promise.race([
        auditedGetDocs(watchesRef, {
          path: `users/${currentUserId}/watched_movies/${movieId}/watches`,
          queryKey: 'watchedMoviesByMovie',
          callsite: 'useWatchedMovies.useDeleteWatch',
        }),
        createTimeout(10000),
      ])) as Awaited<ReturnType<typeof getDocs>>;

      if (remainingSnapshot.empty) {
        await syncCollectionTrackingAfterUnwatch(movieId);
      }

      return instanceId;
    },
    // Optimistic update for instant UI feedback
    onMutate: async (instanceId) => {
      const queryKey = ['watchedMovies', userId, movieId];
      await queryClient.cancelQueries({ queryKey });

      const previousData = queryClient.getQueryData<WatchInstance[]>(queryKey);

      // Optimistically remove the watch instance
      queryClient.setQueryData<WatchInstance[]>(queryKey, (old) => {
        return (old ?? []).filter((instance) => instance.id !== instanceId);
      });

      return { previousData };
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(['watchedMovies', userId, movieId], context.previousData);
      }
      const message = getFirestoreErrorMessage(error);
      console.error('[useDeleteWatch] Error:', error);
      throw new Error(message);
    },
  });
};

/**
 * Mutation hook for updating the watched date of a single watch instance
 */
export const useUpdateWatchDate = (movieId: number) => {
  const queryClient = useQueryClient();
  const userId = auth.currentUser?.uid;

  return useMutation({
    mutationKey: ['updateWatchDate', movieId],
    mutationFn: async ({ instanceId, newDate }: { instanceId: string; newDate: Date }) => {
      const currentUserId = auth.currentUser?.uid;
      if (!currentUserId) throw new Error('Please sign in to continue');

      const watchRef = doc(
        db,
        `users/${currentUserId}/watched_movies/${movieId}/watches/${instanceId}`
      );

      await updateDoc(watchRef, {
        watchedAt: Timestamp.fromDate(newDate),
      });

      return { instanceId, newDate };
    },
    // Optimistic update for instant UI feedback
    onMutate: async ({ instanceId, newDate }) => {
      const queryKey = ['watchedMovies', userId, movieId];
      await queryClient.cancelQueries({ queryKey });

      const previousData = queryClient.getQueryData<WatchInstance[]>(queryKey);

      // Optimistically update the watch instance date
      queryClient.setQueryData<WatchInstance[]>(queryKey, (old) => {
        const updated = (old ?? []).map((instance) =>
          instance.id === instanceId ? { ...instance, watchedAt: newDate } : instance
        );
        // Re-sort by most recent first
        return updated.sort((a, b) => b.watchedAt.getTime() - a.watchedAt.getTime());
      });

      return { previousData };
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(['watchedMovies', userId, movieId], context.previousData);
      }
      const message = getFirestoreErrorMessage(error);
      console.error('[useUpdateWatchDate] Error:', error);
      throw new Error(message);
    },
  });
};
