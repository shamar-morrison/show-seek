import { getTraktReviewsByTmdbId } from '@/src/api/trakt';
import { useQuery } from '@tanstack/react-query';

/**
 * Hook to fetch Trakt reviews for a movie or TV show
 */
export function useTraktReviews(
  mediaId: number,
  mediaType: 'movie' | 'tv',
  enabled: boolean = true
) {
  const query = useQuery({
    queryKey: ['trakt', 'reviews', mediaType, mediaId],
    queryFn: () => getTraktReviewsByTmdbId(mediaId, mediaType),
    enabled: !!mediaId && enabled,
    staleTime: 60 * 60 * 1000, // 1 hour - reviews don't change often
    retry: 1, // Only retry once on failure
  });

  return {
    reviews: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
