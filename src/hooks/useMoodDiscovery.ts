import { tmdbApi, type Movie, type PaginatedResponse, type TVShow } from '@/src/api/tmdb';
import {
  formatExcludedGenres,
  formatMoodGenres,
  formatMoodKeywords,
  getMoodById,
} from '@/src/constants/moods';
import { useInfiniteQuery } from '@tanstack/react-query';

export type MoodMediaType = 'movie' | 'tv';

interface UseMoodDiscoveryOptions {
  moodId: string;
  mediaType: MoodMediaType;
  enabled?: boolean;
}

interface MoodDiscoveryResult {
  data: (Movie | TVShow)[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  refetch: () => void;
}

/**
 * Hook to fetch mood-based content using TMDB's discover API.
 * Supports infinite scroll pagination.
 */
export function useMoodDiscovery({
  moodId,
  mediaType,
  enabled = true,
}: UseMoodDiscoveryOptions): MoodDiscoveryResult {
  const mood = getMoodById(moodId);

  const {
    data,
    isLoading,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery<PaginatedResponse<Movie> | PaginatedResponse<TVShow>>({
    queryKey: ['moodDiscovery', moodId, mediaType],
    queryFn: async ({ pageParam }) => {
      if (!mood) {
        throw new Error(`Mood not found: ${moodId}`);
      }

      const params = {
        page: pageParam as number,
        withGenres: formatMoodGenres(mood),
        withKeywords: formatMoodKeywords(mood),
        withoutGenres: formatExcludedGenres(mood),
      };

      if (mediaType === 'movie') {
        return tmdbApi.discoverMoviesByMood(params);
      } else {
        return tmdbApi.discoverTVByMood(params);
      }
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.page < lastPage.total_pages) {
        return lastPage.page + 1;
      }
      return undefined;
    },
    enabled: enabled && !!mood,
  });

  // Flatten paginated results with proper typing
  const flattenedData: (Movie | TVShow)[] =
    data?.pages?.flatMap((page) => page.results as (Movie | TVShow)[]) ?? [];

  return {
    data: flattenedData,
    isLoading,
    isError,
    error: error as Error | null,
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  };
}

/**
 * Prefetch mood discovery data for a specific mood.
 * Useful for preloading content when user hovers over a mood card.
 */
export function prefetchMoodDiscovery(
  queryClient: ReturnType<typeof import('@tanstack/react-query').useQueryClient>,
  moodId: string,
  mediaType: MoodMediaType
) {
  const mood = getMoodById(moodId);
  if (!mood) return;

  const params = {
    page: 1,
    withGenres: formatMoodGenres(mood),
    withKeywords: formatMoodKeywords(mood),
    withoutGenres: formatExcludedGenres(mood),
  };

  queryClient.prefetchQuery({
    queryKey: ['moodDiscovery', moodId, mediaType],
    queryFn: async () => {
      if (mediaType === 'movie') {
        return tmdbApi.discoverMoviesByMood(params);
      } else {
        return tmdbApi.discoverTVByMood(params);
      }
    },
  });
}
