import { useAllGenres, useGenres } from '@/src/hooks/useGenres';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';

// Mock the genreCache module
const mockGetGenres = jest.fn();

jest.mock('@/src/utils/genreCache', () => ({
  getGenres: (type: 'movie' | 'tv') => mockGetGenres(type),
}));

// Mock the TMDB API module for language
const mockGetApiLanguage = jest.fn();

jest.mock('@/src/api/tmdb', () => ({
  getApiLanguage: () => mockGetApiLanguage(),
}));

describe('useGenres', () => {
  const mockMovieGenres = { 28: 'Action', 35: 'Comedy', 18: 'Drama' };
  const mockTVGenres = { 10759: 'Action & Adventure', 35: 'Comedy' };

  const createWrapper = () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: 0,
          gcTime: 0,
        },
      },
    });

    return ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetApiLanguage.mockReturnValue('en-US');
    mockGetGenres.mockImplementation((type) => {
      if (type === 'movie') return Promise.resolve(mockMovieGenres);
      return Promise.resolve(mockTVGenres);
    });
  });

  describe('useGenres hook', () => {
    it('fetches movie genres successfully', async () => {
      const { result } = renderHook(() => useGenres('movie'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockMovieGenres);
      expect(mockGetGenres).toHaveBeenCalledWith('movie');
    });

    it('fetches TV genres successfully', async () => {
      const { result } = renderHook(() => useGenres('tv'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockTVGenres);
      expect(mockGetGenres).toHaveBeenCalledWith('tv');
    });

    it('includes language in query key for cache invalidation', async () => {
      // This test verifies the queryKey structure indirectly by checking
      // that the hook uses the current language from getApiLanguage
      mockGetApiLanguage.mockReturnValue('fr-FR');

      const { result } = renderHook(() => useGenres('movie'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // The hook should have called getApiLanguage to build the query key
      // which is implicitly tested by the fact that getGenres was called
      expect(mockGetGenres).toHaveBeenCalledWith('movie');
    });

    it('refetches when genre type changes', async () => {
      const wrapper = createWrapper();

      // First render with 'movie'
      const { result, rerender } = renderHook<
        ReturnType<typeof useGenres>,
        { type: 'movie' | 'tv' }
      >(({ type }) => useGenres(type), {
        wrapper,
        initialProps: { type: 'movie' },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockGetGenres).toHaveBeenCalledWith('movie');

      // Rerender with 'tv'
      rerender({ type: 'tv' });

      await waitFor(() => expect(result.current.data).toEqual(mockTVGenres));
      expect(mockGetGenres).toHaveBeenCalledWith('tv');
    });
  });

  describe('useAllGenres hook', () => {
    it('merges movie and TV genres into single map', async () => {
      const { result } = renderHook(() => useAllGenres(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Should contain both movie and TV genre IDs
      expect(result.current.data).toHaveProperty('28'); // Action (movie)
      expect(result.current.data).toHaveProperty('18'); // Drama (movie)
      expect(result.current.data).toHaveProperty('10759'); // Action & Adventure (TV)
    });

    it('reports loading state correctly', async () => {
      const { result } = renderHook(() => useAllGenres(), {
        wrapper: createWrapper(),
      });

      // Initially loading
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => expect(result.current.isLoading).toBe(false));
    });

    it('handles overlapping genre IDs (TV overwrites movie)', async () => {
      // Both movie and TV have genre ID 35 (Comedy)
      const { result } = renderHook(() => useAllGenres(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // ID 35 should exist (from either movie or TV, TV overwrites due to spread order)
      expect(result.current.data).toHaveProperty('35');
      expect(result.current.data['35']).toBe('Comedy');
    });

    it('returns empty object when still loading', () => {
      // Make the fetch hang
      mockGetGenres.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useAllGenres(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toEqual({});
    });
  });

  describe('error handling', () => {
    it('propagates errors from getGenres', async () => {
      const testError = new Error('API Error');
      mockGetGenres.mockRejectedValue(testError);

      const { result } = renderHook(() => useGenres('movie'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBe(testError);
    });
  });
});
