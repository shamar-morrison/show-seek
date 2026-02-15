import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';

const mockAddToList = jest.fn();
const mockGetUserLists = jest.fn();

const mockAuthState: { user: { uid: string } | null } = {
  user: { uid: 'test-user-id' },
};

const mockPremiumState = {
  isPremium: false,
  isLoading: false,
};

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => mockPremiumState,
}));

jest.mock('@/src/context/auth', () => ({
  useAuth: () => mockAuthState,
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
    getUserLists: (...args: any[]) => mockGetUserLists(...args),
  },
  DEFAULT_LISTS: [],
}));

import { PremiumLimitError, useAddToList, useMediaLists } from '@/src/hooks/useLists';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
};

const createDeferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
};

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeAll(() => {
  notifyManager.setNotifyFunction((fn: () => void) => act(fn));
});

afterAll(() => {
  notifyManager.setNotifyFunction((fn: () => void) => fn());
});

describe('useAddToList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.user = { uid: 'test-user-id' };
    mockAddToList.mockResolvedValue(undefined);
    mockGetUserLists.mockResolvedValue([]);
    mockPremiumState.isPremium = false;
    mockPremiumState.isLoading = false;
  });

  it('enforces free tier item limits before optimistic updates', async () => {
    const client = createQueryClient();

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
    const client = createQueryClient();

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

describe('useMediaLists', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.user = { uid: 'test-user-id' };
    mockGetUserLists.mockResolvedValue([]);
  });

  it('loads membership in lite mode defaults', async () => {
    mockGetUserLists.mockResolvedValueOnce([
      {
        id: 'watchlist',
        name: 'Watchlist',
        items: {
          123: {
            id: 123,
            title: 'Example',
            poster_path: null,
            media_type: 'movie',
            vote_average: 7.5,
            release_date: '2024-01-01',
            addedAt: Date.now(),
          },
        },
      },
      {
        id: 'favorites',
        name: 'Favorites',
        items: {},
      },
    ]);

    const client = createQueryClient();
    const { result } = renderHook(() => useMediaLists(123), {
      wrapper: createWrapper(client),
    });

    expect(mockGetUserLists).toHaveBeenCalledWith('test-user-id');

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.membership).toEqual({ watchlist: true });
    });
  });

  it('reports loading while query is pending, then resolves', async () => {
    const deferred = createDeferred<any[]>();
    mockGetUserLists.mockReturnValueOnce(deferred.promise);

    const client = createQueryClient();
    const { result } = renderHook(() => useMediaLists(456), {
      wrapper: createWrapper(client),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.membership).toEqual({});

    act(() => {
      deferred.resolve([
        {
          id: 'favorites',
          name: 'Favorites',
          items: {
            456: {
              id: 456,
              title: 'Example Show',
              poster_path: null,
              media_type: 'tv',
              vote_average: 8.1,
              release_date: '2023-04-01',
              addedAt: Date.now(),
            },
          },
        },
      ]);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.membership).toEqual({ favorites: true });
    });
  });

  it('does not fetch when signed out', () => {
    mockAuthState.user = null;

    const client = createQueryClient();
    const { result } = renderHook(() => useMediaLists(999), {
      wrapper: createWrapper(client),
    });

    expect(mockGetUserLists).not.toHaveBeenCalled();
    expect(result.current.membership).toEqual({});
    expect(result.current.isLoading).toBe(false);
  });
});
