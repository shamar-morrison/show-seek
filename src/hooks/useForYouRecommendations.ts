import { Movie, tmdbApi, TVShow } from '@/src/api/tmdb';
import { useAuth } from '@/src/context/auth';
import { RatingItem } from '@/src/services/RatingService';
import { hasListItemInMap } from '@/src/utils/listItemKeys';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useLists } from './useLists';
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
 * Removes duplicate entries by numeric `id`, keeping the first occurrence.
 * Guards against TMDB responses that occasionally repeat the same item.
 */
function dedupeById<T extends { id: number }>(items: T[]): T[] {
  const seen = new Set<number>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/**
 * Extracts preliminary seed items from user ratings.
 * Filters for items rated >= 8, only movies and TV shows, sorts by most recent.
 * Silently dedupes by mediaType + id (keeping the most recent) and drops
 * non-numeric ids. Seeds may have missing titles which will be fetched from TMDB.
 */
function extractPreliminarySeeds(
  ratings: RatingItem[] | undefined
): { id: number; mediaType: 'movie' | 'tv'; title: string | null }[] {
  if (!ratings || ratings.length === 0) return [];

  const seenSeeds = new Set<string>();
  const seeds: { id: number; mediaType: 'movie' | 'tv'; title: string | null }[] = [];

  const sorted = [...ratings]
    .filter(
      (rating): rating is RatingItem & { mediaType: 'movie' | 'tv' } =>
        rating.rating >= MIN_RATING_THRESHOLD &&
        (rating.mediaType === 'movie' || rating.mediaType === 'tv')
    )
    .sort((a, b) => b.ratedAt - a.ratedAt);

  for (const rating of sorted) {
    if (seeds.length >= MAX_SEEDS) break;
    const id = parseInt(rating.id, 10);
    if (Number.isNaN(id)) continue;
    const key = `${rating.mediaType}-${id}`;
    if (seenSeeds.has(key)) continue;
    seenSeeds.add(key);
    seeds.push({
      id,
      mediaType: rating.mediaType,
      title: rating.title || null, // null indicates title needs to be fetched
    });
  }

  return seeds;
}

/**
 * Hook that provides personalized recommendations based on user's high-rated content.
 * Fetches TMDB recommendations for each "seed" item the user has rated highly.
 */
export function useForYouRecommendations(): UseForYouRecommendationsResult {
  const { user } = useAuth();
  const { data: ratings, isLoading: isLoadingRatings } = useRatings();
  const { data: lists, isLoading: isLoadingLists } = useLists({ enabled: !!user });

  const isAuthenticated = !!user;

  const ratedMovieIds = useMemo(() => {
    const ids = new Set<number>();
    for (const rating of ratings ?? []) {
      if (rating.mediaType !== 'movie') continue;
      const id = parseInt(rating.id, 10);
      if (!Number.isNaN(id)) ids.add(id);
    }
    return ids;
  }, [ratings]);

  const alreadyWatchedItems = useMemo(() => {
    const alreadyWatchedList = lists?.find((list) => list.id === 'already-watched');
    return alreadyWatchedList?.items;
  }, [lists]);

  const excludeWatchedMovies = useCallback(
    <T extends { id: number }>(items: T[]): T[] => {
      if (ratedMovieIds.size === 0 && !alreadyWatchedItems) return items;
      return items.filter((item) => {
        if (ratedMovieIds.has(item.id)) return false;
        if (alreadyWatchedItems && hasListItemInMap(alreadyWatchedItems, 'movie', item.id)) {
          return false;
        }
        return true;
      });
    },
    [alreadyWatchedItems, ratedMovieIds]
  );

  // Extract preliminary seeds (may have null titles for legacy ratings)
  const preliminarySeeds = useMemo(() => {
    if (!isAuthenticated) return [];
    return extractPreliminarySeeds(ratings);
  }, [ratings, isAuthenticated]);

  // Fetch titles from TMDB for seeds that don't have them stored
  const titleQueries = useQueries({
    queries: preliminarySeeds
      .filter((seed) => seed.title === null)
      .map((seed) => ({
        queryKey: ['seed-title', seed.mediaType, seed.id],
        queryFn: async () => {
          if (seed.mediaType === 'movie') {
            const movie = await tmdbApi.getMovieDetails(seed.id);
            return { id: seed.id, mediaType: seed.mediaType, title: movie.title };
          } else {
            const show = await tmdbApi.getTVShowDetails(seed.id);
            return { id: seed.id, mediaType: seed.mediaType, title: show.name };
          }
        },
        staleTime: Infinity, // titles don't change
        enabled: isAuthenticated && preliminarySeeds.length > 0,
      })),
  });

  // Build a map of fetched titles, keyed by mediaType + id so a movie and a
  // TV show sharing the same numeric id don't overwrite each other
  const fetchedTitlesMap = useMemo(() => {
    const map = new Map<string, string>();
    titleQueries.forEach((query) => {
      if (query.data) {
        map.set(`${query.data.mediaType}-${query.data.id}`, query.data.title);
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
      title: seed.title || fetchedTitlesMap.get(`${seed.mediaType}-${seed.id}`) || 'Loading...',
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
      enabled: isAuthenticated && seeds.length > 0,
    })),
  });

  const sections: RecommendationSection[] = useMemo(() => {
    return seeds.map((seed, index) => {
      const query = recommendationQueries[index];
      const isMovieSection = seed.mediaType === 'movie';
      const deduped = dedupeById((query?.data?.results || []) as (Movie | TVShow)[]);
      return {
        seed,
        recommendations: isMovieSection ? excludeWatchedMovies(deduped) : deduped,
        isLoading: (query?.isLoading ?? true) || (isMovieSection && isLoadingLists),
        error: query?.error as Error | null,
      };
    });
  }, [seeds, recommendationQueries, excludeWatchedMovies, isLoadingLists]);

  // Fetch Hidden Gems - high quality but low popularity movies
  const { data: hiddenGemsData, isLoading: isLoadingHiddenGemsQuery } = useQuery({
    queryKey: ['hidden-gems'],
    queryFn: async () => {
      const response = await tmdbApi.discoverMovies({
        sortBy: 'vote_average.desc',
        voteAverageGte: HIDDEN_GEMS_MIN_VOTE_AVERAGE,
      });
      // Filter for low popularity client-side and drop any duplicate ids
      return dedupeById(
        response.results.filter((movie) => movie.popularity < HIDDEN_GEMS_MAX_POPULARITY)
      );
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    enabled: isAuthenticated && hasEnoughData,
  });

  // Fetch trending content as fallback for users with low data
  const { data: trendingMoviesData, isLoading: isLoadingTrendingMovies } = useQuery({
    queryKey: ['trending', 'movies', 'week', 'for-you-fallback'],
    queryFn: () => tmdbApi.getTrendingMovies('week'),
    staleTime: 1000 * 60 * 15, // 15 minutes
    enabled: isAuthenticated && needsFallback,
  });

  const { data: trendingTVData, isLoading: isLoadingTrendingTV } = useQuery({
    queryKey: ['trending', 'tv', 'week', 'for-you-fallback'],
    queryFn: () => tmdbApi.getTrendingTV('week'),
    staleTime: 1000 * 60 * 15, // 15 minutes
    enabled: isAuthenticated && needsFallback,
  });

  const isLoadingRecommendations = recommendationQueries.some((q) => q.isLoading);
  const isLoadingTrending = isLoadingTrendingMovies || isLoadingTrendingTV || isLoadingLists;

  const hiddenGems = useMemo(
    () => excludeWatchedMovies(dedupeById(hiddenGemsData || [])),
    [excludeWatchedMovies, hiddenGemsData]
  );

  const trendingMovies = useMemo(
    () => excludeWatchedMovies(dedupeById(trendingMoviesData?.results || [])),
    [excludeWatchedMovies, trendingMoviesData]
  );
  const trendingTV = useMemo(() => dedupeById(trendingTVData?.results || []), [trendingTVData]);

  return {
    seeds,
    // Filter out sections that are loading or have placeholder titles (still fetching from TMDB)
    sections: sections.filter(
      (s) => (s.recommendations.length > 0 || s.isLoading) && s.seed.title !== 'Loading...'
    ),
    hasEnoughData,
    isLoading: isLoadingRatings || isLoadingTitles || isLoadingRecommendations,
    isLoadingRatings,
    hiddenGems,
    isLoadingHiddenGems: isLoadingHiddenGemsQuery || isLoadingLists,
    trendingMovies,
    trendingTV,
    isLoadingTrending,
    needsFallback,
  };
}
