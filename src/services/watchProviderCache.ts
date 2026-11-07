import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * On-device cache of streaming (flatrate) provider IDs per title, per region.
 *
 * Kept separate from the persisted React Query cache: that cache is rewritten as a
 * single blob on every change, which would be far too expensive with thousands of
 * entries. Here each region is one compact AsyncStorage entry written on a debounce.
 *
 * Stored shape: { v: 1, e: { "movie-123": [fetchedAtSeconds, providerId, ...] } }
 */

const STORAGE_KEY_PREFIX = 'showseek_watch_provider_cache_v1:';
const STORAGE_VERSION = 1;
const PERSIST_DEBOUNCE_MS = 2000;

/** Entries older than this are shown immediately but refreshed in the background. */
export const WATCH_PROVIDER_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 5; // 5 days

/**
 * Upper bound per region, keeping the stored entry well under Android's ~2MB
 * AsyncStorage row limit. The least recently updated entries are evicted first.
 */
export const WATCH_PROVIDER_CACHE_MAX_ENTRIES = 25000;

export interface CachedWatchProviders {
  providerIds: number[];
  /** Epoch milliseconds. */
  fetchedAt: number;
}

interface RegionCache {
  /** Insertion order is kept oldest-updated first, which drives eviction. */
  entries: Map<string, CachedWatchProviders>;
  persistTimer: ReturnType<typeof setTimeout> | null;
  isDirty: boolean;
}

interface StoredRegionCache {
  v?: unknown;
  e?: unknown;
}

const regionCaches = new Map<string, RegionCache>();
const pendingLoads = new Map<string, Promise<void>>();

const storageKey = (region: string) => `${STORAGE_KEY_PREFIX}${region}`;

const parseStoredEntries = (raw: string | null): Map<string, CachedWatchProviders> => {
  const entries = new Map<string, CachedWatchProviders>();
  if (!raw) {
    return entries;
  }

  const parsed = JSON.parse(raw) as StoredRegionCache | null;
  if (!parsed || parsed.v !== STORAGE_VERSION || !parsed.e || typeof parsed.e !== 'object') {
    return entries;
  }

  const stored = Object.entries(parsed.e as Record<string, unknown>)
    .filter(
      (pair): pair is [string, number[]] =>
        Array.isArray(pair[1]) &&
        pair[1].length > 0 &&
        pair[1].every((value) => typeof value === 'number')
    )
    .map(([key, [fetchedAtSeconds, ...providerIds]]) => ({
      key,
      value: { providerIds, fetchedAt: fetchedAtSeconds * 1000 },
    }))
    // Restore oldest-first ordering so eviction stays correct across launches.
    .sort((a, b) => a.value.fetchedAt - b.value.fetchedAt);

  stored.forEach(({ key, value }) => entries.set(key, value));
  return entries;
};

const persistRegion = async (region: string) => {
  const cache = regionCaches.get(region);
  if (!cache) {
    return;
  }

  if (cache.persistTimer) {
    clearTimeout(cache.persistTimer);
    cache.persistTimer = null;
  }
  if (!cache.isDirty) {
    return;
  }
  cache.isDirty = false;

  const stored: Record<string, number[]> = {};
  cache.entries.forEach((entry, key) => {
    stored[key] = [Math.floor(entry.fetchedAt / 1000), ...entry.providerIds];
  });

  try {
    await AsyncStorage.setItem(storageKey(region), JSON.stringify({ v: STORAGE_VERSION, e: stored }));
  } catch (error) {
    console.warn('[watchProviderCache] Failed to persist cache:', error);
  }
};

/** Loads a region's cache from disk once; later calls resolve immediately. */
export async function loadWatchProviderCache(region: string): Promise<void> {
  if (regionCaches.has(region)) {
    return;
  }

  const pending = pendingLoads.get(region);
  if (pending) {
    return pending;
  }

  const load = (async () => {
    let entries = new Map<string, CachedWatchProviders>();
    try {
      entries = parseStoredEntries(await AsyncStorage.getItem(storageKey(region)));
    } catch (error) {
      console.warn('[watchProviderCache] Failed to load cache:', error);
    }
    regionCaches.set(region, { entries, persistTimer: null, isDirty: false });
  })();

  pendingLoads.set(region, load);
  try {
    await load;
  } finally {
    pendingLoads.delete(region);
  }
}

export function isWatchProviderCacheLoaded(region: string): boolean {
  return regionCaches.has(region);
}

export function getCachedWatchProviders(
  region: string,
  key: string
): CachedWatchProviders | undefined {
  return regionCaches.get(region)?.entries.get(key);
}

export function isWatchProviderEntryStale(entry: CachedWatchProviders, now = Date.now()): boolean {
  return now - entry.fetchedAt >= WATCH_PROVIDER_CACHE_TTL_MS;
}

export function setCachedWatchProviders(
  region: string,
  key: string,
  providerIds: number[],
  fetchedAt = Date.now()
): void {
  let cache = regionCaches.get(region);
  if (!cache) {
    cache = { entries: new Map(), persistTimer: null, isDirty: false };
    regionCaches.set(region, cache);
  }

  // Delete first so the entry moves to the end (most recently updated).
  cache.entries.delete(key);
  cache.entries.set(key, { providerIds, fetchedAt });

  while (cache.entries.size > WATCH_PROVIDER_CACHE_MAX_ENTRIES) {
    const oldestKey = cache.entries.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }
    cache.entries.delete(oldestKey);
  }

  cache.isDirty = true;
  if (!cache.persistTimer) {
    cache.persistTimer = setTimeout(() => {
      void persistRegion(region);
    }, PERSIST_DEBOUNCE_MS);
  }
}

/** Writes any pending changes for a region to disk now. */
export function flushWatchProviderCache(region: string): Promise<void> {
  return persistRegion(region);
}

/** Test helper: drops all in-memory state (does not touch disk). */
export function resetWatchProviderCacheForTests(): void {
  regionCaches.forEach((cache) => {
    if (cache.persistTimer) {
      clearTimeout(cache.persistTimer);
    }
  });
  regionCaches.clear();
  pendingLoads.clear();
}
