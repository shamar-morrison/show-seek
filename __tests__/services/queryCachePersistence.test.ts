import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, dehydrate } from '@tanstack/react-query';

import {
  hydratePersistedQueryCache,
  subscribeToPersistedQueryCache,
} from '@/src/services/queryCachePersistence';

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const getPersistedPayload = (callIndex = 0) => {
  const setItemCall = (AsyncStorage.setItem as jest.Mock).mock.calls[callIndex];
  return JSON.parse(setItemCall[1] as string) as {
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
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns false and logs when hydration storage reads fail', async () => {
    const queryClient = new QueryClient();
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('storage read failed'));

    await expect(hydratePersistedQueryCache(queryClient)).resolves.toBe(false);

    expect(consoleSpy).toHaveBeenCalledWith(
      '[queryCachePersistence] Failed to hydrate query cache:',
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it('does not hydrate invalid serialized dates as Invalid Date', async () => {
    const sourceClient = new QueryClient();
    const targetClient = new QueryClient();
    const taggedDate = { __type: 'Date', value: 'not-a-date' };

    sourceClient.setQueryData(['ratings', 'user-1'], {
      ratedAt: taggedDate,
    });

    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify({
        state: dehydrate(sourceClient),
      })
    );

    await expect(hydratePersistedQueryCache(targetClient)).resolves.toBe(true);

    expect(targetClient.getQueryData(['ratings', 'user-1'])).toEqual({
      ratedAt: taggedDate,
    });
  });

  it('logs when debounced query cache persistence fails', async () => {
    jest.useFakeTimers();
    const queryClient = new QueryClient();
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    (AsyncStorage.setItem as jest.Mock).mockRejectedValue(new Error('persist failed'));

    const unsubscribe = subscribeToPersistedQueryCache(queryClient);

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

    const unsubscribe = subscribeToPersistedQueryCache(queryClient);

    queryClient.setQueryData(['genres', 'movie', 'en-US'], {
      28: 'Action',
    });

    await jest.runAllTimersAsync();

    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
    expect(getPersistedPayload()).toEqual(
      expect.objectContaining({
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

    const unsubscribe = subscribeToPersistedQueryCache(queryClient);

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
});
