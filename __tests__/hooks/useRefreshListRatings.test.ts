import { renderHook, waitFor } from '@testing-library/react-native';

const mockSaveListRatings = jest.fn();
const mockGetMovieDetails = jest.fn();
const mockGetTVShowDetails = jest.fn();
let mockUser: { uid: string; isAnonymous: boolean } | null = {
  uid: 'test-user',
  isAnonymous: false,
};
const mockQueryClient = {
  fetchQuery: jest.fn(({ queryFn }: { queryFn: () => Promise<unknown> }) => queryFn()),
};

jest.mock('@/src/services/ListRatingRefresh', () => ({
  saveListRatings: (...args: unknown[]) => mockSaveListRatings(...args),
}));

jest.mock('@/src/api/tmdb', () => ({
  tmdbApi: {
    getMovieDetails: (...args: unknown[]) => mockGetMovieDetails(...args),
    getTVShowDetails: (...args: unknown[]) => mockGetTVShowDetails(...args),
  },
}));

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
}));

import {
  LIST_RATING_LOOKUP_BATCH_SIZE,
  resetListRatingChecksForTests,
  useRefreshListRatings,
} from '@/src/hooks/useRefreshListRatings';
import {
  LIST_RATING_CHECK_INTERVAL_MS,
  rememberFreshRating,
  resetFreshRatingsForTests,
} from '@/src/utils/listItemRatings';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);
const CHECKED_AT_KEY = 'listRatingsCheckedAt:test-user:watchlist';

const movie = (id: number, voteAverage: number, released = daysAgo(10)) => ({
  id,
  media_type: 'movie',
  title: `Movie ${id}`,
  poster_path: null,
  vote_average: voteAverage,
  release_date: released,
  addedAt: 1,
});
const show = (id: number, voteAverage: number) => ({
  ...movie(id, voteAverage),
  media_type: 'tv',
  release_date: '',
  first_air_date: daysAgo(5),
});
const watchlist = (items: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({
    id: 'watchlist',
    name: 'Should Watch',
    createdAt: 1,
    items,
    storedItemKeys: {},
    ...extra,
  }) as any;

const tmdbError = (status?: number, message = 'TMDB request failed') =>
  Object.assign(new Error(message), { status });

describe('useRefreshListRatings', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    resetListRatingChecksForTests();
    resetFreshRatingsForTests();
    await AsyncStorage.clear();
    mockUser = { uid: 'test-user', isAnonymous: false };
    mockSaveListRatings.mockResolvedValue(true);
    mockGetMovieDetails.mockImplementation(async (id: number) => ({ id, vote_average: 6.3 }));
    mockGetTVShowDetails.mockImplementation(async (id: number) => ({ id, vote_average: 8.4 }));
  });

  it('looks up recent titles, saves the changed ratings and records the check', async () => {
    const list = watchlist({
      'movie-1': movie(1, 7.3),
      'movie-2': movie(2, 6.31),
      'movie-3': movie(3, 5, daysAgo(400)),
      'tv-4': show(4, 8),
    });

    renderHook(() => useRefreshListRatings(list));

    await waitFor(() => expect(mockSaveListRatings).toHaveBeenCalled());
    // The old title isn't looked up; titles go through the details pages' query cache.
    expect(mockGetMovieDetails.mock.calls.map(([id]) => id).sort()).toEqual([1, 2]);
    expect(mockGetTVShowDetails).toHaveBeenCalledWith(4);
    expect(mockQueryClient.fetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['movie', 1] })
    );
    expect(mockQueryClient.fetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['tv', 4] })
    );

    const [, userId, saves] = mockSaveListRatings.mock.calls[0];
    expect(userId).toBe('test-user');
    // movie-2 already shows 6.3.
    expect(saves).toEqual(
      expect.arrayContaining([
        { target: expect.objectContaining({ itemKey: 'movie-1' }), rating: 6.3 },
        { target: expect.objectContaining({ itemKey: 'tv-4' }), rating: 8.4 },
      ])
    );
    expect(saves).toHaveLength(2);
    await waitFor(async () => expect(await AsyncStorage.getItem(CHECKED_AT_KEY)).not.toBeNull());
  });

  it('checks a list at most once per session', async () => {
    const list = watchlist({ 'movie-1': movie(1, 7.3) });

    renderHook(() => useRefreshListRatings(list));
    await waitFor(() => expect(mockSaveListRatings).toHaveBeenCalledTimes(1));
    await waitFor(async () => expect(await AsyncStorage.getItem(CHECKED_AT_KEY)).not.toBeNull());
    await AsyncStorage.clear();

    renderHook(() => useRefreshListRatings({ ...list }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockGetMovieDetails).toHaveBeenCalledTimes(1);
    expect(mockSaveListRatings).toHaveBeenCalledTimes(1);
  });

  it('skips a list checked within the last day', async () => {
    await AsyncStorage.setItem(
      CHECKED_AT_KEY,
      String(Date.now() - LIST_RATING_CHECK_INTERVAL_MS / 2)
    );

    renderHook(() => useRefreshListRatings(watchlist({ 'movie-1': movie(1, 7.3) })));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockGetMovieDetails).not.toHaveBeenCalled();
    expect(mockSaveListRatings).not.toHaveBeenCalled();
  });

  it('checks again once a day has passed', async () => {
    await AsyncStorage.setItem(
      CHECKED_AT_KEY,
      String(Date.now() - LIST_RATING_CHECK_INTERVAL_MS - 1)
    );

    renderHook(() => useRefreshListRatings(watchlist({ 'movie-1': movie(1, 7.3) })));

    await waitFor(() => expect(mockSaveListRatings).toHaveBeenCalled());
  });

  it('uses ratings already fetched this session instead of looking them up', async () => {
    rememberFreshRating('movie', 1, 5.5);

    renderHook(() => useRefreshListRatings(watchlist({ 'movie-1': movie(1, 7.3) })));

    await waitFor(() => expect(mockSaveListRatings).toHaveBeenCalled());
    expect(mockGetMovieDetails).not.toHaveBeenCalled();
    expect(mockSaveListRatings.mock.calls[0][2]).toEqual([
      { target: expect.objectContaining({ itemKey: 'movie-1' }), rating: 5.5 },
    ]);
  });

  it('stops on a rate limit, saves what it found, and leaves the check to run again', async () => {
    const items = Object.fromEntries(
      Array.from({ length: LIST_RATING_LOOKUP_BATCH_SIZE * 2 }, (_, index) => [
        `movie-${index + 1}`,
        movie(index + 1, 7.3, daysAgo(index + 1)),
      ])
    );
    mockGetMovieDetails.mockImplementation(async (id: number) => {
      if (id === 2) throw tmdbError(429);
      return { id, vote_average: 6.3 };
    });

    renderHook(() => useRefreshListRatings(watchlist(items)));

    await waitFor(() => expect(mockSaveListRatings).toHaveBeenCalled());
    // Only the first batch was looked up.
    expect(mockGetMovieDetails).toHaveBeenCalledTimes(LIST_RATING_LOOKUP_BATCH_SIZE);
    expect(mockSaveListRatings.mock.calls[0][2]).toHaveLength(LIST_RATING_LOOKUP_BATCH_SIZE - 1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await AsyncStorage.getItem(CHECKED_AT_KEY)).toBeNull();

    // Opening the list again this session checks it again.
    mockGetMovieDetails.mockImplementation(async (id: number) => ({ id, vote_average: 6.3 }));
    renderHook(() => useRefreshListRatings(watchlist(items)));
    await waitFor(() => expect(mockSaveListRatings).toHaveBeenCalledTimes(2));
  });

  it('counts a title TMDB no longer has as checked, but not a failed lookup', async () => {
    mockGetMovieDetails.mockRejectedValueOnce(tmdbError(404));
    renderHook(() => useRefreshListRatings(watchlist({ 'movie-1': movie(1, 7.3) })));
    await waitFor(async () => expect(await AsyncStorage.getItem(CHECKED_AT_KEY)).not.toBeNull());

    resetListRatingChecksForTests();
    await AsyncStorage.clear();
    mockGetMovieDetails.mockRejectedValueOnce(new Error('Network Error'));
    renderHook(() => useRefreshListRatings(watchlist({ 'movie-1': movie(1, 7.3) })));
    await waitFor(() => expect(mockSaveListRatings).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await AsyncStorage.getItem(CHECKED_AT_KEY)).toBeNull();
  });

  it('does not record the check when the read budget stopped the save', async () => {
    mockSaveListRatings.mockResolvedValue(false);

    renderHook(() => useRefreshListRatings(watchlist({ 'movie-1': movie(1, 7.3) })));

    await waitFor(() => expect(mockSaveListRatings).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await AsyncStorage.getItem(CHECKED_AT_KEY)).toBeNull();
  });

  it('keeps saving what it found when the screen is left, without further lookups', async () => {
    const items = Object.fromEntries(
      Array.from({ length: LIST_RATING_LOOKUP_BATCH_SIZE * 2 }, (_, index) => [
        `movie-${index + 1}`,
        movie(index + 1, 7.3, daysAgo(index + 1)),
      ])
    );
    let releaseFirstBatch: () => void = () => undefined;
    const firstBatch = new Promise<void>((resolve) => {
      releaseFirstBatch = resolve;
    });
    mockGetMovieDetails.mockImplementation(async (id: number) => {
      await firstBatch;
      return { id, vote_average: 6.3 };
    });

    const { unmount } = renderHook(() => useRefreshListRatings(watchlist(items)));
    await waitFor(() =>
      expect(mockGetMovieDetails).toHaveBeenCalledTimes(LIST_RATING_LOOKUP_BATCH_SIZE)
    );
    unmount();
    releaseFirstBatch();

    await waitFor(() => expect(mockSaveListRatings).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(mockGetMovieDetails).toHaveBeenCalledTimes(LIST_RATING_LOOKUP_BATCH_SIZE);
    expect(mockSaveListRatings.mock.calls[0][2]).toHaveLength(LIST_RATING_LOOKUP_BATCH_SIZE);
    expect(await AsyncStorage.getItem(CHECKED_AT_KEY)).toBeNull();
  });

  it('does nothing for a list cached without stored keys, or for anonymous users', async () => {
    renderHook(() =>
      useRefreshListRatings(watchlist({ 'movie-1': movie(1, 7.3) }, { storedItemKeys: undefined }))
    );
    mockUser = { uid: 'anon', isAnonymous: true };
    renderHook(() => useRefreshListRatings(watchlist({ 'movie-1': movie(1, 7.3) })));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockGetMovieDetails).not.toHaveBeenCalled();
    expect(mockSaveListRatings).not.toHaveBeenCalled();
  });

  it('checks the list once it is loaded with stored keys', async () => {
    const { rerender } = renderHook((props: { list: any }) => useRefreshListRatings(props.list), {
      initialProps: {
        list: watchlist({ 'movie-1': movie(1, 7.3) }, { storedItemKeys: undefined }),
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockGetMovieDetails).not.toHaveBeenCalled();

    rerender({ list: watchlist({ 'movie-1': movie(1, 7.3) }) });
    await waitFor(() => expect(mockSaveListRatings).toHaveBeenCalled());
  });
});
