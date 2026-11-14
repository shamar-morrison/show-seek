const mockUpdateListItemRatings = jest.fn();
const mockReserveNonCriticalReadBudget = jest.fn();

jest.mock('@/src/services/ListService', () => ({
  listService: {
    updateListItemRatings: (...args: unknown[]) => mockUpdateListItemRatings(...args),
  },
}));

jest.mock('@/src/services/ReadBudgetGuard', () => ({
  reserveNonCriticalReadBudget: (...args: unknown[]) => mockReserveNonCriticalReadBudget(...args),
}));

import { saveListRatings } from '@/src/services/ListRatingRefresh';
import type { ListRatingTarget } from '@/src/utils/listItemRatings';

const target = (overrides: Partial<ListRatingTarget>): ListRatingTarget => ({
  listId: 'watchlist',
  itemKey: 'movie-1',
  storedKey: 'movie-1',
  page: 0,
  mediaType: 'movie',
  mediaId: 1,
  storedRating: 7.3,
  ...overrides,
});

const movie = (id: number, voteAverage: number) => ({
  id,
  media_type: 'movie',
  title: `Movie ${id}`,
  vote_average: voteAverage,
});

describe('saveListRatings', () => {
  const setQueryData = jest.fn();
  const invalidateQueries = jest.fn();
  const queryClient = { setQueryData, invalidateQueries } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReserveNonCriticalReadBudget.mockReturnValue(true);
    mockUpdateListItemRatings.mockImplementation(
      async (_listId: string, _page: number, ratings: Record<string, unknown>) => ({
        updated: Object.keys(ratings),
        current: [],
        missing: [],
      })
    );
  });

  it('saves one transaction per document, by stored key, and patches the cache by cached key', async () => {
    const saves = [
      { target: target({}), rating: 6.3 },
      { target: target({ itemKey: 'movie-2', storedKey: '2', mediaId: 2 }), rating: 5.5 },
      {
        target: target({ page: 2, itemKey: 'movie-3', storedKey: 'movie-3', mediaId: 3 }),
        rating: 8,
      },
      { target: target({ listId: 'favorites' }), rating: 6.3 },
    ];

    await expect(saveListRatings(queryClient, 'user-1', saves)).resolves.toBe(true);

    expect(mockReserveNonCriticalReadBudget).toHaveBeenCalledWith('list-rating-refresh', 3);
    expect(mockUpdateListItemRatings).toHaveBeenCalledTimes(3);
    expect(mockUpdateListItemRatings).toHaveBeenCalledWith('watchlist', 0, {
      'movie-1': { mediaType: 'movie', mediaId: 1, rating: 6.3 },
      '2': { mediaType: 'movie', mediaId: 2, rating: 5.5 },
    });
    expect(mockUpdateListItemRatings).toHaveBeenCalledWith('watchlist', 2, {
      'movie-3': { mediaType: 'movie', mediaId: 3, rating: 8 },
    });
    expect(mockUpdateListItemRatings).toHaveBeenCalledWith('favorites', 0, {
      'movie-1': { mediaType: 'movie', mediaId: 1, rating: 6.3 },
    });

    expect(setQueryData).toHaveBeenCalledTimes(1);
    expect(setQueryData.mock.calls[0][0]).toEqual(['lists', 'user-1']);
    const lists = [
      {
        id: 'watchlist',
        items: { 'movie-1': movie(1, 7.3), 'movie-2': movie(2, 5), 'movie-3': movie(3, 7) },
      },
      { id: 'favorites', items: { 'movie-1': movie(1, 7.3) } },
    ];
    const updated = setQueryData.mock.calls[0][1](lists);
    expect(updated[0].items['movie-1'].vote_average).toBe(6.3);
    expect(updated[0].items['movie-2'].vote_average).toBe(5.5);
    expect(updated[0].items['movie-3'].vote_average).toBe(8);
    expect(updated[1].items['movie-1'].vote_average).toBe(6.3);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('gives entries already up to date in Firestore the fresh rating in the cache', async () => {
    mockUpdateListItemRatings.mockResolvedValueOnce({
      updated: [],
      current: ['movie-1'],
      missing: [],
    });

    await saveListRatings(queryClient, 'user-1', [{ target: target({}), rating: 6.3 }]);

    const updated = setQueryData.mock.calls[0][1]([
      { id: 'watchlist', items: { 'movie-1': movie(1, 7.3) } },
    ]);
    expect(updated[0].items['movie-1'].vote_average).toBe(6.3);
  });

  it('reloads the lists when an entry is gone, patching only what was saved', async () => {
    mockUpdateListItemRatings.mockResolvedValueOnce({
      updated: ['movie-1'],
      current: [],
      missing: ['movie-2'],
    });

    await saveListRatings(queryClient, 'user-1', [
      { target: target({}), rating: 6.3 },
      { target: target({ itemKey: 'movie-2', storedKey: 'movie-2', mediaId: 2 }), rating: 5 },
    ]);

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['lists', 'user-1'] });
    const updated = setQueryData.mock.calls[0][1]([
      { id: 'watchlist', items: { 'movie-1': movie(1, 7.3), 'movie-2': movie(2, 7) } },
    ]);
    expect(updated[0].items['movie-1'].vote_average).toBe(6.3);
    expect(updated[0].items['movie-2'].vote_average).toBe(7);
  });

  it('saves nothing when the read budget is spent', async () => {
    mockReserveNonCriticalReadBudget.mockReturnValue(false);

    await expect(
      saveListRatings(queryClient, 'user-1', [{ target: target({}), rating: 6.3 }])
    ).resolves.toBe(false);

    expect(mockUpdateListItemRatings).not.toHaveBeenCalled();
    expect(setQueryData).not.toHaveBeenCalled();
  });

  it('keeps going when one document fails, and never throws', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockUpdateListItemRatings.mockRejectedValueOnce(new Error('offline'));

    await expect(
      saveListRatings(queryClient, 'user-1', [
        { target: target({}), rating: 6.3 },
        { target: target({ listId: 'favorites' }), rating: 6.3 },
      ])
    ).resolves.toBe(true);

    const updated = setQueryData.mock.calls[0][1]([
      { id: 'watchlist', items: { 'movie-1': movie(1, 7.3) } },
      { id: 'favorites', items: { 'movie-1': movie(1, 7.3) } },
    ]);
    expect(updated[0].items['movie-1'].vote_average).toBe(7.3);
    expect(updated[1].items['movie-1'].vote_average).toBe(6.3);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('does nothing with nothing to save', async () => {
    await expect(saveListRatings(queryClient, 'user-1', [])).resolves.toBe(true);
    expect(mockReserveNonCriticalReadBudget).not.toHaveBeenCalled();
    expect(mockUpdateListItemRatings).not.toHaveBeenCalled();
  });
});
