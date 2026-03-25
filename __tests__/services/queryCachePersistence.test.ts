import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, dehydrate } from '@tanstack/react-query';

import {
  clearPersistedQueryCache,
  createPersistedQueryCacheSyncController,
  hydratePersistedQueryCache,
  subscribeToPersistedQueryCache,
} from '@/src/services/queryCachePersistence';

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const createOwnerResolver = (ownerId: string | null) => ({
  getOwnerId: () => ownerId,
});

const getPersistedPayload = (callIndex = 0) => {
  const setItemCall = (AsyncStorage.setItem as jest.Mock).mock.calls[callIndex];
  return JSON.parse(setItemCall[1] as string) as {
    ownerId: string;
    savedAt: number;
    state: {
      queries: Array<{
        queryKey: unknown[];
        state: {
          data: unknown;
        };
      }>;
    };
  };
};

describe('queryCachePersistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns false and logs when hydration storage reads fail', async () => {
    const queryClient = new QueryClient();
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('storage read failed'));

    await expect(hydratePersistedQueryCache(queryClient, 'user-1')).resolves.toBe(false);

    expect(consoleSpy).toHaveBeenCalledWith(
      '[queryCachePersistence] Failed to hydrate query cache:',
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it('hydrates persisted cache only when the stored owner matches the current user', async () => {
    const sourceClient = new QueryClient();
    const targetClient = new QueryClient();
    const taggedDate = { __type: 'Date', value: 'not-a-date' };

    sourceClient.setQueryData(['ratings', 'user-1'], {
      ratedAt: taggedDate,
    });

    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify({
        ownerId: 'user-1',
        state: dehydrate(sourceClient),
      })
    );

    await expect(hydratePersistedQueryCache(targetClient, 'user-1')).resolves.toBe(true);

    expect(targetClient.getQueryData(['ratings', 'user-1'])).toEqual({
      ratedAt: taggedDate,
    });
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  });

  it('clears legacy ownerless persisted cache before hydrating', async () => {
    const sourceClient = new QueryClient();
    const targetClient = new QueryClient();

    sourceClient.setQueryData(['ratings', 'user-1'], [{ id: 'rating-1' }]);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify({
        state: dehydrate(sourceClient),
      })
    );

    await expect(hydratePersistedQueryCache(targetClient, 'user-1')).resolves.toBe(false);

    expect(targetClient.getQueryData(['ratings', 'user-1'])).toBeUndefined();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('showseek_query_cache_v1');
  });

  it('clears persisted cache when the stored owner differs from the current user', async () => {
    const sourceClient = new QueryClient();
    const targetClient = new QueryClient();

    sourceClient.setQueryData(['ratings', 'user-1'], [{ id: 'rating-1' }]);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify({
        ownerId: 'user-1',
        state: dehydrate(sourceClient),
      })
    );

    await expect(hydratePersistedQueryCache(targetClient, 'user-2')).resolves.toBe(false);

    expect(targetClient.getQueryData(['ratings', 'user-1'])).toBeUndefined();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('showseek_query_cache_v1');
  });

  it('clears persisted cache when no authenticated owner is available', async () => {
    const sourceClient = new QueryClient();
    const targetClient = new QueryClient();

    sourceClient.setQueryData(['ratings', 'user-1'], [{ id: 'rating-1' }]);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify({
        ownerId: 'user-1',
        state: dehydrate(sourceClient),
      })
    );

    await expect(hydratePersistedQueryCache(targetClient, null)).resolves.toBe(false);

    expect(targetClient.getQueryData(['ratings', 'user-1'])).toBeUndefined();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('showseek_query_cache_v1');
  });

  it('logs when debounced query cache persistence fails', async () => {
    jest.useFakeTimers();
    const queryClient = new QueryClient();
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    (AsyncStorage.setItem as jest.Mock).mockRejectedValue(new Error('persist failed'));

    const unsubscribe = subscribeToPersistedQueryCache(queryClient, createOwnerResolver('user-1'));

    queryClient.setQueryData(['ratings', 'user-1'], [{ id: 'rating-1' }]);
    await jest.runAllTimersAsync();
    await flushMicrotasks();

    expect(consoleSpy).toHaveBeenCalledWith(
      '[queryCachePersistence] Query cache persist failed:',
      expect.objectContaining({
        error: expect.any(Error),
        storageKey: 'showseek_query_cache_v1',
        debounceMs: 300,
        scheduler: 'schedulePersist',
      })
    );

    unsubscribe();
    consoleSpy.mockRestore();
  });

  it('persists genres queries across cache writes', async () => {
    jest.useFakeTimers();
    const queryClient = new QueryClient();

    const unsubscribe = subscribeToPersistedQueryCache(queryClient, createOwnerResolver('user-1'));

    queryClient.setQueryData(['genres', 'movie', 'en-US'], {
      28: 'Action',
    });

    await jest.runAllTimersAsync();

    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
    expect(getPersistedPayload()).toEqual(
      expect.objectContaining({
        ownerId: 'user-1',
        state: expect.objectContaining({
          queries: [
            expect.objectContaining({
              queryKey: ['genres', 'movie', 'en-US'],
              state: expect.objectContaining({
                data: {
                  28: 'Action',
                },
              }),
            }),
          ],
        }),
      })
    );

    unsubscribe();
  });

  it('persists reminder detail queries across cache writes', async () => {
    jest.useFakeTimers();
    const queryClient = new QueryClient();

    const unsubscribe = subscribeToPersistedQueryCache(queryClient, createOwnerResolver('user-1'));

    queryClient.setQueryData(['reminder', 'user-1', 'movie', 101], {
      id: 'reminder-1',
      mediaId: 101,
      mediaType: 'movie',
    });

    await jest.runAllTimersAsync();

    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
    expect(getPersistedPayload()).toEqual(
      expect.objectContaining({
        ownerId: 'user-1',
        state: expect.objectContaining({
          queries: [
            expect.objectContaining({
              queryKey: ['reminder', 'user-1', 'movie', 101],
              state: expect.objectContaining({
                data: {
                  id: 'reminder-1',
                  mediaId: 101,
                  mediaType: 'movie',
                },
              }),
            }),
          ],
        }),
      })
    );

    unsubscribe();
  });

  it('cancels pending debounced writes when sync is paused', async () => {
    jest.useFakeTimers();
    const queryClient = new QueryClient();
    const controller = createPersistedQueryCacheSyncController(
      queryClient,
      createOwnerResolver('user-1')
    );

    controller.resume();
    queryClient.setQueryData(['ratings', 'user-1'], [{ id: 'rating-1' }]);

    await controller.pause();
    await jest.runOnlyPendingTimersAsync();

    expect(AsyncStorage.setItem).not.toHaveBeenCalled();

    await controller.dispose();
  });

  it('waits for in-flight writes to finish before pause resolves', async () => {
    jest.useFakeTimers();
    const queryClient = new QueryClient();
    const setItemResolution = { current: null as null | (() => void) };
    let pauseResolved = false;

    (AsyncStorage.setItem as jest.Mock).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          setItemResolution.current = resolve;
        })
    );

    const controller = createPersistedQueryCacheSyncController(
      queryClient,
      createOwnerResolver('user-1')
    );
    controller.resume();

    queryClient.setQueryData(['ratings', 'user-1'], [{ id: 'rating-1' }]);
    jest.advanceTimersByTime(300);
    await flushMicrotasks();

    const pausePromise = controller.pause().then(() => {
      pauseResolved = true;
    });

    await flushMicrotasks();
    expect(pauseResolved).toBe(false);

    const resolvePersistWrite = setItemResolution.current;
    if (typeof resolvePersistWrite !== 'function') {
      throw new Error('Expected an in-flight persist write before pausing sync.');
    }

    resolvePersistWrite();
    await pausePromise;

    expect(pauseResolved).toBe(true);

    await controller.dispose();
  });

  it('prevents stale persisted writes from landing after the clear sequence pauses sync', async () => {
    jest.useFakeTimers();
    const queryClient = new QueryClient();
    const operations: string[] = [];
    const setItemResolution = { current: null as null | (() => void) };

    (AsyncStorage.setItem as jest.Mock).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          operations.push('setItem-start');
          setItemResolution.current = () => {
            operations.push('setItem-finish');
            resolve();
          };
        })
    );
    (AsyncStorage.removeItem as jest.Mock).mockImplementation(async () => {
      operations.push('removeItem');
    });

    const controller = createPersistedQueryCacheSyncController(
      queryClient,
      createOwnerResolver('user-1')
    );
    controller.resume();

    queryClient.setQueryData(['ratings', 'user-1'], [{ id: 'rating-1' }]);
    jest.advanceTimersByTime(300);
    await flushMicrotasks();

    const clearSequence = (async () => {
      await controller.pause();
      await clearPersistedQueryCache();
    })();

    await flushMicrotasks();
    expect(operations).toEqual(['setItem-start']);

    const resolvePersistWrite = setItemResolution.current;
    if (typeof resolvePersistWrite !== 'function') {
      throw new Error('Expected an in-flight persist write before clearing persisted cache.');
    }

    resolvePersistWrite();
    await clearSequence;

    expect(operations).toEqual(['setItem-start', 'setItem-finish', 'removeItem']);

    await controller.dispose();
  });

  it('serializes persist writes so older writes cannot overtake newer state', async () => {
    jest.useFakeTimers();
    const queryClient = new QueryClient();
    let storedPayload: string | null = null;
    const setItemResolvers: Array<() => void> = [];

    (AsyncStorage.setItem as jest.Mock).mockImplementation(
      (_storageKey: string, value: string) =>
        new Promise<void>((resolve) => {
          setItemResolvers.push(() => {
            storedPayload = value;
            resolve();
          });
        })
    );

    const unsubscribe = subscribeToPersistedQueryCache(queryClient, createOwnerResolver('user-1'));

    queryClient.setQueryData(['ratings', 'user-1'], [{ id: 'rating-1' }]);
    jest.advanceTimersByTime(300);
    await flushMicrotasks();

    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);

    queryClient.setQueryData(['ratings', 'user-1'], [{ id: 'rating-2' }]);
    jest.advanceTimersByTime(300);
    await flushMicrotasks();

    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);

    setItemResolvers[0]?.();
    await flushMicrotasks();
    await flushMicrotasks();

    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(2);

    const secondPersistedPayload = getPersistedPayload(1);
    expect(secondPersistedPayload.state.queries).toEqual([
      expect.objectContaining({
        queryKey: ['ratings', 'user-1'],
        state: expect.objectContaining({
          data: [{ id: 'rating-2' }],
        }),
      }),
    ]);

    setItemResolvers[1]?.();
    await flushMicrotasks();

    expect(storedPayload).toBe((AsyncStorage.setItem as jest.Mock).mock.calls[1][1]);

    unsubscribe();
  });

  it('does not persist query cache when there is no authenticated owner', async () => {
    jest.useFakeTimers();
    const queryClient = new QueryClient();
    const controller = createPersistedQueryCacheSyncController(queryClient, createOwnerResolver(null));

    controller.resume();
    queryClient.setQueryData(['ratings', 'user-1'], [{ id: 'rating-1' }]);

    await jest.runAllTimersAsync();
    await flushMicrotasks();

    expect(AsyncStorage.setItem).not.toHaveBeenCalled();

    await controller.dispose();
  });
});
