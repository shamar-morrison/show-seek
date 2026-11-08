import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import type { UserList } from '@/src/services/ListService';

const mockResolveListItemRuntimes = jest.fn();
const mockGetUserRatings = jest.fn();

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({ user: { uid: 'user-1', isAnonymous: false } }),
}));

jest.mock('@/src/services/WatchTimeBackfill', () => ({
  resolveListItemRuntimes: (...args: unknown[]) => mockResolveListItemRuntimes(...args),
}));

jest.mock('@/src/services/RatingService', () => ({
  ratingService: {
    getUserRatings: (...args: unknown[]) => mockGetUserRatings(...args),
  },
}));

import {
  resetListItemRuntimesSessionForTests,
  useListItemRuntimes,
} from '@/src/hooks/useListItemRuntimes';
import { useUserRatingMap } from '@/src/hooks/useRatings';

const createQueryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const makeList = (): UserList => ({
  id: 'my-list',
  name: 'My List',
  createdAt: 1,
  items: {
    'movie-1': {
      id: 1,
      title: 'Has runtime',
      media_type: 'movie',
      poster_path: null,
      vote_average: 7,
      release_date: '2020-01-01',
      addedAt: 10,
      runtimeMinutes: 100,
    },
    'movie-2': {
      id: 2,
      title: 'Missing runtime',
      media_type: 'movie',
      poster_path: null,
      vote_average: 7,
      release_date: '2020-01-01',
      addedAt: 20,
    },
    'tv-3': {
      id: 3,
      name: 'Missing show runtime',
      title: '',
      media_type: 'tv',
      poster_path: null,
      vote_average: 7,
      release_date: '2020-01-01',
      addedAt: 30,
    },
  },
  pageCount: 1,
  overflowItemPages: { 'tv-3': 1 },
});

beforeAll(() => {
  notifyManager.setNotifyFunction((fn: () => void) => act(fn));
});

describe('useListItemRuntimes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetListItemRuntimesSessionForTests();
  });

  it('does nothing while the runtime filter is off', () => {
    const client = createQueryClient();
    const { result } = renderHook(() => useListItemRuntimes(makeList(), false), {
      wrapper: createWrapper(client),
    });

    expect(mockResolveListItemRuntimes).not.toHaveBeenCalled();
    expect(result.current.isResolving).toBe(false);
    // Runtimes are still unknown, so a count based on them would be a guess.
    expect(result.current.isComplete).toBe(false);
  });

  it('looks up only missing runtimes, reports progress, and patches the cached list', async () => {
    const client = createQueryClient();
    const list = makeList();
    client.setQueryData(['lists', 'user-1'], [list]);

    let resolveRun: (value: Map<string, number>) => void = () => {};
    mockResolveListItemRuntimes.mockImplementation((_items, options) => {
      options.onProgress({ done: 1, total: 2, runtimes: new Map([['movie:2', 95]]) });
      return new Promise((resolve) => {
        resolveRun = resolve;
      });
    });

    const { result } = renderHook(() => useListItemRuntimes(list, true), {
      wrapper: createWrapper(client),
    });

    const [items] = mockResolveListItemRuntimes.mock.calls[0];
    expect(items).toEqual([
      expect.objectContaining({ itemKey: 'movie-2', mediaId: 2, page: 0 }),
      expect.objectContaining({ itemKey: 'tv-3', mediaId: 3, mediaType: 'tv', page: 1 }),
    ]);
    expect(result.current.isResolving).toBe(true);
    expect(result.current.done).toBe(1);
    expect(result.current.total).toBe(2);
    expect(result.current.runtimes.get('movie:2')).toBe(95);

    await act(async () => {
      resolveRun(
        new Map([
          ['movie:2', 95],
          ['tv:3', 45],
        ])
      );
    });

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.runtimes.get('tv:3')).toBe(45);
    expect(result.current.isComplete).toBe(true);

    const cached = client.getQueryData<UserList[]>(['lists', 'user-1'])![0];
    expect(cached.items['movie-2'].runtimeMinutes).toBe(95);
    expect(cached.items['tv-3'].runtimeMinutes).toBe(45);
    expect(cached.items['movie-1'].runtimeMinutes).toBe(100);
  });

  it('saves under the key a legacy item is stored under', async () => {
    const client = createQueryClient();
    mockResolveListItemRuntimes.mockResolvedValue(new Map());
    const list: UserList = {
      ...makeList(),
      items: { 'movie-2': makeList().items['movie-2'] },
      storedItemKeys: { 'movie-2': '2' },
      pageCount: 0,
      overflowItemPages: undefined,
    };

    const { result } = renderHook(() => useListItemRuntimes(list, true), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.isResolving).toBe(false));

    const [items, options] = mockResolveListItemRuntimes.mock.calls[0];
    expect(items).toEqual([expect.objectContaining({ itemKey: '2', mediaId: 2 })]);
    // Stored keys are known, so the default save is used.
    expect(options.stampRuntimes).toBeUndefined();
  });

  it("doesn't save runtimes for a cached list without stored keys", async () => {
    const client = createQueryClient();
    mockResolveListItemRuntimes.mockResolvedValue(new Map());
    const { storedItemKeys: _ignored, ...cachedList } = { ...makeList(), storedItemKeys: {} };

    const { result } = renderHook(() => useListItemRuntimes(cachedList, true), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.isResolving).toBe(false));

    const [, options] = mockResolveListItemRuntimes.mock.calls[0];
    expect(typeof options.stampRuntimes).toBe('function');
  });

  it('never looks up the same title twice in a session', async () => {
    const client = createQueryClient();
    mockResolveListItemRuntimes.mockResolvedValue(new Map());

    const first = renderHook(() => useListItemRuntimes(makeList(), true), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(first.result.current.isResolving).toBe(false));
    first.unmount();

    renderHook(() => useListItemRuntimes(makeList(), true), { wrapper: createWrapper(client) });

    expect(mockResolveListItemRuntimes).toHaveBeenCalledTimes(1);
  });
});

describe('useUserRatingMap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not load ratings while the filter is off', () => {
    const client = createQueryClient();
    renderHook(() => useUserRatingMap(false), { wrapper: createWrapper(client) });

    expect(mockGetUserRatings).not.toHaveBeenCalled();
  });

  it('uses cached ratings without refreshing them, even when they are old', () => {
    const client = createQueryClient();
    client.setQueryData(
      ['ratings', 'user-1'],
      [
        { id: '1', mediaType: 'movie', rating: 9, ratedAt: 1 },
        { id: '3', mediaType: 'tv', rating: 6, ratedAt: 1 },
        { id: 'episode-3-1-1', mediaType: 'episode', rating: 10, ratedAt: 1 },
      ],
      { updatedAt: 0 }
    );

    const { result } = renderHook(() => useUserRatingMap(true), {
      wrapper: createWrapper(client),
    });

    expect(mockGetUserRatings).not.toHaveBeenCalled();
    expect(result.current.ratings).toEqual(
      new Map([
        ['movie:1', 9],
        ['tv:3', 6],
      ])
    );
  });

  it('loads ratings once when nothing is cached', async () => {
    const client = createQueryClient();
    mockGetUserRatings.mockResolvedValue([{ id: '1', mediaType: 'movie', rating: 8, ratedAt: 1 }]);

    const { result } = renderHook(() => useUserRatingMap(true), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => expect(result.current.ratings.get('movie:1')).toBe(8));
    expect(mockGetUserRatings).toHaveBeenCalledTimes(1);
  });
});
