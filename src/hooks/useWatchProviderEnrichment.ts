import { tmdbApi, WatchProviderResults } from '@/src/api/tmdb';
import { useRegion } from '@/src/context/RegionProvider';
import { ListMediaItem } from '@/src/services/ListService';
import {
  flushWatchProviderCache,
  getCachedWatchProviders,
  isWatchProviderCacheLoaded,
  isWatchProviderEntryStale,
  loadWatchProviderCache,
  setCachedWatchProviders,
} from '@/src/services/watchProviderCache';
import { RequestAbortedError } from '@/src/utils/requestPool';
import { enqueueTmdbBulkRequest } from '@/src/utils/tmdbBulkRequests';
import { useEffect, useMemo, useState } from 'react';

/** Push accumulated results to React at most this often while fetching. */
const UI_FLUSH_INTERVAL_MS = 1000;

interface WatchProviderEnrichmentTarget {
  key: string;
  id: number;
  mediaType: 'movie' | 'tv';
}

export interface UseWatchProviderEnrichmentResult {
  /** Streaming (flatrate) provider IDs keyed by `${media_type}-${id}`. */
  providerMap: Map<string, number[]>;
  /** True while any title has no availability data yet (cached or fetched). */
  isLoadingEnrichment: boolean;
  enrichmentProgress: number;
}

interface EnrichmentState {
  targets: WatchProviderEnrichmentTarget[] | null;
  region: string | null;
  providerMap: Map<string, number[]>;
  missingCount: number;
  completedCount: number;
}

const EMPTY_STATE: EnrichmentState = {
  targets: null,
  region: null,
  providerMap: new Map(),
  missingCount: 0,
  completedCount: 0,
};

function buildEnrichmentTargets(listItems: ListMediaItem[]): WatchProviderEnrichmentTarget[] {
  const seen = new Set<string>();
  const targets: WatchProviderEnrichmentTarget[] = [];

  listItems.forEach((item) => {
    // A season or episode streams wherever its show does.
    const mediaType = item.media_type === 'movie' ? 'movie' : 'tv';
    const key = `${mediaType}-${item.id}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    targets.push({ key, id: item.id, mediaType });
  });

  return targets;
}

function extractFlatrateProviderIds(result: WatchProviderResults | null): number[] {
  const ids = new Set<number>();
  result?.flatrate?.forEach((provider) => ids.add(provider.provider_id));
  return Array.from(ids);
}

async function fetchFlatrateProviderIds(
  target: WatchProviderEnrichmentTarget,
  region: string,
  signal: AbortSignal
): Promise<number[]> {
  const result = await enqueueTmdbBulkRequest(
    () =>
      target.mediaType === 'movie'
        ? tmdbApi.getMovieWatchProviders(target.id, region)
        : tmdbApi.getTVWatchProviders(target.id, region),
    signal
  );
  return extractFlatrateProviderIds(result);
}

/**
 * Resolves which streaming services each list item is available on.
 *
 * Cached availability (on device, per region) is shown immediately. Titles with
 * no cached data are fetched first, then stale entries are refreshed in the
 * background. Results are pushed to React at most once per second so huge lists
 * don't re-render the screen on every response.
 *
 * `listItems` must be referentially stable (memoize it): a new array restarts the
 * lookup, and an array rebuilt on every render would restart it forever.
 */
export function useWatchProviderEnrichment(
  listItems: ListMediaItem[],
  enabled: boolean
): UseWatchProviderEnrichmentResult {
  const { region } = useRegion();
  const targets = useMemo(() => buildEnrichmentTargets(listItems), [listItems]);
  const [state, setState] = useState<EnrichmentState>(EMPTY_STATE);

  useEffect(() => {
    if (!enabled || targets.length === 0) {
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;
    const providerMap = new Map<string, number[]>();
    let missingCount = 0;
    let completedCount = 0;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (signal.aborted) {
        return;
      }
      setState({
        targets,
        region,
        providerMap: new Map(providerMap),
        missingCount,
        completedCount,
      });
    };

    const scheduleFlush = () => {
      if (!flushTimer) {
        flushTimer = setTimeout(flush, UI_FLUSH_INTERVAL_MS);
      }
    };

    const fetchTarget = async (target: WatchProviderEnrichmentTarget, isMissing: boolean) => {
      try {
        const providerIds = await fetchFlatrateProviderIds(target, region, signal);
        // Cache even if this run was cancelled; the data is still valid.
        setCachedWatchProviders(region, target.key, providerIds);
        if (signal.aborted) {
          return;
        }
        providerMap.set(target.key, providerIds);
      } catch (error) {
        if (signal.aborted || error instanceof RequestAbortedError) {
          return;
        }
        // Failed lookups count as "not streaming" for this session and are
        // retried next time, since nothing is cached for them.
        if (isMissing && !providerMap.has(target.key)) {
          providerMap.set(target.key, []);
        }
      }

      if (isMissing) {
        missingCount -= 1;
        completedCount += 1;
        if (missingCount === 0) {
          // Clear the loading state promptly once every title is known.
          flush();
          return;
        }
      }
      scheduleFlush();
    };

    const start = () => {
      if (signal.aborted) {
        return;
      }

      const now = Date.now();
      const missing: WatchProviderEnrichmentTarget[] = [];
      const stale: WatchProviderEnrichmentTarget[] = [];

      targets.forEach((target) => {
        const cached = getCachedWatchProviders(region, target.key);
        if (!cached) {
          missing.push(target);
          return;
        }
        providerMap.set(target.key, cached.providerIds);
        if (isWatchProviderEntryStale(cached, now)) {
          stale.push(target);
        }
      });

      missingCount = missing.length;
      completedCount = targets.length - missing.length;
      flush();

      // The pool is FIFO: titles we know nothing about go ahead of refreshes.
      void Promise.all([
        ...missing.map((target) => fetchTarget(target, true)),
        ...stale.map((target) => fetchTarget(target, false)),
      ]).then(() => {
        flush();
        void flushWatchProviderCache(region);
      });
    };

    if (isWatchProviderCacheLoaded(region)) {
      start();
    } else {
      void loadWatchProviderCache(region).then(start);
    }

    return () => {
      controller.abort();
      if (flushTimer) {
        clearTimeout(flushTimer);
      }
      void flushWatchProviderCache(region);
    };
  }, [enabled, region, targets]);

  if (!enabled || targets.length === 0) {
    return { providerMap: EMPTY_STATE.providerMap, isLoadingEnrichment: false, enrichmentProgress: 0 };
  }

  // Until the effect has produced state for these exact inputs, report loading so
  // callers never treat a previous list's (or region's) data as final.
  const isCurrent = state.targets === targets && state.region === region;

  return {
    providerMap: state.providerMap,
    isLoadingEnrichment: !isCurrent || state.missingCount > 0,
    enrichmentProgress: isCurrent ? state.completedCount / targets.length : 0,
  };
}
