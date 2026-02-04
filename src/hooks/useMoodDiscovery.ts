import { tmdbApi, type Movie, type PaginatedResponse, type TVShow } from '@/src/api/tmdb';
import {
  formatExcludedGenres,
  formatMoodGenres,
  formatMoodKeywords,
  getMoodById,
} from '@/src/constants/moods';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

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
 * Calculate a stable random starting page (1-5) for variety.
 * Uses a hash of moodId + mediaType + time window to ensure cache consistency.
 * Results change every ~6 hours.
 */
function getStartingPage(moodId: string, mediaType: MoodMediaType): number {
  const now = new Date();
  const hourSeed =
    now.getFullYear() * 10000 +
    (now.getMonth() + 1) * 100 +
    now.getDate() * 10 +
    Math.floor(now.getHours() / 6);
  const hash = `${moodId}-${mediaType}-${hourSeed}`.split('').reduce((acc, char) => {
    return (acc << 5) - acc + char.charCodeAt(0);
  }, 0);
  return Math.abs(hash % 5) + 1; // Random page 1-5
}

/**
 * Hook to fetch mood-based content using TMDB's discover API.
 * Supports infinite scroll pagination with randomized starting page for variety.
 */
export function useMoodDiscovery({
  moodId,
  mediaType,
  enabled = true,
}: UseMoodDiscoveryOptions): MoodDiscoveryResult {
  const mood = getMoodById(moodId);

  // Use shared function for stable starting page calculation
  const startingPage = useMemo(() => getStartingPage(moodId, mediaType), [moodId, mediaType]);

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
    queryKey: ['moodDiscovery', moodId, mediaType, startingPage],
    queryFn: async ({ pageParam }) => {
      if (!mood) {
        throw new Error(`Mood not found: ${moodId}`);
      }

      const params = {
        page: pageParam as number,
        withGenres: formatMoodGenres(mood, mediaType),
        withKeywords: formatMoodKeywords(mood),
        withoutGenres: formatExcludedGenres(mood, mediaType),
      };

      if (mediaType === 'movie') {
        return tmdbApi.discoverMoviesByMood(params);
      } else {
        return tmdbApi.discoverTVByMood(params);
      }
    },
    initialPageParam: startingPage,
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

  // Use the same starting page calculation as useMoodDiscovery for cache key consistency
  const startingPage = getStartingPage(moodId, mediaType);

  const params = {
    page: startingPage,
    withGenres: formatMoodGenres(mood, mediaType),
    withKeywords: formatMoodKeywords(mood),
    withoutGenres: formatExcludedGenres(mood, mediaType),
  };

  queryClient.prefetchInfiniteQuery({
    queryKey: ['moodDiscovery', moodId, mediaType, startingPage],
    queryFn: async () => {
      if (mediaType === 'movie') {
        return tmdbApi.discoverMoviesByMood(params);
      } else {
        return tmdbApi.discoverTVByMood(params);
      }
    },
    initialPageParam: startingPage,
  });
}
