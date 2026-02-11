import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

interface UseRealtimeSubscriptionOptions<T> {
  queryKey: QueryKey;
  enabled: boolean;
  initialData: T;
  subscribe: (onData: (data: T) => void, onError: (error: Error) => void) => () => void;
  logLabel?: string;
}

interface SharedSubscriber<T> {
  onData: (data: T) => void;
  onError: (error: Error) => void;
}

interface SharedSubscriptionEntry {
  refCount: number;
  subscribers: Set<SharedSubscriber<unknown>>;
  unsubscribe: () => void;
}

// Ensure we only keep one Firestore listener per query key across the app.
const sharedSubscriptions = new Map<string, SharedSubscriptionEntry>();

export function useRealtimeSubscription<T>({
  queryKey,
  enabled,
  initialData,
  subscribe,
  logLabel,
}: UseRealtimeSubscriptionOptions<T>) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<Error | null>(null);
  const queryKeyHash = useMemo(() => JSON.stringify(queryKey), [queryKey]);
  const [isSubscriptionLoading, setIsSubscriptionLoading] = useState(() => {
    if (!enabled) return false;
    return queryClient.getQueryData(queryKey) === undefined;
  });
  const [hasReceivedData, setHasReceivedData] = useState(() => {
    if (!enabled) return false;
    return queryClient.getQueryData(queryKey) !== undefined;
  });

  useEffect(() => {
    if (!enabled) {
      setIsSubscriptionLoading(false);
      setHasReceivedData(false);
      return;
    }

    setError(null);
    if (queryClient.getQueryData(queryKey) === undefined) {
      setIsSubscriptionLoading(true);
      setHasReceivedData(false);
    } else {
      setIsSubscriptionLoading(false);
      setHasReceivedData(true);
    }

    const subscriber: SharedSubscriber<T> = {
      onData: (data) => {
        queryClient.setQueryData(queryKey, data);
        setError(null);
        setIsSubscriptionLoading(false);
        setHasReceivedData(true);
      },
      onError: (err) => {
        setError(err);
        setIsSubscriptionLoading(false);
        if (logLabel) {
          console.error(`[${logLabel}] Subscription error:`, err);
        }
      },
    };

    let entry = sharedSubscriptions.get(queryKeyHash);

    if (!entry) {
      const subscribers = new Set<SharedSubscriber<unknown>>();
      const unsubscribe = subscribe(
        (data) => {
          const activeEntry = sharedSubscriptions.get(queryKeyHash);
          if (!activeEntry) return;
          activeEntry.subscribers.forEach((sub) => {
            (sub as SharedSubscriber<T>).onData(data);
          });
        },
        (err) => {
          const activeEntry = sharedSubscriptions.get(queryKeyHash);
          if (!activeEntry) return;
          activeEntry.subscribers.forEach((sub) => {
            (sub as SharedSubscriber<T>).onError(err);
          });
        }
      );

      entry = {
        refCount: 0,
        subscribers,
        unsubscribe,
      };

      sharedSubscriptions.set(queryKeyHash, entry);
    }

    entry.refCount += 1;
    entry.subscribers.add(subscriber as SharedSubscriber<unknown>);

    return () => {
      const currentEntry = sharedSubscriptions.get(queryKeyHash);
      if (!currentEntry) return;

      currentEntry.subscribers.delete(subscriber as SharedSubscriber<unknown>);
      currentEntry.refCount -= 1;

      if (currentEntry.refCount <= 0) {
        currentEntry.unsubscribe();
        sharedSubscriptions.delete(queryKeyHash);
      }
    };
  }, [enabled, queryClient, queryKeyHash, subscribe, logLabel]);

  const query = useQuery({
    queryKey,
    queryFn: () => queryClient.getQueryData<T>(queryKey) ?? initialData,
    enabled,
    staleTime: Infinity,
    meta: { error },
  });

  return {
    ...query,
    isLoading: isSubscriptionLoading,
    error,
    hasReceivedData,
  };
}
