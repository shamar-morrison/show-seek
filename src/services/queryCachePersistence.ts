import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  dehydrate,
  hydrate,
  type DehydratedState,
  type Query,
  type QueryClient,
} from '@tanstack/react-query';

/** Where the cache lived before it moved to a file; read once to migrate, then removed. */
const QUERY_CACHE_STORAGE_KEY = 'showseek_query_cache_v1';
const QUERY_CACHE_FILE_NAME = 'showseek_query_cache_v1.json';
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

/**
 * Where the serialized cache is kept. It's a file, not AsyncStorage: on Android, AsyncStorage
 * is a SQLite database capped at 6 MB in total, and a single value over ~2 MB can't be read back
 * ("Row too big to fit into CursorWindow"). Large libraries (thousands of list items and watched
 * episodes) exceed both, which silently dropped the cache on every launch and crowded out
 * everything else stored in AsyncStorage.
 */
export interface PersistedQueryCacheStore {
  read: () => Promise<string | null>;
  write: (text: string) => Promise<void>;
  clear: () => Promise<void>;
}

type FileSystemModule = typeof import('expo-file-system/legacy');

let fileSystemModule: FileSystemModule | null | undefined;

/** Loaded on first use; null where the native module isn't available (web, some tests). */
const getFileSystem = (): FileSystemModule | null => {
  if (fileSystemModule === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      fileSystemModule = require('expo-file-system/legacy') as FileSystemModule;
    } catch {
      fileSystemModule = null;
    }
  }
  return fileSystemModule;
};

const getCacheFile = (): { fs: FileSystemModule; uri: string } | null => {
  const fs = getFileSystem();
  return fs?.documentDirectory ? { fs, uri: `${fs.documentDirectory}${QUERY_CACHE_FILE_NAME}` } : null;
};

const asyncStorageStore: PersistedQueryCacheStore = {
  clear: () => AsyncStorage.removeItem(QUERY_CACHE_STORAGE_KEY),
  read: () => AsyncStorage.getItem(QUERY_CACHE_STORAGE_KEY),
  write: (text) => AsyncStorage.setItem(QUERY_CACHE_STORAGE_KEY, text),
};

/** Removes the pre-file AsyncStorage copy; failures don't matter (it's only a cache). */
const removeLegacyCache = () => AsyncStorage.removeItem(QUERY_CACHE_STORAGE_KEY).catch(() => undefined);

export const fileQueryCacheStore: PersistedQueryCacheStore = {
  async clear() {
    // Both removals are attempted even if one fails. A file that couldn't be deleted is
    // retried by the next hydration, which clears a cache whose owner doesn't match.
    const file = getCacheFile();
    const [fileResult] = await Promise.allSettled([
      file
        ? Promise.all([
            file.fs.deleteAsync(file.uri, { idempotent: true }),
            file.fs.deleteAsync(`${file.uri}.tmp`, { idempotent: true }),
          ])
        : Promise.resolve(),
      removeLegacyCache(),
    ]);
    if (fileResult.status === 'rejected') {
      throw fileResult.reason;
    }
  },
  async read() {
    const file = getCacheFile();
    if (!file) {
      return asyncStorageStore.read();
    }

    const info = await file.fs.getInfoAsync(file.uri);
    if (info.exists) {
      return file.fs.readAsStringAsync(file.uri);
    }

    // Interrupted between removing the old file and moving the new one in: the temp file is
    // complete (it's only moved after being fully written), so use it.
    const tempUri = `${file.uri}.tmp`;
    const tempInfo = await file.fs.getInfoAsync(tempUri);
    if (tempInfo.exists) {
      return file.fs.readAsStringAsync(tempUri);
    }

    // First launch after moving to a file: copy the old AsyncStorage value into the file, then
    // drop it. Reading it can throw on Android once it grew past ~2 MB; it's dropped then too.
    let legacy: string | null = null;
    try {
      legacy = await AsyncStorage.getItem(QUERY_CACHE_STORAGE_KEY);
    } catch (error) {
      console.warn('[queryCachePersistence] Could not read legacy cache; discarding it:', error);
      await removeLegacyCache();
      return null;
    }
    if (legacy === null) {
      return null;
    }
    try {
      await fileQueryCacheStore.write(legacy);
      await removeLegacyCache();
    } catch (error) {
      // Keep the old copy so a later launch can migrate it.
      console.warn('[queryCachePersistence] Could not migrate legacy cache yet:', error);
    }
    return legacy;
  },
  async write(text) {
    const file = getCacheFile();
    if (!file) {
      await asyncStorageStore.write(text);
      return;
    }

    // Write a temp file and swap it in, so a crash mid-write never leaves half a cache. If
    // the swap is interrupted, read() picks up the complete temp file.
    const tempUri = `${file.uri}.tmp`;
    await file.fs.writeAsStringAsync(tempUri, text);
    await file.fs.deleteAsync(file.uri, { idempotent: true });
    await file.fs.moveAsync({ from: tempUri, to: file.uri });
  },
};

let cacheStore: PersistedQueryCacheStore = fileQueryCacheStore;

/** Tests only: swap where the cache is kept. */
export function setPersistedQueryCacheStoreForTests(store: PersistedQueryCacheStore | null): void {
  cacheStore = store ?? fileQueryCacheStore;
}

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
    const raw = await cacheStore.read();
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
    if (error instanceof SyntaxError) {
      // Unreadable cache data: drop it so later launches don't keep failing on it.
      await clearPersistedQueryCache().catch(() => undefined);
    }
    return false;
  }
}

export async function clearPersistedQueryCache(): Promise<void> {
  await cacheStore.clear();
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

      await cacheStore.write(JSON.stringify(payload));
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
          storage: QUERY_CACHE_FILE_NAME,
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
