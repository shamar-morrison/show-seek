import i18n from '@/src/i18n';
import { useAuth } from '@/src/context/auth';
import { useAllGenres } from '@/src/hooks/useGenres';
import { historyService } from '@/src/services/HistoryService';
import type { HistoryData, MonthlyDetail } from '@/src/types/history';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

/**
 * Hook to fetch and cache user history/stats data
 *
 * When the background watch-time backfill stamps measured runtimes, the
 * query is invalidated so totals refresh from estimates to measured values.
 * Settle-triggered refetches always terminate: refetched data has nothing
 * new to stamp, so no further invalidation fires.
 */
export function useHistory(monthsBack = 6) {
  const { user } = useAuth();
  const userId = user && !user.isAnonymous ? user.uid : undefined;
  const { data: genreMap = {} } = useAllGenres();
  const queryClient = useQueryClient();

  return useQuery<HistoryData>({
    queryKey: ['userHistory', userId, monthsBack, i18n.language],
    queryFn: () =>
      historyService.fetchUserHistory(genreMap, monthsBack, (didStamp) => {
        if (didStamp) {
          void queryClient.invalidateQueries({ queryKey: ['userHistory'] });
        }
      }),
    enabled: !!userId && Object.keys(genreMap).length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}

/**
 * Hook to fetch detailed data for a specific month
 */
export function useMonthDetail(month: string | null) {
  const { user } = useAuth();
  const userId = user && !user.isAnonymous ? user.uid : undefined;
  const { data: genreMap = {} } = useAllGenres();
  const queryClient = useQueryClient();

  return useQuery<MonthlyDetail | null>({
    queryKey: ['monthDetail', userId, month, i18n.language],
    queryFn: () =>
      month
        ? historyService.fetchMonthDetail(month, genreMap, (didStamp) => {
            if (didStamp) {
              void queryClient.invalidateQueries({ queryKey: ['monthDetail'] });
            }
          })
        : null,
    enabled: !!userId && !!month && Object.keys(genreMap).length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}

/**
 * Hook to check if user has any history data
 */
export function useHasHistory() {
  const { data, isLoading } = useHistory();

  const hasHistory = useMemo(() => {
    if (!data) return false;
    return data.totalWatched > 0 || data.totalRated > 0 || data.totalAddedToLists > 0;
  }, [data]);

  return { hasHistory, isLoading };
}
