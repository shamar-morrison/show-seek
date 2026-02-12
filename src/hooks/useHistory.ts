import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAuth } from '../context/auth';
import i18n from '../i18n';
import { historyService } from '../services/HistoryService';
import type { HistoryData, MonthlyDetail } from '../types/history';
import { useAllGenres } from './useGenres';

/**
 * Hook to fetch and cache user history/stats data
 */
export function useHistory(monthsBack = 6) {
  const { user } = useAuth();
  const { data: genreMap = {} } = useAllGenres();

  return useQuery<HistoryData>({
    queryKey: ['userHistory', user?.uid, monthsBack, i18n.language],
    queryFn: () => historyService.fetchUserHistory(genreMap, monthsBack),
    enabled: !!user && Object.keys(genreMap).length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}

/**
 * Hook to fetch detailed data for a specific month
 */
export function useMonthDetail(month: string | null) {
  const { user } = useAuth();
  const { data: genreMap = {} } = useAllGenres();

  return useQuery<MonthlyDetail | null>({
    queryKey: ['monthDetail', user?.uid, month, i18n.language],
    queryFn: () => (month ? historyService.fetchMonthDetail(month, genreMap) : null),
    enabled: !!user && !!month && Object.keys(genreMap).length > 0,
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
