import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';
import { auth } from '../firebase/config';
import { useRealtimeSubscription } from './useRealtimeSubscription';
import { RatingItem, ratingService } from '../services/RatingService';

export const useRatings = () => {
  const userId = auth.currentUser?.uid;
  const subscribe = useCallback(
    (onData: (data: RatingItem[]) => void, onError: (error: Error) => void) =>
      ratingService.subscribeToUserRatings(onData, onError),
    []
  );

  const query = useRealtimeSubscription<RatingItem[]>({
    queryKey: ['ratings', userId],
    enabled: !!userId,
    initialData: [],
    subscribe,
    logLabel: 'useRatings',
  });

  return {
    ...query,
  };
};

export const useMediaRating = (mediaId: number, mediaType: 'movie' | 'tv') => {
  const { data: ratings, isLoading } = useRatings();

  if (!ratings) {
    return { userRating: 0, isLoading: true };
  }

  const ratingItem = ratings.find((r) => r.id === mediaId.toString() && r.mediaType === mediaType);

  return {
    userRating: ratingItem?.rating || 0,
    isLoading: isLoading || false,
  };
};

export const useRateMedia = () => {
  return useMutation({
    mutationFn: ({
      mediaId,
      mediaType,
      rating,
      metadata,
    }: {
      mediaId: number;
      mediaType: 'movie' | 'tv';
      rating: number;
      metadata?: {
        title: string;
        posterPath: string | null;
        releaseDate: string | null;
      };
    }) => ratingService.saveRating(mediaId, mediaType, rating, metadata),
  });
};

export const useDeleteRating = () => {
  return useMutation({
    mutationFn: ({ mediaId, mediaType }: { mediaId: number; mediaType: 'movie' | 'tv' }) =>
      ratingService.deleteRating(mediaId, mediaType),
  });
};

export const useEpisodeRating = (tvShowId: number, seasonNumber: number, episodeNumber: number) => {
  const { data: ratings, isLoading } = useRatings();

  if (!ratings) {
    return { userRating: 0, isLoading: true };
  }

  const episodeDocId = `episode-${tvShowId}-${seasonNumber}-${episodeNumber}`;
  const ratingItem = ratings.find((r) => r.id === episodeDocId && r.mediaType === 'episode');

  return {
    userRating: ratingItem?.rating || 0,
    isLoading,
  };
};

export const useRateEpisode = () => {
  return useMutation({
    mutationFn: ({
      tvShowId,
      seasonNumber,
      episodeNumber,
      rating,
      episodeMetadata,
    }: {
      tvShowId: number;
      seasonNumber: number;
      episodeNumber: number;
      rating: number;
      episodeMetadata: {
        episodeName: string;
        tvShowName: string;
        posterPath: string | null;
      };
    }) =>
      ratingService.saveEpisodeRating(
        tvShowId,
        seasonNumber,
        episodeNumber,
        rating,
        episodeMetadata
      ),
  });
};

export const useDeleteEpisodeRating = () => {
  return useMutation({
    mutationFn: ({
      tvShowId,
      seasonNumber,
      episodeNumber,
    }: {
      tvShowId: number;
      seasonNumber: number;
      episodeNumber: number;
    }) => ratingService.deleteEpisodeRating(tvShowId, seasonNumber, episodeNumber),
  });
};
