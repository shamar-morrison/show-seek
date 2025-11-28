import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { auth } from '../firebase/config';
import { RatingItem, ratingService } from '../services/RatingService';

export const useRatings = () => {
  const queryClient = useQueryClient();
  const userId = auth.currentUser?.uid;
  const [error, setError] = useState<Error | null>(null);
  const [isSubscriptionLoading, setIsSubscriptionLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setIsSubscriptionLoading(false);
      return;
    }

    setError(null);
    setIsSubscriptionLoading(true);

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
