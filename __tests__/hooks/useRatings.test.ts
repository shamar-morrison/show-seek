import { useEpisodeRating, useMediaRating, useRatings } from '@/src/hooks/useRatings';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import React from 'react';

const mockFirestoreAccessState = {
  user: { uid: 'test-user-id' } as { uid: string } | null,
  signedInUserId: 'test-user-id' as string | undefined,
  firestoreUserId: 'test-user-id' as string | undefined,
  canUseNonCriticalReads: true,
};

const mockGetRating = jest.fn();
const mockGetEpisodeRating = jest.fn();
const mockGetUserRatings = jest.fn();

jest.mock('@/src/hooks/useFirestoreAccess', () => ({
  useFirestoreAccess: () => ({
    user: mockFirestoreAccessState.user,
    isAnonymous: false,
    signedInUserId: mockFirestoreAccessState.signedInUserId,
    firestoreUserId: mockFirestoreAccessState.firestoreUserId,
    canUseFirestoreClient: Boolean(mockFirestoreAccessState.firestoreUserId),
    canUseListManagementReads: Boolean(mockFirestoreAccessState.signedInUserId),
    canUseNonCriticalReads: mockFirestoreAccessState.canUseNonCriticalReads,
    canUsePremiumRealtime: Boolean(mockFirestoreAccessState.signedInUserId),
  }),
}));

jest.mock('@/src/services/RatingService', () => ({
  ratingService: {
    getRating: (...args: unknown[]) => mockGetRating(...args),
    getEpisodeRating: (...args: unknown[]) => mockGetEpisodeRating(...args),
    getUserRatings: (...args: unknown[]) => mockGetUserRatings(...args),
    saveRating: jest.fn(),
    deleteRating: jest.fn(),
    saveEpisodeRating: jest.fn(),
    deleteEpisodeRating: jest.fn(),
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

describe('useRatings hooks', () => {
  beforeAll(() => {
    notifyManager.setNotifyFunction((fn: () => void) => act(fn));
  });

  afterAll(() => {
    notifyManager.setNotifyFunction((fn: () => void) => fn());
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockFirestoreAccessState.user = { uid: 'test-user-id' };
    mockFirestoreAccessState.signedInUserId = 'test-user-id';
    mockFirestoreAccessState.firestoreUserId = 'test-user-id';
    mockFirestoreAccessState.canUseNonCriticalReads = true;
  });

  it('returns cached ratings when reads are enabled', () => {
    const client = createQueryClient();
    const cachedRatings = [
      { id: '123', mediaType: 'movie', rating: 8, ratedAt: Date.now() },
      { id: '456', mediaType: 'tv', rating: 7, ratedAt: Date.now() },
    ];

    client.setQueryData(['ratings', 'test-user-id', true], cachedRatings);

    const { result } = renderHook(() => useRatings(), {
      wrapper: createWrapper(client),
    });

    expect(result.current.data).toEqual(cachedRatings);
    expect(mockGetUserRatings).not.toHaveBeenCalled();
  });

  it('masks cached ratings when non-critical reads are revoked', () => {
    const client = createQueryClient();
    client.setQueryData(['ratings', 'test-user-id', true], [
      { id: '123', mediaType: 'movie', rating: 8, ratedAt: Date.now() },
    ]);
    mockFirestoreAccessState.canUseNonCriticalReads = false;

    const { result } = renderHook(() => useRatings(), {
      wrapper: createWrapper(client),
    });

    expect(result.current.data).toEqual([]);
    expect(mockGetUserRatings).not.toHaveBeenCalled();
  });

  it('masks cached media ratings when non-critical reads are revoked', () => {
    const client = createQueryClient();
    client.setQueryData(['rating', 'test-user-id', 'movie', 123, true], {
      id: '123',
      mediaType: 'movie',
      rating: 8,
      ratedAt: Date.now(),
    });
    mockFirestoreAccessState.canUseNonCriticalReads = false;

    const { result } = renderHook(() => useMediaRating(123, 'movie'), {
      wrapper: createWrapper(client),
    });

    expect(result.current.userRating).toBe(0);
    expect(mockGetRating).not.toHaveBeenCalled();
  });

  it('masks cached episode ratings when non-critical reads are revoked', () => {
    const client = createQueryClient();
    client.setQueryData(['rating', 'test-user-id', 'episode', 456, 1, 2, true], {
      id: 'episode-456-1-2',
      mediaType: 'episode',
      rating: 7,
      ratedAt: Date.now(),
      tvShowId: 456,
      seasonNumber: 1,
      episodeNumber: 2,
    });
    mockFirestoreAccessState.canUseNonCriticalReads = false;

    const { result } = renderHook(() => useEpisodeRating(456, 1, 2), {
      wrapper: createWrapper(client),
    });

    expect(result.current.userRating).toBe(0);
    expect(mockGetEpisodeRating).not.toHaveBeenCalled();
  });
});
