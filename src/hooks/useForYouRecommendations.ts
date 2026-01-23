import { Movie, tmdbApi, TVShow } from '@/src/api/tmdb';
import { useAuth } from '@/src/context/auth';
import { RatingItem } from '@/src/services/RatingService';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useRatings } from './useRatings';

const MIN_RATING_THRESHOLD = 8;
const MAX_SEEDS = 5;
const MIN_SEEDS_FOR_FULL_EXPERIENCE = 3;
const HIDDEN_GEMS_MAX_POPULARITY = 50;
const HIDDEN_GEMS_MIN_VOTE_AVERAGE = 7.5;

export interface SeedItem {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
}

export interface RecommendationSection {
  seed: SeedItem;
  recommendations: (Movie | TVShow)[];
  isLoading: boolean;
  error?: Error | null;
}

export interface UseForYouRecommendationsResult {
  seeds: SeedItem[];
  sections: RecommendationSection[];
  hasEnoughData: boolean;
  isLoading: boolean;
  isLoadingRatings: boolean;
  hiddenGems: Movie[];
  isLoadingHiddenGems: boolean;
  trendingMovies: Movie[];
  trendingTV: TVShow[];
  isLoadingTrending: boolean;
  needsFallback: boolean;
}

/**
 * Extracts preliminary seed items from user ratings.
 * Filters for items rated >= 8, excludes episodes, sorts by most recent.
 * Seeds may have missing titles which will be fetched from TMDB.
 */
function extractPreliminarySeeds(
  ratings: RatingItem[] | undefined
): { id: number; mediaType: 'movie' | 'tv'; title: string | null }[] {
  if (!ratings || ratings.length === 0) return [];

  return ratings
    .filter(
      (rating): rating is RatingItem & { mediaType: 'movie' | 'tv' } =>
        rating.rating >= MIN_RATING_THRESHOLD && rating.mediaType !== 'episode'
    )
    .sort((a, b) => b.ratedAt - a.ratedAt)
    .slice(0, MAX_SEEDS)
    .map((rating) => ({
      id: parseInt(rating.id, 10),
      mediaType: rating.mediaType,
      title: rating.title || null, // null indicates title needs to be fetched
    }));
}

/**
 * Hook that provides personalized recommendations based on user's high-rated content.
 * Fetches TMDB recommendations for each "seed" item the user has rated highly.
 */
export function useForYouRecommendations(): UseForYouRecommendationsResult {
  const { user } = useAuth();
  const { data: ratings, isLoading: isLoadingRatings } = useRatings();

  const isGuest = !user || user.isAnonymous;

  // Extract preliminary seeds (may have null titles for legacy ratings)
  const preliminarySeeds = useMemo(() => {
    if (isGuest) return [];
    return extractPreliminarySeeds(ratings);
  }, [ratings, isGuest]);

  // Fetch titles from TMDB for seeds that don't have them stored
  const titleQueries = useQueries({
    queries: preliminarySeeds
      .filter((seed) => seed.title === null)
      .map((seed) => ({
        queryKey: ['seed-title', seed.mediaType, seed.id],
        queryFn: async () => {
          if (seed.mediaType === 'movie') {
            const movie = await tmdbApi.getMovieDetails(seed.id);
            return { id: seed.id, title: movie.title };
          } else {
            const show = await tmdbApi.getTVShowDetails(seed.id);
            return { id: seed.id, title: show.name };
          }
        },
        staleTime: Infinity, // titles don't change
        enabled: !isGuest && preliminarySeeds.length > 0,
      })),
  });

  // Build a map of fetched titles
  const fetchedTitlesMap = useMemo(() => {
    const map = new Map<number, string>();
    titleQueries.forEach((query) => {
      if (query.data) {
        map.set(query.data.id, query.data.title);
      }
    });
    return map;
  }, [titleQueries]);

  // Resolve final seeds with titles (either from rating data or fetched from TMDB)
  const seeds: SeedItem[] = useMemo(() => {
    return preliminarySeeds.map((seed) => ({
      id: seed.id,
      mediaType: seed.mediaType,
      // Use stored title, or fetched title, or fallback to a placeholder
      title: seed.title || fetchedTitlesMap.get(seed.id) || 'Loading...',
    }));
  }, [preliminarySeeds, fetchedTitlesMap]);

  const isLoadingTitles = titleQueries.some((q) => q.isLoading);
  const needsFallback = seeds.length < MIN_SEEDS_FOR_FULL_EXPERIENCE;
  const hasEnoughData = seeds.length > 0;

  // Fetch recommendations for each seed in parallel
  const recommendationQueries = useQueries({
    queries: seeds.map((seed) => ({
      queryKey: ['recommendations', seed.mediaType, seed.id],
      queryFn: async () => {
        if (seed.mediaType === 'movie') {
          return tmdbApi.getRecommendedMovies(seed.id);
        } else {
          return tmdbApi.getRecommendedTV(seed.id);
        }
      },
      staleTime: 1000 * 60 * 30, // 30 minutes
      enabled: !isGuest && seeds.length > 0,
    })),
  });

  // Build sections from query results
  const sections: RecommendationSection[] = useMemo(() => {
    return seeds.map((seed, index) => {
      const query = recommendationQueries[index];
      return {
        seed,
        recommendations: query?.data?.results || [],
        isLoading: query?.isLoading ?? true,
        error: query?.error as Error | null,
      };
    });
  }, [seeds, recommendationQueries]);

  // Fetch Hidden Gems - high quality but low popularity movies
  const { data: hiddenGemsData, isLoading: isLoadingHiddenGems } = useQuery({
    queryKey: ['hidden-gems'],
    queryFn: async () => {
      const response = await tmdbApi.discoverMovies({
        sortBy: 'vote_average.desc',
        voteAverageGte: HIDDEN_GEMS_MIN_VOTE_AVERAGE,
      });
      // Filter for low popularity client-side
      return response.results.filter((movie) => movie.popularity < HIDDEN_GEMS_MAX_POPULARITY);
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    enabled: !isGuest && hasEnoughData,
  });

  // Fetch trending content as fallback for users with low data
  const { data: trendingMoviesData, isLoading: isLoadingTrendingMovies } = useQuery({
    queryKey: ['trending', 'movies', 'week', 'for-you-fallback'],
    queryFn: () => tmdbApi.getTrendingMovies('week'),
    staleTime: 1000 * 60 * 15, // 15 minutes
    enabled: !isGuest && needsFallback,
  });

  const { data: trendingTVData, isLoading: isLoadingTrendingTV } = useQuery({
    queryKey: ['trending', 'tv', 'week', 'for-you-fallback'],
    queryFn: () => tmdbApi.getTrendingTV('week'),
    staleTime: 1000 * 60 * 15, // 15 minutes
    enabled: !isGuest && needsFallback,
  });

  const isLoadingRecommendations = recommendationQueries.some((q) => q.isLoading);
  const isLoadingTrending = isLoadingTrendingMovies || isLoadingTrendingTV;

  return {
    seeds,
    // Filter out sections that are loading or have placeholder titles (still fetching from TMDB)
    sections: sections.filter(
      (s) => (s.recommendations.length > 0 || s.isLoading) && s.seed.title !== 'Loading...'
    ),
    hasEnoughData,
    isLoading: isLoadingRatings || isLoadingTitles || isLoadingRecommendations,
    isLoadingRatings,
    hiddenGems: hiddenGemsData || [],
    isLoadingHiddenGems,
    trendingMovies: trendingMoviesData?.results || [],
    trendingTV: trendingTVData?.results || [],
    isLoadingTrending,
    needsFallback,
  };
}
