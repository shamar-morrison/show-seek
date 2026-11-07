import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A small key/value cache kept in memory and mirrored to one AsyncStorage entry.
 *
 * Meant for large sets of small, non-user-specific API summaries (thousands of
 * titles). It is separate from the persisted React Query cache, which rewrites a
 * single blob on every change and would be far too expensive at this size.
 *
 * Stored shape: { v: version, e: { [key]: [fetchedAtSeconds, value] } }
 */

export interface PersistentCacheEntry<T> {
  value: T;
  /** Epoch milliseconds. */
  fetchedAt: number;
}

export interface PersistentCacheOptions<T> {
  storageKey: string;
  version: number;
  /** Least recently updated entries are evicted beyond this size. */
  maxEntries: number;
  persistDebounceMs?: number;
  /** Validates values read back from storage; invalid entries are dropped. */
  isValidValue: (value: unknown) => value is T;
}

export interface PersistentCache<T> {
  /** Loads from disk once; later calls resolve immediately. */
  load: () => Promise<void>;
  isLoaded: () => boolean;
  get: (key: string) => PersistentCacheEntry<T> | undefined;
  set: (key: string, value: T, fetchedAt?: number) => void;
  /** Writes pending changes to disk now. */
  flush: () => Promise<void>;
  /** Test helper: drops in-memory state without touching disk. */
  resetForTests: () => void;
}

interface StoredCache {
  v?: unknown;
  e?: unknown;
}

const DEFAULT_PERSIST_DEBOUNCE_MS = 2000;

export function createPersistentCache<T>({
  storageKey,
  version,
  maxEntries,
  persistDebounceMs = DEFAULT_PERSIST_DEBOUNCE_MS,
  isValidValue,
}: PersistentCacheOptions<T>): PersistentCache<T> {
  /** Insertion order is oldest-updated first, which drives eviction. */
  let entries: Map<string, PersistentCacheEntry<T>> | null = null;
  let pendingLoad: Promise<void> | null = null;
  let hasLoadedFromDisk = false;
  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  let isDirty = false;

  const parse = (raw: string | null) => {
    const parsedEntries = new Map<string, PersistentCacheEntry<T>>();
    if (!raw) {
      return parsedEntries;
    }

    const parsed = JSON.parse(raw) as StoredCache | null;
    if (!parsed || parsed.v !== version || !parsed.e || typeof parsed.e !== 'object') {
      return parsedEntries;
    }

    Object.entries(parsed.e as Record<string, unknown>)
      .flatMap(([key, stored]) => {
        if (!Array.isArray(stored) || stored.length !== 2 || typeof stored[0] !== 'number') {
          return [];
        }
        const [fetchedAtSeconds, value] = stored as [number, unknown];
        return isValidValue(value) ? [{ key, value, fetchedAt: fetchedAtSeconds * 1000 }] : [];
      })
      .sort((a, b) => a.fetchedAt - b.fetchedAt)
      .forEach(({ key, value, fetchedAt }) => parsedEntries.set(key, { value, fetchedAt }));

    return parsedEntries;
  };

  const persist = async () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    if (!entries || !isDirty) {
      return;
    }
    isDirty = false;

    const stored: Record<string, [number, T]> = {};
    entries.forEach((entry, key) => {
      stored[key] = [Math.floor(entry.fetchedAt / 1000), entry.value];
    });

    try {
      await AsyncStorage.setItem(storageKey, JSON.stringify({ v: version, e: stored }));
    } catch (error) {
      console.warn(`[persistentCache:${storageKey}] Failed to persist:`, error);
    }
  };

  const load = async () => {
    if (hasLoadedFromDisk) {
      return;
    }
    if (pendingLoad) {
      return pendingLoad;
    }

    pendingLoad = (async () => {
      let loaded = new Map<string, PersistentCacheEntry<T>>();
      try {
        loaded = parse(await AsyncStorage.getItem(storageKey));
      } catch (error) {
        console.warn(`[persistentCache:${storageKey}] Failed to load:`, error);
      }
      // Keep anything set() while the read was in flight; it is newer.
      entries?.forEach((entry, key) => {
        loaded.delete(key);
        loaded.set(key, entry);
      });
      entries = loaded;
      hasLoadedFromDisk = true;
    })();

    try {
      await pendingLoad;
    } finally {
      pendingLoad = null;
    }
  };

  const set = (key: string, value: T, fetchedAt = Date.now()) => {
    if (!entries) {
      entries = new Map();
    }

    // Delete first so the entry moves to the end (most recently updated).
    entries.delete(key);
    entries.set(key, { value, fetchedAt });

    while (entries.size > maxEntries) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      entries.delete(oldestKey);
    }

    isDirty = true;
    if (!persistTimer) {
      persistTimer = setTimeout(() => {
        void persist();
      }, persistDebounceMs);
    }
  };

  return {
    load,
    isLoaded: () => hasLoadedFromDisk,
    get: (key) => entries?.get(key),
    set,
    flush: persist,
    resetForTests: () => {
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      entries = null;
      pendingLoad = null;
      hasLoadedFromDisk = false;
      isDirty = false;
    },
  };
}
