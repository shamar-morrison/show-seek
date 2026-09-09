import i18n from '@/src/i18n';
import { useHistory, useMonthDetail } from '@/src/hooks/useHistory';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';

const mockAuthState = {
  user: { uid: 'test-user-id', isAnonymous: false } as
    | { uid: string; isAnonymous?: boolean }
    | null,
};
const mockFetchUserHistory = jest.fn();
const mockFetchMonthDetail = jest.fn();

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({
    user: mockAuthState.user,
  }),
}));

jest.mock('@/src/hooks/useGenres', () => ({
  useAllGenres: () => ({
    data: {
      1: 'Drama',
    },
  }),
}));

jest.mock('@/src/services/HistoryService', () => ({
  historyService: {
    fetchUserHistory: (...args: unknown[]) => mockFetchUserHistory(...args),
    fetchMonthDetail: (...args: unknown[]) => mockFetchMonthDetail(...args),
  },
}));

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

describe('useHistory', () => {
  beforeAll(() => {
    notifyManager.setNotifyFunction((fn: () => void) => act(fn));
  });

  afterAll(() => {
    notifyManager.setNotifyFunction((fn: () => void) => fn());
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.user = { uid: 'test-user-id', isAnonymous: false };
  });

  it('does not fetch history when signed out', () => {
    const client = createQueryClient();
    mockAuthState.user = null;

    const { result } = renderHook(() => useHistory(), {
      wrapper: createWrapper(client),
    });

    expect(result.current.data).toBeUndefined();
    expect(mockFetchUserHistory).not.toHaveBeenCalled();
  });

  it('does not fetch month detail for anonymous users', () => {
    const client = createQueryClient();
    mockAuthState.user = { uid: 'anon-1', isAnonymous: true };

    const { result } = renderHook(() => useMonthDetail('2026-03'), {
      wrapper: createWrapper(client),
    });

    expect(result.current.data).toBeUndefined();
    expect(mockFetchMonthDetail).not.toHaveBeenCalled();
  });

  it('refetches history when the backfill settles with stamps', async () => {
    const client = createQueryClient();
    mockFetchUserHistory.mockResolvedValue({
      monthlyStats: [],
      currentStreak: 0,
      longestStreak: 0,
      mostActiveDay: null,
      mostActiveTimeOfDay: null,
      totalWatched: 0,
      totalRated: 0,
      totalAddedToLists: 0,
      totalWatchMinutes: 0,
    });

    renderHook(() => useHistory(), { wrapper: createWrapper(client) });

    await waitFor(() => expect(mockFetchUserHistory).toHaveBeenCalledTimes(1));
    const onBackfillSettled = mockFetchUserHistory.mock.calls[0][2];
    expect(typeof onBackfillSettled).toBe('function');

    await act(async () => {
      onBackfillSettled(true);
    });

    await waitFor(() => expect(mockFetchUserHistory).toHaveBeenCalledTimes(2));
  });

  it('does not refetch history when the backfill settles without stamps', async () => {
    const client = createQueryClient();
    mockFetchUserHistory.mockResolvedValue({
      monthlyStats: [],
      currentStreak: 0,
      longestStreak: 0,
      mostActiveDay: null,
      mostActiveTimeOfDay: null,
      totalWatched: 0,
      totalRated: 0,
      totalAddedToLists: 0,
      totalWatchMinutes: 0,
    });

    renderHook(() => useHistory(), { wrapper: createWrapper(client) });

    await waitFor(() => expect(mockFetchUserHistory).toHaveBeenCalledTimes(1));
    const onBackfillSettled = mockFetchUserHistory.mock.calls[0][2];

    await act(async () => {
      onBackfillSettled(false);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(mockFetchUserHistory).toHaveBeenCalledTimes(1);
  });

  it('refetches month detail when the backfill settles with stamps', async () => {
    const client = createQueryClient();
    mockFetchMonthDetail.mockResolvedValue({
      month: '2026-03',
      monthName: 'March 2026',
      stats: {
        month: '2026-03',
        monthName: 'March 2026',
        watched: 0,
        rated: 0,
        addedToLists: 0,
        averageRating: null,
        totalWatchMinutes: 0,
        topGenres: [],
        comparisonToPrevious: null,
      },
      items: { watched: [], rated: [], added: [] },
    });

    renderHook(() => useMonthDetail('2026-03'), { wrapper: createWrapper(client) });

    await waitFor(() => expect(mockFetchMonthDetail).toHaveBeenCalledTimes(1));
    const onBackfillSettled = mockFetchMonthDetail.mock.calls[0][2];
    expect(typeof onBackfillSettled).toBe('function');

    await act(async () => {
      onBackfillSettled(true);
    });

    await waitFor(() => expect(mockFetchMonthDetail).toHaveBeenCalledTimes(2));
  });
});
