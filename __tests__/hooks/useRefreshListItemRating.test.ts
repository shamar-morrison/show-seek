import { renderHook } from '@testing-library/react-native';

const mockSaveListRatings = jest.fn();
let mockUser: { uid: string; isAnonymous: boolean } | null = {
  uid: 'test-user',
  isAnonymous: false,
};
const mockQueryClient = { setQueryData: jest.fn(), invalidateQueries: jest.fn() };

jest.mock('@/src/services/ListRatingRefresh', () => ({
  saveListRatings: (...args: unknown[]) => mockSaveListRatings(...args),
}));

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
}));

import { useRefreshListItemRating } from '@/src/hooks/useRefreshListItemRating';
import { getFreshRating, resetFreshRatingsForTests } from '@/src/utils/listItemRatings';

const movie = (voteAverage: number | undefined) => ({
  id: 1,
  media_type: 'movie',
  title: 'Model Citizen',
  poster_path: null,
  vote_average: voteAverage,
  release_date: '2026-11-03',
  addedAt: 1,
});
const list = (id: string, items: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({ id, name: id, createdAt: 1, items, storedItemKeys: {}, ...extra }) as any;

const lists = [
  list('watchlist', { 'movie-1': movie(7.3) }),
  list('favorites', { 'movie-1': movie(6.32) }),
  list(
    'big',
    { 'movie-1': movie(8) },
    { storedItemKeys: { 'movie-1': '1' }, overflowItemPages: { '1': 2 } }
  ),
  list('other', { 'tv-1': { ...movie(5), media_type: 'tv' } }),
];

describe('useRefreshListItemRating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetFreshRatingsForTests();
    mockUser = { uid: 'test-user', isAnonymous: false };
    mockSaveListRatings.mockResolvedValue(true);
  });

  it('saves the fresh rating onto each saved copy that shows a different one, once', () => {
    const { rerender } = renderHook(
      (props: { lists: any }) =>
        useRefreshListItemRating({
          mediaType: 'movie',
          mediaId: 1,
          rating: 6.3,
          lists: props.lists,
        }),
      { initialProps: { lists } }
    );

    expect(mockSaveListRatings).toHaveBeenCalledTimes(1);
    const [queryClient, userId, saves] = mockSaveListRatings.mock.calls[0];
    expect(queryClient).toBe(mockQueryClient);
    expect(userId).toBe('test-user');
    // favorites already shows 6.3; the show with the same id is a different title.
    expect(saves).toEqual([
      {
        target: expect.objectContaining({ listId: 'watchlist', storedKey: 'movie-1', page: 0 }),
        rating: 6.3,
      },
      { target: expect.objectContaining({ listId: 'big', storedKey: '1', page: 2 }), rating: 6.3 },
    ]);
    expect(getFreshRating('movie', 1)).toBe(6.3);

    // The cache patch hands the screen new lists: nothing runs again.
    rerender({ lists: [...lists] });
    expect(mockSaveListRatings).toHaveBeenCalledTimes(1);
  });

  it('writes nothing when every saved copy is up to date, but remembers the rating', () => {
    renderHook(() =>
      useRefreshListItemRating({
        mediaType: 'movie',
        mediaId: 1,
        rating: 6.3,
        lists: [list('favorites', { 'movie-1': movie(6.32) })],
      })
    );

    expect(mockSaveListRatings).not.toHaveBeenCalled();
    expect(getFreshRating('movie', 1)).toBe(6.3);
  });

  it('waits for the details and the lists', () => {
    const { rerender } = renderHook(
      (props: { rating: number | undefined; lists: any }) =>
        useRefreshListItemRating({ mediaType: 'movie', mediaId: 1, ...props }),
      { initialProps: { rating: undefined as number | undefined, lists: lists as any } }
    );
    expect(mockSaveListRatings).not.toHaveBeenCalled();

    rerender({ rating: 6.3, lists: undefined });
    expect(mockSaveListRatings).not.toHaveBeenCalled();

    rerender({ rating: 6.3, lists });
    expect(mockSaveListRatings).toHaveBeenCalledTimes(1);
  });

  it('does nothing for signed-out or anonymous users', () => {
    mockUser = { uid: 'anon', isAnonymous: true };
    renderHook(() =>
      useRefreshListItemRating({ mediaType: 'movie', mediaId: 1, rating: 6.3, lists })
    );

    mockUser = null;
    renderHook(() =>
      useRefreshListItemRating({ mediaType: 'movie', mediaId: 1, rating: 6.3, lists })
    );

    expect(mockSaveListRatings).not.toHaveBeenCalled();
  });

  it('never saves 0 over a rating, and leaves entries without one alone', () => {
    renderHook(() =>
      useRefreshListItemRating({ mediaType: 'movie', mediaId: 1, rating: 0, lists })
    );
    renderHook(() =>
      useRefreshListItemRating({
        mediaType: 'movie',
        mediaId: 1,
        rating: 6.3,
        lists: [list('watchlist', { 'movie-1': movie(undefined) })],
      })
    );

    expect(mockSaveListRatings).not.toHaveBeenCalled();
  });
});
