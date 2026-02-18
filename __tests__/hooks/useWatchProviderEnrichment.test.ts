import { renderHook } from '@testing-library/react-native';

const mockUseQueries = jest.fn();
const mockGetMovieWatchProviders = jest.fn();
const mockGetTVWatchProviders = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQueries: (...args: unknown[]) => mockUseQueries(...args),
}));

jest.mock('@/src/context/RegionProvider', () => ({
  useRegion: () => ({ region: 'US' }),
}));

jest.mock('@/src/api/tmdb', () => ({
  tmdbApi: {
    getMovieWatchProviders: (...args: unknown[]) => mockGetMovieWatchProviders(...args),
    getTVWatchProviders: (...args: unknown[]) => mockGetTVWatchProviders(...args),
  },
}));

jest.mock('@/src/utils/rateLimitedQuery', () => ({
  createRateLimitedQueryFn: (fn: () => Promise<unknown>) => fn,
}));

import { useWatchProviderEnrichment } from '@/src/hooks/useWatchProviderEnrichment';
import { ListMediaItem } from '@/src/services/ListService';

function createListItem(overrides: Partial<ListMediaItem>): ListMediaItem {
  return {
    id: 1,
    title: 'Item',
    poster_path: null,
    media_type: 'movie',
    vote_average: 7,
    release_date: '2024-01-01',
    addedAt: 1,
    ...overrides,
  };
}

describe('useWatchProviderEnrichment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deduplicates by media type + id and uses region-aware query keys', async () => {
    let capturedQueries: any[] = [];
    mockUseQueries.mockImplementation(({ queries }) => {
      capturedQueries = queries;
      return queries.map(() => ({
        data: undefined,
        isSuccess: false,
        isError: false,
        isLoading: false,
      }));
    });

    mockGetMovieWatchProviders.mockResolvedValue(null);
    mockGetTVWatchProviders.mockResolvedValue(null);

    const items = [
      createListItem({ id: 10, media_type: 'movie' }),
      createListItem({ id: 10, media_type: 'movie', title: 'Duplicate Movie' }),
      createListItem({ id: 20, media_type: 'tv', name: 'Show 20' }),
      createListItem({ id: 20, media_type: 'tv', title: 'Duplicate TV', name: 'Show 20 Again' }),
    ];

    renderHook(() => useWatchProviderEnrichment(items, true));

    expect(capturedQueries).toHaveLength(2);
    expect(capturedQueries[0].queryKey).toEqual(['watch-providers', 'US', 'movie', 10]);
    expect(capturedQueries[1].queryKey).toEqual(['watch-providers', 'US', 'tv', 20]);
    expect(capturedQueries[0].enabled).toBe(true);
    expect(capturedQueries[1].enabled).toBe(true);

    await capturedQueries[0].queryFn();
    await capturedQueries[1].queryFn();

    expect(mockGetMovieWatchProviders).toHaveBeenCalledWith(10);
    expect(mockGetTVWatchProviders).toHaveBeenCalledWith(20);
  });

  it('returns map entries and full progress when queries complete with success or error', () => {
    mockUseQueries.mockReturnValue([
      {
        data: { flatrate: [] },
        isSuccess: true,
        isError: false,
        isLoading: false,
      },
      {
        data: null,
        isSuccess: true,
        isError: false,
        isLoading: false,
      },
      {
        data: undefined,
        isSuccess: false,
        isError: true,
        isLoading: false,
      },
    ]);

    const items = [
      createListItem({ id: 1, media_type: 'movie' }),
      createListItem({ id: 2, media_type: 'tv' }),
      createListItem({ id: 3, media_type: 'movie' }),
    ];

    const { result } = renderHook(() => useWatchProviderEnrichment(items, true));

    expect(result.current.providerMap.get('movie-1')).toEqual({ flatrate: [] });
    expect(result.current.providerMap.get('tv-2')).toBeNull();
    expect(result.current.providerMap.get('movie-3')).toBeNull();
    expect(result.current.enrichmentProgress).toBe(1);
    expect(result.current.isLoadingEnrichment).toBe(false);
  });

  it('keeps separate map entries when movie and tv share the same numeric id', () => {
    mockUseQueries.mockReturnValue([
      {
        data: { flatrate: [{ provider_id: 8 }] },
        isSuccess: true,
        isError: false,
        isLoading: false,
      },
      {
        data: { flatrate: [{ provider_id: 9 }] },
        isSuccess: true,
        isError: false,
        isLoading: false,
      },
    ]);

    const items = [
      createListItem({ id: 100, media_type: 'movie' }),
      createListItem({ id: 100, media_type: 'tv', name: 'Show 100' }),
    ];

    const { result } = renderHook(() => useWatchProviderEnrichment(items, true));

    expect(result.current.providerMap.get('movie-100')).toEqual({ flatrate: [{ provider_id: 8 }] });
    expect(result.current.providerMap.get('tv-100')).toEqual({ flatrate: [{ provider_id: 9 }] });
    expect(result.current.providerMap.size).toBe(2);
    expect(result.current.enrichmentProgress).toBe(1);
    expect(result.current.isLoadingEnrichment).toBe(false);
  });

  it('reports loading when any query is still loading', () => {
    mockUseQueries.mockReturnValue([
      {
        data: undefined,
        isSuccess: false,
        isError: false,
        isLoading: true,
      },
      {
        data: undefined,
        isSuccess: false,
        isError: false,
        isLoading: false,
      },
    ]);

    const items = [
      createListItem({ id: 1, media_type: 'movie' }),
      createListItem({ id: 2, media_type: 'tv' }),
    ];

    const { result } = renderHook(() => useWatchProviderEnrichment(items, true));

    expect(result.current.isLoadingEnrichment).toBe(true);
    expect(result.current.enrichmentProgress).toBe(0);
  });

  it('forces loading state off when disabled', () => {
    let capturedQueries: any[] = [];
    mockUseQueries.mockImplementation(({ queries }) => {
      capturedQueries = queries;
      return queries.map(() => ({
        data: undefined,
        isSuccess: false,
        isError: false,
        isLoading: true,
      }));
    });

    const items = [
      createListItem({ id: 1, media_type: 'movie' }),
      createListItem({ id: 2, media_type: 'tv' }),
    ];

    const { result } = renderHook(() => useWatchProviderEnrichment(items, false));

    expect(capturedQueries[0].enabled).toBe(false);
    expect(capturedQueries[1].enabled).toBe(false);
    expect(result.current.isLoadingEnrichment).toBe(false);
  });
});
