import { db } from '@/src/firebase/config';
import { getFirestoreErrorMessage } from '@/src/firebase/firestore';
import { WatchedMovieData, WatchInstance } from '@/src/types/watchedMovies';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { auth } from '../firebase/config';

/**
 * Hook to subscribe to a movie's watch history with real-time updates
 */
export const useWatchedMovies = (movieId: number): WatchedMovieData => {
  const userId = auth.currentUser?.uid;
  const [instances, setInstances] = useState<WatchInstance[]>([]);
  const [isLoading, setIsLoading] = useState(!!userId);

  useEffect(() => {
    setInstances([]);

    if (!userId || !movieId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const watchesRef = collection(db, `users/${userId}/watched_movies/${movieId}/watches`);

    const unsubscribe = onSnapshot(
      watchesRef,
      (snapshot) => {
        const watchInstances: WatchInstance[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          watchInstances.push({
            id: doc.id,
            watchedAt: data.watchedAt instanceof Timestamp ? data.watchedAt.toDate() : new Date(),
            movieId: Number(data.movieId),
          });
        });

        // Sort by most recent first
        watchInstances.sort((a, b) => b.watchedAt.getTime() - a.watchedAt.getTime());
        setInstances(watchInstances);
        setIsLoading(false);
      },
      (error) => {
        console.error('[useWatchedMovies] Subscription error:', error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId, movieId]);

  const count = instances.length;
  const lastWatchedAt = count > 0 ? instances[0].watchedAt : null;

  return {
    instances,
    count,
    lastWatchedAt,
    isLoading,
  };
};

/**
 * Mutation hook for adding a new watch instance
 */
export const useAddWatch = (movieId: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['addWatch', movieId],
    mutationFn: async (watchedAt: Date) => {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('Please sign in to continue');

      // Generate a unique ID using timestamp + random suffix
      const watchId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const watchRef = doc(db, `users/${userId}/watched_movies/${movieId}/watches/${watchId}`);

      await setDoc(watchRef, {
        watchedAt: Timestamp.fromDate(watchedAt),
        movieId: movieId.toString(),
      });

      return { id: watchId, watchedAt, movieId };
    },
    onError: (error) => {
      const message = getFirestoreErrorMessage(error);
      console.error('[useAddWatch] Error:', error);
      throw new Error(message);
    },
    onSuccess: () => {
      // Invalidate any related queries if needed
      queryClient.invalidateQueries({ queryKey: ['watchedMovies', movieId] });
    },
  });
};

/**
 * Mutation hook for clearing all watch instances for a movie
 */
export const useClearWatches = (movieId: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['clearWatches', movieId],
    mutationFn: async () => {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('Please sign in to continue');

      const watchesRef = collection(db, `users/${userId}/watched_movies/${movieId}/watches`);
      const snapshot = await getDocs(watchesRef);

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

        await batch.commit();
      }
    },
    onError: (error) => {
      const message = getFirestoreErrorMessage(error);
      console.error('[useClearWatches] Error:', error);
      throw new Error(message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchedMovies', movieId] });
    },
  });
};
