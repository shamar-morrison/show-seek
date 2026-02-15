import { READ_QUERY_CACHE_WINDOWS } from '@/src/config/readOptimization';
import { useAuth } from '@/src/context/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RatingItem, ratingService } from '../services/RatingService';

const getRatingsQueryKey = (userId?: string) => ['ratings', userId] as const;
const getMediaRatingQueryKey = (userId: string, mediaType: 'movie' | 'tv', mediaId: number) =>
  ['rating', userId, mediaType, mediaId] as const;
const getEpisodeRatingQueryKey = (
  userId: string,
  tvShowId: number,
  seasonNumber: number,
  episodeNumber: number
) => ['rating', userId, 'episode', tvShowId, seasonNumber, episodeNumber] as const;

const upsertRatingInList = (ratings: RatingItem[], nextRating: RatingItem) => {
  const withoutExisting = ratings.filter((item) => item.id !== nextRating.id);
  return [...withoutExisting, nextRating].sort((a, b) => b.ratedAt - a.ratedAt);
};

const removeRatingFromList = (ratings: RatingItem[], ratingId: string) =>
  ratings.filter((item) => item.id !== ratingId);

const buildMediaRating = (
  mediaId: number,
  mediaType: 'movie' | 'tv',
  rating: number,
  metadata?: {
    title: string;
    posterPath: string | null;
    releaseDate: string | null;
  }
): RatingItem => ({
  id: mediaId.toString(),
  mediaType,
  rating,
  ratedAt: Date.now(),
  ...(metadata && {
    title: metadata.title,
    posterPath: metadata.posterPath,
    releaseDate: metadata.releaseDate,
  }),
});

const buildEpisodeRating = (
  tvShowId: number,
  seasonNumber: number,
  episodeNumber: number,
  rating: number,
  episodeMetadata: {
    episodeName: string;
    tvShowName: string;
    posterPath: string | null;
  }
): RatingItem => ({
  id: `episode-${tvShowId}-${seasonNumber}-${episodeNumber}`,
  mediaType: 'episode',
  rating,
  ratedAt: Date.now(),
  tvShowId,
  seasonNumber,
  episodeNumber,
  episodeName: episodeMetadata.episodeName,
  tvShowName: episodeMetadata.tvShowName,
  posterPath: episodeMetadata.posterPath,
});

export const useRatings = () => {
  const { user } = useAuth();
  const userId = user?.uid;
  const query = useQuery({
    queryKey: getRatingsQueryKey(userId),
    queryFn: () => ratingService.getUserRatings(userId!),
    enabled: !!userId,
    staleTime: READ_QUERY_CACHE_WINDOWS.statusStaleTimeMs,
    gcTime: READ_QUERY_CACHE_WINDOWS.statusGcTimeMs,
  });

  return {
    ...query,
    data: query.data ?? [],
  };
};

export const useMediaRating = (mediaId: number, mediaType: 'movie' | 'tv') => {
  const { user } = useAuth();
  const userId = user?.uid;

  const query = useQuery({
    queryKey: userId ? getMediaRatingQueryKey(userId, mediaType, mediaId) : ['rating', userId],
    queryFn: () => ratingService.getRating(mediaId, mediaType),
    enabled: !!userId && !!mediaId,
    staleTime: READ_QUERY_CACHE_WINDOWS.statusStaleTimeMs,
    gcTime: READ_QUERY_CACHE_WINDOWS.statusGcTimeMs,
  });

  return {
    userRating: query.data?.rating || 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
};

export const useRateMedia = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.uid;

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
    onMutate: async (variables) => {
      if (!userId) {
        throw new Error('Please sign in to continue');
      }

      const detailKey = getMediaRatingQueryKey(userId, variables.mediaType, variables.mediaId);
      const listKey = getRatingsQueryKey(userId);

      await Promise.all([
        queryClient.cancelQueries({ queryKey: detailKey }),
        queryClient.cancelQueries({ queryKey: listKey }),
      ]);

      const previousDetailRating = queryClient.getQueryData<RatingItem | null>(detailKey);
      const previousRatings = queryClient.getQueryData<RatingItem[]>(listKey);

      const optimisticRating = buildMediaRating(
        variables.mediaId,
        variables.mediaType,
        variables.rating,
        variables.metadata
      );

      queryClient.setQueryData<RatingItem | null>(detailKey, optimisticRating);

      if (previousRatings) {
        queryClient.setQueryData<RatingItem[]>(listKey, upsertRatingInList(previousRatings, optimisticRating));
      }

      return {
        previousDetailRating,
        previousRatings,
      };
    },
    onError: (_error, variables, context) => {
      if (!userId) return;

      const detailKey = getMediaRatingQueryKey(userId, variables.mediaType, variables.mediaId);
      const listKey = getRatingsQueryKey(userId);

      queryClient.setQueryData(detailKey, context?.previousDetailRating ?? null);

      if (context?.previousRatings) {
        queryClient.setQueryData(listKey, context.previousRatings);
      }
    },
    onSuccess: (savedRating, variables) => {
      if (!userId) return;

      const detailKey = getMediaRatingQueryKey(userId, variables.mediaType, variables.mediaId);
      const listKey = getRatingsQueryKey(userId);

      queryClient.setQueryData<RatingItem | null>(detailKey, savedRating);

      const cachedRatings = queryClient.getQueryData<RatingItem[]>(listKey);
      if (cachedRatings) {
        queryClient.setQueryData<RatingItem[]>(listKey, upsertRatingInList(cachedRatings, savedRating));
      }
    },
  });
};

export const useDeleteRating = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.uid;

  return useMutation({
    mutationFn: ({ mediaId, mediaType }: { mediaId: number; mediaType: 'movie' | 'tv' }) =>
      ratingService.deleteRating(mediaId, mediaType),
    onMutate: async (variables) => {
      if (!userId) {
        throw new Error('Please sign in to continue');
      }

      const detailKey = getMediaRatingQueryKey(userId, variables.mediaType, variables.mediaId);
      const listKey = getRatingsQueryKey(userId);
      const ratingId = variables.mediaId.toString();

      await Promise.all([
        queryClient.cancelQueries({ queryKey: detailKey }),
        queryClient.cancelQueries({ queryKey: listKey }),
      ]);

      const previousDetailRating = queryClient.getQueryData<RatingItem | null>(detailKey);
      const previousRatings = queryClient.getQueryData<RatingItem[]>(listKey);

      queryClient.setQueryData<RatingItem | null>(detailKey, null);

      if (previousRatings) {
        queryClient.setQueryData<RatingItem[]>(listKey, removeRatingFromList(previousRatings, ratingId));
      }

      return {
        previousDetailRating,
        previousRatings,
      };
    },
    onError: (_error, variables, context) => {
      if (!userId) return;

      const detailKey = getMediaRatingQueryKey(userId, variables.mediaType, variables.mediaId);
      const listKey = getRatingsQueryKey(userId);

      queryClient.setQueryData(detailKey, context?.previousDetailRating ?? null);

      if (context?.previousRatings) {
        queryClient.setQueryData(listKey, context.previousRatings);
      }
    },
    onSuccess: (_data, variables) => {
      if (!userId) return;

      const detailKey = getMediaRatingQueryKey(userId, variables.mediaType, variables.mediaId);
      const listKey = getRatingsQueryKey(userId);
      const ratingId = variables.mediaId.toString();

      queryClient.setQueryData<RatingItem | null>(detailKey, null);

      const cachedRatings = queryClient.getQueryData<RatingItem[]>(listKey);
      if (cachedRatings) {
        queryClient.setQueryData<RatingItem[]>(listKey, removeRatingFromList(cachedRatings, ratingId));
      }
    },
  });
};

export const useEpisodeRating = (tvShowId: number, seasonNumber: number, episodeNumber: number) => {
  const { user } = useAuth();
  const userId = user?.uid;

  const query = useQuery({
    queryKey: userId
      ? getEpisodeRatingQueryKey(userId, tvShowId, seasonNumber, episodeNumber)
      : ['rating', userId, 'episode'],
    queryFn: () => ratingService.getEpisodeRating(tvShowId, seasonNumber, episodeNumber),
    enabled: !!userId && !!tvShowId && Number.isFinite(seasonNumber) && Number.isFinite(episodeNumber),
    staleTime: READ_QUERY_CACHE_WINDOWS.statusStaleTimeMs,
    gcTime: READ_QUERY_CACHE_WINDOWS.statusGcTimeMs,
  });

  return {
    userRating: query.data?.rating || 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
};

export const useRateEpisode = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.uid;

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
    onMutate: async (variables) => {
      if (!userId) {
        throw new Error('Please sign in to continue');
      }

      const detailKey = getEpisodeRatingQueryKey(
        userId,
        variables.tvShowId,
        variables.seasonNumber,
        variables.episodeNumber
      );
      const listKey = getRatingsQueryKey(userId);

      await Promise.all([
        queryClient.cancelQueries({ queryKey: detailKey }),
        queryClient.cancelQueries({ queryKey: listKey }),
      ]);

      const previousDetailRating = queryClient.getQueryData<RatingItem | null>(detailKey);
      const previousRatings = queryClient.getQueryData<RatingItem[]>(listKey);

      const optimisticRating = buildEpisodeRating(
        variables.tvShowId,
        variables.seasonNumber,
        variables.episodeNumber,
        variables.rating,
        variables.episodeMetadata
      );

      queryClient.setQueryData<RatingItem | null>(detailKey, optimisticRating);

      if (previousRatings) {
        queryClient.setQueryData<RatingItem[]>(listKey, upsertRatingInList(previousRatings, optimisticRating));
      }

      return {
        previousDetailRating,
        previousRatings,
      };
    },
    onError: (_error, variables, context) => {
      if (!userId) return;

      const detailKey = getEpisodeRatingQueryKey(
        userId,
        variables.tvShowId,
        variables.seasonNumber,
        variables.episodeNumber
      );
      const listKey = getRatingsQueryKey(userId);

      queryClient.setQueryData(detailKey, context?.previousDetailRating ?? null);

      if (context?.previousRatings) {
        queryClient.setQueryData(listKey, context.previousRatings);
      }
    },
    onSuccess: (savedRating, variables) => {
      if (!userId) return;

      const detailKey = getEpisodeRatingQueryKey(
        userId,
        variables.tvShowId,
        variables.seasonNumber,
        variables.episodeNumber
      );
      const listKey = getRatingsQueryKey(userId);

      queryClient.setQueryData<RatingItem | null>(detailKey, savedRating);

      const cachedRatings = queryClient.getQueryData<RatingItem[]>(listKey);
      if (cachedRatings) {
        queryClient.setQueryData<RatingItem[]>(listKey, upsertRatingInList(cachedRatings, savedRating));
      }
    },
  });
};

export const useDeleteEpisodeRating = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.uid;

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
    onMutate: async (variables) => {
      if (!userId) {
        throw new Error('Please sign in to continue');
      }

      const detailKey = getEpisodeRatingQueryKey(
        userId,
        variables.tvShowId,
        variables.seasonNumber,
        variables.episodeNumber
      );
      const listKey = getRatingsQueryKey(userId);
      const ratingId = `episode-${variables.tvShowId}-${variables.seasonNumber}-${variables.episodeNumber}`;

      await Promise.all([
        queryClient.cancelQueries({ queryKey: detailKey }),
        queryClient.cancelQueries({ queryKey: listKey }),
      ]);

      const previousDetailRating = queryClient.getQueryData<RatingItem | null>(detailKey);
      const previousRatings = queryClient.getQueryData<RatingItem[]>(listKey);

      queryClient.setQueryData<RatingItem | null>(detailKey, null);

      if (previousRatings) {
        queryClient.setQueryData<RatingItem[]>(listKey, removeRatingFromList(previousRatings, ratingId));
      }

      return {
        previousDetailRating,
        previousRatings,
      };
    },
    onError: (_error, variables, context) => {
      if (!userId) return;

      const detailKey = getEpisodeRatingQueryKey(
        userId,
        variables.tvShowId,
        variables.seasonNumber,
        variables.episodeNumber
      );
      const listKey = getRatingsQueryKey(userId);

      queryClient.setQueryData(detailKey, context?.previousDetailRating ?? null);

      if (context?.previousRatings) {
        queryClient.setQueryData(listKey, context.previousRatings);
      }
    },
    onSuccess: (_data, variables) => {
      if (!userId) return;

      const detailKey = getEpisodeRatingQueryKey(
        userId,
        variables.tvShowId,
        variables.seasonNumber,
        variables.episodeNumber
      );
      const listKey = getRatingsQueryKey(userId);
      const ratingId = `episode-${variables.tvShowId}-${variables.seasonNumber}-${variables.episodeNumber}`;

      queryClient.setQueryData<RatingItem | null>(detailKey, null);

      const cachedRatings = queryClient.getQueryData<RatingItem[]>(listKey);
      if (cachedRatings) {
        queryClient.setQueryData<RatingItem[]>(listKey, removeRatingFromList(cachedRatings, ratingId));
      }
    },
  });
};
