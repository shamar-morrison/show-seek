import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { auth } from '../firebase/config';
import { RatingItem, ratingService } from '../services/RatingService';

export const useRatings = () => {
  const queryClient = useQueryClient();
  const userId = auth.currentUser?.uid;
  const [error, setError] = useState<Error | null>(null);
  const [isSubscriptionLoading, setIsSubscriptionLoading] = useState(() => {
    if (!userId) return true;
    return !queryClient.getQueryData(['ratings', userId]);
  });

  useEffect(() => {
    if (!userId) {
      setIsSubscriptionLoading(false);
      return;
    }

    setError(null);
    if (!queryClient.getQueryData(['ratings', userId])) {
      setIsSubscriptionLoading(true);
    }

    const unsubscribe = ratingService.subscribeToUserRatings(
      (ratings) => {
        queryClient.setQueryData(['ratings', userId], ratings);
        setError(null);
        setIsSubscriptionLoading(false);
      },
      (err) => {
        setError(err);
        setIsSubscriptionLoading(false);
        console.error('[useRatings] Subscription error:', err);
      }
    );

    return () => unsubscribe();
  }, [userId, queryClient]);

  const query = useQuery({
    queryKey: ['ratings', userId],
    queryFn: () => {
      return queryClient.getQueryData<RatingItem[]>(['ratings', userId]) || [];
    },
    enabled: !!userId,
    staleTime: Infinity,
    meta: { error },
  });

  return {
    ...query,
    isLoading: isSubscriptionLoading,
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
    }: {
      mediaId: number;
      mediaType: 'movie' | 'tv';
      rating: number;
    }) => ratingService.saveRating(mediaId, mediaType, rating),
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
