import { tmdbApi, WatchProviderResults } from '@/src/api/tmdb';
import { useRegion } from '@/src/context/RegionProvider';
import { ListMediaItem } from '@/src/services/ListService';
import { createRateLimitedQueryFn } from '@/src/utils/rateLimitedQuery';
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';

const WATCH_PROVIDER_STALE_TIME = 1000 * 60 * 60 * 24; // 24 hours

interface WatchProviderEnrichmentTarget {
  id: number;
  mediaType: 'movie' | 'tv';
}

export interface UseWatchProviderEnrichmentResult {
  providerMap: Map<number, WatchProviderResults | null>;
  isLoadingEnrichment: boolean;
  enrichmentProgress: number;
}

function buildEnrichmentTargets(listItems: ListMediaItem[]): WatchProviderEnrichmentTarget[] {
  const seen = new Set<string>();
  const targets: WatchProviderEnrichmentTarget[] = [];

  listItems.forEach((item) => {
    const key = `${item.media_type}-${item.id}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    targets.push({
      id: item.id,
      mediaType: item.media_type,
    });
  });

  return targets;
}

export function useWatchProviderEnrichment(
  listItems: ListMediaItem[],
  enabled: boolean
): UseWatchProviderEnrichmentResult {
  const { region } = useRegion();

  const targets = useMemo(() => buildEnrichmentTargets(listItems), [listItems]);

  const enrichmentQueries = useQueries({
    queries: targets.map((target) => ({
      queryKey: ['watch-providers', region, target.mediaType, target.id],
      queryFn: createRateLimitedQueryFn(() =>
        target.mediaType === 'movie'
          ? tmdbApi.getMovieWatchProviders(target.id)
          : tmdbApi.getTVWatchProviders(target.id)
      ),
      staleTime: WATCH_PROVIDER_STALE_TIME,
      enabled: enabled && targets.length > 0,
    })),
  });

  const providerMap = useMemo(() => {
    const map = new Map<number, WatchProviderResults | null>();

    enrichmentQueries.forEach((query, index) => {
      if (query.data !== undefined) {
        map.set(targets[index].id, query.data);
      }
    });

    return map;
  }, [enrichmentQueries, targets]);

  const completedCount = enrichmentQueries.filter((query) => query.isSuccess || query.isError).length;
  const enrichmentProgress = targets.length > 0 ? completedCount / targets.length : 0;
  const isLoadingEnrichment = enabled && enrichmentQueries.some((query) => query.isLoading);

  return {
    providerMap,
    isLoadingEnrichment,
    enrichmentProgress,
  };
}
