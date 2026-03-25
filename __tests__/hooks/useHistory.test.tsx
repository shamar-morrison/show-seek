import i18n from '@/src/i18n';
import { useHistory, useMonthDetail } from '@/src/hooks/useHistory';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
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
});
