import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import React from 'react';

const mockAddToList = jest.fn();

const mockPremiumState = {
  isPremium: false,
  isLoading: false,
};

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => mockPremiumState,
}));

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({
    user: { uid: 'test-user-id' },
  }),
}));

jest.mock('@/src/firebase/config', () => ({
  auth: {
    currentUser: { uid: 'test-user-id' },
  },
  db: {},
}));

jest.mock('@/src/services/ListService', () => ({
  listService: {
    addToList: (...args: any[]) => mockAddToList(...args),
  },
  DEFAULT_LISTS: [],
}));

import { PremiumLimitError, useAddToList } from '@/src/hooks/useLists';

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useAddToList', () => {
  beforeAll(() => {
    notifyManager.setNotifyFunction((fn: () => void) => act(fn));
  });

  afterAll(() => {
    notifyManager.setNotifyFunction((fn: () => void) => fn());
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAddToList.mockResolvedValue(undefined);
    mockPremiumState.isPremium = false;
    mockPremiumState.isLoading = false;
  });

  it('enforces free tier item limits before optimistic updates', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const items: Record<string, any> = {};
    for (let i = 0; i < 50; i += 1) {
      items[i] = { id: i, media_type: 'movie', addedAt: Date.now() };
    }

    client.setQueryData(
      ['lists', 'test-user-id'],
      [
        {
          id: 'watchlist',
          name: 'Watchlist',
          items,
        },
      ]
    );

    const { result } = renderHook(() => useAddToList(), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          listId: 'watchlist',
          mediaItem: {
            id: 999,
            title: 'New Movie',
            media_type: 'movie',
            poster_path: null,
            vote_average: 0,
            release_date: '2024-01-01',
          },
        })
      ).rejects.toBeInstanceOf(PremiumLimitError);
    });

    expect(mockAddToList).not.toHaveBeenCalled();
  });

  it('rolls back optimistic updates when mutation fails', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const initialLists = [
      {
        id: 'watchlist',
        name: 'Watchlist',
        items: {
          1: { id: 1, media_type: 'movie', addedAt: Date.now() },
        },
      },
    ];

    client.setQueryData(['lists', 'test-user-id'], initialLists);
    mockAddToList.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useAddToList(), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          listId: 'watchlist',
          mediaItem: {
            id: 2,
            title: 'Another Movie',
            media_type: 'movie',
            poster_path: null,
            vote_average: 0,
            release_date: '2024-01-01',
          },
        })
      ).rejects.toThrow('Network error');
    });

    expect(client.getQueryData(['lists', 'test-user-id'])).toEqual(initialLists);
  });
});
