import { tmdbApi } from '@/src/api/tmdb';
import { useQueries } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

/** Posters rarely change; keep fetched ones for a day so list cards don't refetch them. */
const POSTER_STALE_TIME_MS = 24 * 60 * 60 * 1000;

export interface SeasonPosterTarget {
  tvId: number;
  seasonNumber: number;
}

const targetKey = ({ tvId, seasonNumber }: SeasonPosterTarget) => `${tvId}:${seasonNumber}`;

/**
 * Looks up posters from TMDB for season entries saved without one: the season's own poster,
 * else the show's. Only the seasons passed in are fetched, and the show is fetched only when
 * TMDB has no poster for the season. Queries share the app's season and show caches.
 */
export function useSeasonPosterFallbacks(targets: SeasonPosterTarget[]) {
  const uniqueTargets = useMemo(() => {
    const seen = new Map<string, SeasonPosterTarget>();
    targets.forEach((target) => {
      if (
        Number.isInteger(target.tvId) &&
        target.tvId > 0 &&
        Number.isInteger(target.seasonNumber) &&
        target.seasonNumber >= 0
      ) {
        seen.set(targetKey(target), target);
      }
    });
    return Array.from(seen.values());
  }, [targets]);

  const seasonQueries = useQueries({
    queries: uniqueTargets.map(({ tvId, seasonNumber }) => ({
      queryKey: ['tv', tvId, 'season', seasonNumber],
      queryFn: () => tmdbApi.getSeasonDetails(tvId, seasonNumber),
      staleTime: POSTER_STALE_TIME_MS,
    })),
  });

  // Shows whose season came back without a poster.
  const showIdsNeedingPoster = useMemo(() => {
    const ids = new Set<number>();
    uniqueTargets.forEach((target, index) => {
      const query = seasonQueries[index];
      if ((query?.isSuccess && !query.data?.poster_path) || query?.isError) {
        ids.add(target.tvId);
      }
    });
    return Array.from(ids);
  }, [seasonQueries, uniqueTargets]);

  const showQueries = useQueries({
    queries: showIdsNeedingPoster.map((tvId) => ({
      queryKey: ['tv', tvId],
      queryFn: () => tmdbApi.getTVShowDetails(tvId),
      staleTime: POSTER_STALE_TIME_MS,
    })),
  });

  const postersByTarget = useMemo(() => {
    const showPosters = new Map<number, string | null>();
    showIdsNeedingPoster.forEach((tvId, index) => {
      showPosters.set(tvId, showQueries[index]?.data?.poster_path ?? null);
    });

    const posters = new Map<string, string | null>();
    uniqueTargets.forEach((target, index) => {
      const seasonPoster = seasonQueries[index]?.data?.poster_path ?? null;
      posters.set(targetKey(target), seasonPoster ?? showPosters.get(target.tvId) ?? null);
    });
    return posters;
  }, [seasonQueries, showIdsNeedingPoster, showQueries, uniqueTargets]);

  return useCallback(
    (target: SeasonPosterTarget): string | null => postersByTarget.get(targetKey(target)) ?? null,
    [postersByTarget]
  );
}
