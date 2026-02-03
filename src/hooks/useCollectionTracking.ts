import { tmdbApi } from '@/src/api/tmdb';
import { usePremium } from '@/src/context/PremiumContext';
import {
  collectionTrackingService,
  MAX_FREE_COLLECTIONS,
} from '@/src/services/CollectionTrackingService';
import type { CollectionProgressItem, TrackedCollection } from '@/src/types/collectionTracking';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { Alert } from 'react-native';
import { auth } from '../firebase/config';
import { useRealtimeSubscription } from './useRealtimeSubscription';

// Aggressive cache time for collection data since it rarely changes
const COLLECTION_STALE_TIME = 7 * 24 * 60 * 60 * 1000; // 1 week
const COLLECTION_GC_TIME = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Hook to subscribe to all tracked collections with real-time updates.
 * Pattern matches useShowEpisodeTracking for consistency.
 */
export const useTrackedCollections = () => {
  const userId = auth.currentUser?.uid;
  const queryKey = ['collectionTracking', 'all', userId];
  const subscribe = useCallback(
    (onData: (data: TrackedCollection[]) => void, onError: (error: Error) => void) =>
      collectionTrackingService.subscribeToTrackedCollections(onData, onError),
    []
  );

  const query = useRealtimeSubscription<TrackedCollection[]>({
    queryKey,
    enabled: !!userId,
    initialData: [],
    subscribe,
    logLabel: 'useTrackedCollections',
  });

  return {
    collections: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
};

/**
 * Hook to subscribe to a single collection's tracking data.
 * Returns null if not tracked.
 * Pattern matches useShowEpisodeTracking for consistency.
 */
export const useCollectionTracking = (collectionId: number) => {
  const userId = auth.currentUser?.uid;
  const queryKey = ['collectionTracking', userId, collectionId];
  const subscribe = useCallback(
    (onData: (data: TrackedCollection | null) => void, onError: (error: Error) => void) =>
      collectionTrackingService.subscribeToCollection(collectionId, onData, onError),
    [collectionId]
  );

  const query = useRealtimeSubscription<TrackedCollection | null>({
    queryKey,
    enabled: !!userId && !!collectionId,
    initialData: null,
    subscribe,
    logLabel: 'useCollectionTracking',
  });

  const tracking = query.data ?? null;
  const isTracked = tracking !== null;
  const watchedCount = tracking?.watchedMovieIds.length ?? 0;
  const totalMovies = tracking?.totalMovies ?? 0;
  const percentage = totalMovies > 0 ? Math.round((watchedCount / totalMovies) * 100) : 0;

  return {
    tracking,
    isTracked,
    watchedCount,
    totalMovies,
    percentage,
    isLoading: query.isLoading,
    error: query.error,
  };
};

/**
 * Hook to check if user can track more collections (premium limit check)
 */
export const useCanTrackMoreCollections = () => {
  const { isPremium } = usePremium();
  const userId = auth.currentUser?.uid;

  const query = useQuery({
    queryKey: ['collectionTracking', 'count', userId],
    queryFn: () => collectionTrackingService.getTrackedCollectionCount(),
    enabled: !!userId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const count = query.data ?? 0;
  const canTrackMore = isPremium || count < MAX_FREE_COLLECTIONS;

  return {
    count,
    canTrackMore,
    isLoading: query.isLoading,
    maxFreeCollections: MAX_FREE_COLLECTIONS,
  };
};

/**
 * Mutation hook for starting collection tracking
 */
export const useStartCollectionTracking = () => {
  const queryClient = useQueryClient();
  const userId = auth.currentUser?.uid;

  return useMutation({
    mutationKey: ['startCollectionTracking'],
    mutationFn: async (params: {
      collectionId: number;
      name: string;
      totalMovies: number;
      initialWatchedMovieIds?: number[];
    }) => {
      await collectionTrackingService.startTracking(
        params.collectionId,
        params.name,
        params.totalMovies,
        params.initialWatchedMovieIds
      );
    },
    onSuccess: () => {
      // Invalidate all collection tracking queries
      queryClient.invalidateQueries({ queryKey: ['collectionTracking'] });
    },
  });
};

/**
 * Mutation hook for stopping collection tracking.
 * Shows confirmation alert before stopping.
 * Resolves with null if user cancels (avoids error state).
 */
export const useStopCollectionTracking = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['stopCollectionTracking'],
    mutationFn: async (params: { collectionId: number; collectionName: string }) => {
      // Show confirmation first
      return new Promise<number[] | null>((resolve, reject) => {
        Alert.alert(
          'Stop Tracking Collection',
          `This will remove the watched status from all movies in "${params.collectionName}". Are you sure?`,
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => resolve(null), // Resolve with null instead of rejecting
            },
            {
              text: 'Stop Tracking',
              style: 'destructive',
              onPress: async () => {
                try {
                  const watchedMovieIds = await collectionTrackingService.stopTracking(
                    params.collectionId
                  );
                  resolve(watchedMovieIds);
                } catch (error) {
                  reject(error);
                }
              },
            },
          ]
        );
      });
    },
    onSuccess: (result) => {
      // Only invalidate if stop tracking actually happened (not cancelled)
      if (result !== null) {
        queryClient.invalidateQueries({ queryKey: ['collectionTracking'] });
      }
    },
  });
};

/**
 * Mutation hook for adding a watched movie to a tracked collection
 */
export const useAddWatchedMovieToCollection = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['addWatchedMovieToCollection'],
    mutationFn: async (params: { collectionId: number; movieId: number }) => {
      await collectionTrackingService.addWatchedMovie(params.collectionId, params.movieId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collectionTracking'] });
    },
  });
};

/**
 * Mutation hook for removing a watched movie from a tracked collection
 */
export const useRemoveWatchedMovieFromCollection = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['removeWatchedMovieFromCollection'],
    mutationFn: async (params: { collectionId: number; movieId: number }) => {
      await collectionTrackingService.removeWatchedMovie(params.collectionId, params.movieId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collectionTracking'] });
    },
  });
};

/**
 * Hook to fetch collection progress with TMDB data for display.
 * Aggressively caches collection data since it rarely changes.
 */
export const useCollectionProgressList = () => {
  const { collections, isLoading: isLoadingTracking } = useTrackedCollections();

  // Fetch TMDB collection details for each tracked collection
  const collectionQueries = useQueries({
    queries: collections.map((tracked) => ({
      queryKey: ['collection', tracked.collectionId],
      queryFn: () => tmdbApi.getCollectionDetails(tracked.collectionId),
      staleTime: COLLECTION_STALE_TIME,
      gcTime: COLLECTION_GC_TIME,
      enabled: collections.length > 0,
    })),
  });

  // Combine tracking data with TMDB data
  const progressItems: CollectionProgressItem[] = collections.map((tracked, index) => {
    const tmdbData = collectionQueries[index]?.data;
    const watchedCount = tracked.watchedMovieIds.length;
    const percentage =
      tracked.totalMovies > 0 ? Math.round((watchedCount / tracked.totalMovies) * 100) : 0;

    return {
      collectionId: tracked.collectionId,
      name: tracked.name,
      posterPath: tmdbData?.poster_path ?? null,
      backdropPath: tmdbData?.backdrop_path ?? null,
      watchedCount,
      totalMovies: tracked.totalMovies,
      percentage,
      lastUpdated: tracked.lastUpdated,
    };
  });

  const isLoading =
    isLoadingTracking ||
    (collectionQueries.length > 0 && collectionQueries.some((q) => q.isLoading));

  return {
    progressItems,
    isLoading,
    isEmpty: !isLoading && progressItems.length === 0,
  };
};
