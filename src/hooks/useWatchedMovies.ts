import { db } from '@/src/firebase/config';
import { getFirestoreErrorMessage } from '@/src/firebase/firestore';
import { WatchInstance } from '@/src/types/watchedMovies';
import { createTimeout } from '@/src/utils/timeout';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { useEffect } from 'react';
import { auth } from '../firebase/config';

/**
 * Fetch watch instances for a movie (one-time fetch for initial data)
 */
const fetchWatchInstances = async (userId: string, movieId: number): Promise<WatchInstance[]> => {
  const watchesRef = collection(db, `users/${userId}/watched_movies/${movieId}/watches`);
  const snapshot = await getDocs(watchesRef);

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
 * Hook to get a movie's watch history with React Query caching + real-time updates
 * - Uses React Query for caching (no loading on repeated visits)
 * - Sets up Firestore listener for real-time updates when data changes
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
    staleTime: Infinity, // Never consider stale - we update via listener
    gcTime: 1000 * 60 * 30, // Keep in cache for 30 minutes
  });

  // Set up real-time listener for updates (but data loads from cache first)
  // Deferred by one frame to avoid blocking the initial render
  useEffect(() => {
    if (!userId || !movieId) return;

    let unsubscribe: (() => void) | null = null;

    // Defer listener setup to after the current render frame completes
    const frameId = requestAnimationFrame(() => {
      const watchesRef = collection(db, `users/${userId}/watched_movies/${movieId}/watches`);

      unsubscribe = onSnapshot(
        watchesRef,
        (snapshot) => {
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
          watchInstances.sort((a, b) => b.watchedAt.getTime() - a.watchedAt.getTime());

          // Update cache directly (no refetch needed)
          queryClient.setQueryData(queryKey, watchInstances);
        },
        (error) => {
          console.error('[useWatchedMovies] Subscription error:', error);
        }
      );
    });

    return () => {
      cancelAnimationFrame(frameId);
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [userId, movieId, queryClient]);

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

      const snapshot = (await Promise.race([getDocs(watchesRef), createTimeout(10000)])) as Awaited<
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
