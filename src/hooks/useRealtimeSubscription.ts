import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

interface UseRealtimeSubscriptionOptions<T> {
  queryKey: QueryKey;
  enabled: boolean;
  initialData: T;
  subscribe: (onData: (data: T) => void, onError: (error: Error) => void) => () => void;
  logLabel?: string;
}

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
    return !queryClient.getQueryData(queryKey);
  });

  useEffect(() => {
    if (!enabled) {
      setIsSubscriptionLoading(false);
      return;
    }

    setError(null);
    if (!queryClient.getQueryData(queryKey)) {
      setIsSubscriptionLoading(true);
    }

    const unsubscribe = subscribe(
      (data) => {
        queryClient.setQueryData(queryKey, data);
        setError(null);
        setIsSubscriptionLoading(false);
      },
      (err) => {
        setError(err);
        setIsSubscriptionLoading(false);
        if (logLabel) {
          console.error(`[${logLabel}] Subscription error:`, err);
        }
      }
    );

    return () => unsubscribe();
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
  };
}
