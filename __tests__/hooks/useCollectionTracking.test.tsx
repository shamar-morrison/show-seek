import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';

const mockGetAllTrackedCollections = jest.fn();
const mockGetCollectionTracking = jest.fn();

const mockAuthState: { currentUser: { uid: string } | null } = {
  currentUser: { uid: 'test-user-id' },
};

jest.mock('@/src/firebase/config', () => ({
  auth: {
    get currentUser() {
      return mockAuthState.currentUser;
    },
  },
  db: {},
}));

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => ({ isPremium: false }),
}));

jest.mock('@/src/services/CollectionTrackingService', () => ({
  collectionTrackingService: {
    getAllTrackedCollections: (...args: unknown[]) => mockGetAllTrackedCollections(...args),
    getCollectionTracking: (...args: unknown[]) => mockGetCollectionTracking(...args),
    getTrackedCollectionCount: jest.fn(),
    startTracking: jest.fn(),
    stopTracking: jest.fn(),
    addWatchedMovie: jest.fn(),
    removeWatchedMovie: jest.fn(),
  },
  MAX_FREE_COLLECTIONS: 2,
}));

import { useCollectionTracking, useTrackedCollections } from '@/src/hooks/useCollectionTracking';

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

describe('useCollectionTracking hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.currentUser = { uid: 'test-user-id' };
  });

  it('loads tracked collections with query caching', async () => {
    mockGetAllTrackedCollections.mockResolvedValueOnce([
      {
        collectionId: 10,
        name: 'John Wick Collection',
        totalMovies: 4,
        watchedMovieIds: [1, 2],
        startedAt: 1000,
        lastUpdated: 2000,
      },
    ]);

    const client = createQueryClient();
    const { result } = renderHook(() => useTrackedCollections(), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.collections).toHaveLength(1);
    });

    expect(mockGetAllTrackedCollections).toHaveBeenCalledTimes(1);
    expect(result.current.collections[0].collectionId).toBe(10);
  });

  it('loads a single tracked collection and derives progress fields', async () => {
    mockGetCollectionTracking.mockResolvedValueOnce({
      collectionId: 12,
      name: 'Batman Collection',
      totalMovies: 5,
      watchedMovieIds: [11, 22, 33],
      startedAt: 100,
      lastUpdated: 200,
    });

    const client = createQueryClient();
    const { result } = renderHook(() => useCollectionTracking(12), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isTracked).toBe(true);
    });

    expect(mockGetCollectionTracking).toHaveBeenCalledWith(12);
    expect(result.current.watchedCount).toBe(3);
    expect(result.current.totalMovies).toBe(5);
    expect(result.current.percentage).toBe(60);
  });

  it('does not fetch when signed out', () => {
    mockAuthState.currentUser = null;

    const client = createQueryClient();
    const { result } = renderHook(() => useCollectionTracking(50), {
      wrapper: createWrapper(client),
    });

    expect(mockGetCollectionTracking).not.toHaveBeenCalled();
    expect(result.current.tracking).toBeNull();
    expect(result.current.isTracked).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });
});
