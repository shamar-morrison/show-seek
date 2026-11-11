import { useMoreTitles } from '@/src/hooks/useMoreTitles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';

const mockGetRecommendedMovies = jest.fn();
const mockResolvePlan = jest.fn();
const mockFetchPage = jest.fn();

jest.mock('@/src/api/tmdb', () => ({
  tmdbApi: {
    getRecommendedMovies: (...args: unknown[]) => mockGetRecommendedMovies(...args),
    getRecommendedTV: jest.fn(),
  },
}));
jest.mock('@/src/api/moreLikeThis', () => ({
  resolveMoreLikeThisPlan: (...args: unknown[]) => mockResolvePlan(...args),
  fetchMoreLikeThisPage: (...args: unknown[]) => mockFetchPage(...args),
}));

const page = (n: number, totalPages: number, ids: number[]) => ({
  page: n,
  total_pages: totalPages,
  total_results: totalPages * 20,
  results: ids.map((id) => ({ id })),
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('useMoreTitles', () => {
  beforeEach(() => jest.clearAllMocks());

  it('pages through recommendations, dropping the title itself and repeats', async () => {
    mockGetRecommendedMovies.mockImplementation(async (_id: number, n: number) =>
      n === 1 ? page(1, 3, [10, 1, 2]) : page(2, 3, [2, 3])
    );
    const { result } = renderHook(() => useMoreTitles('recommendations', 'movie', 10), {
      wrapper,
    });

    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual([1, 2]));
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual([1, 2, 3]));
    expect(mockGetRecommendedMovies).toHaveBeenLastCalledWith(10, 2);
  });

  it('stops after 5 pages even when there are more', async () => {
    mockGetRecommendedMovies.mockImplementation(async (_id: number, n: number) =>
      page(n, 40, [n * 100])
    );
    const { result } = renderHook(() => useMoreTitles('recommendations', 'movie', 10), {
      wrapper,
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    for (let n = 2; n <= 5; n += 1) {
      await act(async () => {
        await result.current.fetchNextPage();
      });
      await waitFor(() => expect(result.current.items).toHaveLength(n));
    }

    await waitFor(() => expect(result.current.hasNextPage).toBe(false));
    expect(mockGetRecommendedMovies).toHaveBeenCalledTimes(5);
  });

  it('works out the "More like this" filters once and reuses them for each page', async () => {
    const plan = { params: {}, firstPage: page(1, 2, [7]) };
    mockResolvePlan.mockResolvedValue(plan);
    mockFetchPage.mockImplementation(async (_t: string, _p: unknown, n: number) =>
      n === 1 ? plan.firstPage : page(2, 2, [8])
    );
    const { result } = renderHook(() => useMoreTitles('similar', 'tv', 1399), { wrapper });

    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual([7]));
    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual([7, 8]));
    expect(mockResolvePlan).toHaveBeenCalledTimes(1);
    expect(mockResolvePlan).toHaveBeenCalledWith('tv', 1399);
  });

  it('waits while disabled', () => {
    renderHook(() => useMoreTitles('recommendations', 'movie', 10, { enabled: false }), {
      wrapper,
    });
    expect(mockGetRecommendedMovies).not.toHaveBeenCalled();
  });
});
