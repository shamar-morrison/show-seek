import i18n from '@/src/i18n';
import { useHistory, useMonthDetail } from '@/src/hooks/useHistory';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import React from 'react';

const mockFirestoreAccessState = {
  firestoreUserId: 'test-user-id' as string | undefined,
  canUseNonCriticalReads: true,
};
const mockFetchUserHistory = jest.fn();
const mockFetchMonthDetail = jest.fn();

jest.mock('@/src/hooks/useFirestoreAccess', () => ({
  useFirestoreAccess: () => ({
    firestoreUserId: mockFirestoreAccessState.firestoreUserId,
    canUseNonCriticalReads: mockFirestoreAccessState.canUseNonCriticalReads,
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

describe('useHistory access masking', () => {
  beforeAll(() => {
    notifyManager.setNotifyFunction((fn: () => void) => act(fn));
  });

  afterAll(() => {
    notifyManager.setNotifyFunction((fn: () => void) => fn());
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockFirestoreAccessState.firestoreUserId = 'test-user-id';
    mockFirestoreAccessState.canUseNonCriticalReads = true;
  });

  it('masks cached history data when non-critical reads are revoked', () => {
    const client = createQueryClient();
    client.setQueryData(['userHistory', 'test-user-id', 6, i18n.language, true], {
      totalWatched: 10,
      totalRated: 4,
      totalAddedToLists: 2,
    });
    mockFirestoreAccessState.canUseNonCriticalReads = false;

    const { result } = renderHook(() => useHistory(), {
      wrapper: createWrapper(client),
    });

    expect(result.current.data).toBeUndefined();
    expect(mockFetchUserHistory).not.toHaveBeenCalled();
  });

  it('masks cached month detail data when non-critical reads are revoked', () => {
    const client = createQueryClient();
    client.setQueryData(['monthDetail', 'test-user-id', '2026-03', i18n.language, true], {
      month: '2026-03',
      items: [],
      totalWatchTime: 0,
    });
    mockFirestoreAccessState.canUseNonCriticalReads = false;

    const { result } = renderHook(() => useMonthDetail('2026-03'), {
      wrapper: createWrapper(client),
    });

    expect(result.current.data).toBeUndefined();
    expect(mockFetchMonthDetail).not.toHaveBeenCalled();
  });
});
