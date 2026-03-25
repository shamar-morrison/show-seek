import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  dehydrate,
  hydrate,
  type DehydratedState,
  type Query,
  type QueryClient,
} from '@tanstack/react-query';

const QUERY_CACHE_STORAGE_KEY = 'showseek_query_cache_v1';
const QUERY_CACHE_PERSIST_DEBOUNCE_MS = 300;
const PERSISTED_QUERY_ROOTS = new Set([
  'preferences',
  'lists',
  'list-membership-index',
  'notes',
  'note',
  'genres',
  'reminder',
  'reminders',
  'watchedMovies',
  'collectionTracking',
  'ratings',
  'rating',
  'favoritePersons',
  'favoriteEpisodes',
  'episodeTracking',
]);

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return Object.getPrototypeOf(value) === Object.prototype;
};

const serializeValue = (value: unknown): unknown => {
  if (value instanceof Date) {
    return {
      __type: 'Date',
      value: value.toISOString(),
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => serializeValue(entry));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, serializeValue(entry)])
    );
  }

  return value;
};

const deserializeValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => deserializeValue(entry));
  }

  if (isPlainObject(value)) {
    if (value.__type === 'Date' && typeof value.value === 'string') {
      const parsedDate = new Date(value.value);
      return Number.isNaN(parsedDate.getTime()) ? value : parsedDate;
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, deserializeValue(entry)])
    );
  }

  return value;
};

const getQueryRoot = (query: Query | { queryKey: readonly unknown[] | unknown }): string | null => {
  const queryKey = Array.isArray(query.queryKey) ? query.queryKey : [];
  const root = queryKey[0];
  return typeof root === 'string' ? root : null;
};

const shouldPersistQuery = (query: Query): boolean => {
  const queryRoot = getQueryRoot(query);
  if (!queryRoot || !PERSISTED_QUERY_ROOTS.has(queryRoot)) {
    return false;
  }

  return query.state.status === 'success' && query.state.data !== undefined;
};

type PersistedQueryOwnerId = string | null;

interface PersistedQueryCachePayload {
  ownerId?: unknown;
  savedAt?: unknown;
  state?: unknown;
}

export interface PersistedQueryCacheSyncControllerOptions {
  getOwnerId: () => PersistedQueryOwnerId;
}

const resolvePersistedOwnerId = (ownerId: unknown): PersistedQueryOwnerId =>
  typeof ownerId === 'string' ? ownerId : null;

export async function hydratePersistedQueryCache(
  queryClient: QueryClient,
  expectedOwnerId: PersistedQueryOwnerId
): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(QUERY_CACHE_STORAGE_KEY);
    if (!raw) {
      return false;
    }

    const parsed = JSON.parse(raw) as PersistedQueryCachePayload | null;
    const storedOwnerId = resolvePersistedOwnerId(parsed?.ownerId);

    if (!parsed?.state || !expectedOwnerId || !storedOwnerId || storedOwnerId !== expectedOwnerId) {
      await clearPersistedQueryCache();
      return false;
    }

    hydrate(queryClient, deserializeValue(parsed.state) as DehydratedState);
    return true;
  } catch (error) {
    console.warn('[queryCachePersistence] Failed to hydrate query cache:', error);
    return false;
  }
}

export async function clearPersistedQueryCache(): Promise<void> {
  await AsyncStorage.removeItem(QUERY_CACHE_STORAGE_KEY);
}

export interface PersistedQueryCacheSyncController {
  pause: () => Promise<void>;
  resume: () => void;
  dispose: () => Promise<void>;
}

export function createPersistedQueryCacheSyncController(
  queryClient: QueryClient,
  { getOwnerId }: PersistedQueryCacheSyncControllerOptions
): PersistedQueryCacheSyncController {
  let persistTimeout: ReturnType<typeof setTimeout> | null = null;
  let pendingWrite: Promise<void> | null = null;
  let unsubscribe: (() => void) | null = null;
  let isDisposed = false;

  const persistNow = async () => {
    const previousWrite = pendingWrite?.catch(() => undefined) ?? Promise.resolve();
    const nextWrite = previousWrite.then(async () => {
      const ownerId = getOwnerId();
      if (!ownerId) {
        return;
      }

      const state = dehydrate(queryClient, {
        shouldDehydrateQuery: shouldPersistQuery,
      });

      const payload: PersistedQueryCachePayload = {
        ownerId,
        savedAt: Date.now(),
        state: serializeValue(state),
      };

      await AsyncStorage.setItem(QUERY_CACHE_STORAGE_KEY, JSON.stringify(payload));
    });

    pendingWrite = nextWrite;

    try {
      await nextWrite;
    } finally {
      if (pendingWrite === nextWrite) {
        pendingWrite = null;
      }
    }
  };

  const clearPersistTimeout = () => {
    if (!persistTimeout) {
      return;
    }

    clearTimeout(persistTimeout);
    persistTimeout = null;
  };

  const drainPendingWrite = async () => {
    await (pendingWrite?.catch(() => undefined) ?? Promise.resolve());
  };

  const schedulePersist = () => {
    if (isDisposed) {
      return;
    }

    if (persistTimeout) {
      clearTimeout(persistTimeout);
    }

    persistTimeout = setTimeout(async () => {
      persistTimeout = null;

      try {
        await persistNow();
      } catch (error) {
        console.error('[queryCachePersistence] Query cache persist failed:', {
          error,
          storageKey: QUERY_CACHE_STORAGE_KEY,
          debounceMs: QUERY_CACHE_PERSIST_DEBOUNCE_MS,
          persistTimeoutActive: persistTimeout !== null,
          scheduler: 'schedulePersist',
        });
      }
    }, QUERY_CACHE_PERSIST_DEBOUNCE_MS);
  };

  const resume = () => {
    if (isDisposed || unsubscribe) {
      return;
    }

    unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (!event?.query) {
        return;
      }

      const queryRoot = getQueryRoot(event.query);
      if (!queryRoot || !PERSISTED_QUERY_ROOTS.has(queryRoot)) {
        return;
      }

      schedulePersist();
    });
  };

  const pause = async () => {
    clearPersistTimeout();

    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }

    await drainPendingWrite();
  };

  const dispose = async () => {
    isDisposed = true;
    await pause();
  };

  return {
    pause,
    resume,
    dispose,
  };
}

export function subscribeToPersistedQueryCache(
  queryClient: QueryClient,
  options: PersistedQueryCacheSyncControllerOptions
): () => void {
  const controller = createPersistedQueryCacheSyncController(queryClient, options);
  controller.resume();

  return () => {
    void controller.dispose();
  };
}
