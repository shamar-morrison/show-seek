import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

const mockGetMovieWatchProviders = jest.fn();
const mockGetTVWatchProviders = jest.fn();
const mockRegion = { region: 'US' };

jest.mock('@/src/context/RegionProvider', () => ({
  useRegion: () => mockRegion,
}));

jest.mock('@/src/api/tmdb', () => ({
  tmdbApi: {
    getMovieWatchProviders: (...args: unknown[]) => mockGetMovieWatchProviders(...args),
    getTVWatchProviders: (...args: unknown[]) => mockGetTVWatchProviders(...args),
  },
}));

import { useWatchProviderEnrichment } from '@/src/hooks/useWatchProviderEnrichment';
import { ListMediaItem } from '@/src/services/ListService';
import {
  flushWatchProviderCache,
  getCachedWatchProviders,
  loadWatchProviderCache,
  resetWatchProviderCacheForTests,
  setCachedWatchProviders,
  WATCH_PROVIDER_CACHE_TTL_MS,
} from '@/src/services/watchProviderCache';

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

const provider = (id: number) => ({
  provider_id: id,
  provider_name: `Provider ${id}`,
  logo_path: null,
  display_priority: 1,
});

describe('useWatchProviderEnrichment', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockRegion.region = 'US';
    resetWatchProviderCacheForTests();
    await AsyncStorage.clear();
  });

  it('deduplicates titles, keeps movie and tv ids apart, and returns flatrate provider ids only', async () => {
    mockGetMovieWatchProviders.mockResolvedValue({
      flatrate: [provider(8), provider(8), provider(337)],
      rent: [provider(2)],
    });
    mockGetTVWatchProviders.mockResolvedValue({ buy: [provider(8)] });

    const items = [
      createListItem({ id: 10, media_type: 'movie' }),
      createListItem({ id: 10, media_type: 'movie', title: 'Duplicate' }),
      createListItem({ id: 10, media_type: 'tv', name: 'Show 10' }),
    ];

    const { result } = renderHook(() => useWatchProviderEnrichment(items, true));
    expect(result.current.isLoadingEnrichment).toBe(true);

    await waitFor(() => expect(result.current.isLoadingEnrichment).toBe(false));

    expect(mockGetMovieWatchProviders).toHaveBeenCalledTimes(1);
    expect(mockGetMovieWatchProviders).toHaveBeenCalledWith(10, 'US');
    expect(mockGetTVWatchProviders).toHaveBeenCalledWith(10, 'US');
    expect(result.current.providerMap.get('movie-10')).toEqual([8, 337]);
    expect(result.current.providerMap.get('tv-10')).toEqual([]);
    expect(result.current.enrichmentProgress).toBe(1);
  });

  it('saves results to the device cache and skips the network next time', async () => {
    mockGetMovieWatchProviders.mockResolvedValue({ flatrate: [provider(8)] });
    const items = [createListItem({ id: 1 })];

    const first = renderHook(() => useWatchProviderEnrichment(items, true));
    await waitFor(() => expect(first.result.current.isLoadingEnrichment).toBe(false));
    first.unmount();
    await flushWatchProviderCache('US');

    // Simulate an app restart: memory is empty, storage is not.
    resetWatchProviderCacheForTests();
    mockGetMovieWatchProviders.mockClear();

    const second = renderHook(() => useWatchProviderEnrichment(items, true));
    await waitFor(() => expect(second.result.current.isLoadingEnrichment).toBe(false));

    expect(second.result.current.providerMap.get('movie-1')).toEqual([8]);
    expect(mockGetMovieWatchProviders).not.toHaveBeenCalled();
  });

  it('shows stale cached data without loading and refreshes it in the background', async () => {
    await loadWatchProviderCache('US');
    setCachedWatchProviders('US', 'movie-1', [8], Date.now() - WATCH_PROVIDER_CACHE_TTL_MS - 1);
    mockGetMovieWatchProviders.mockResolvedValue({ flatrate: [provider(9)] });

    const items = [createListItem({ id: 1 })];
    const { result } = renderHook(() => useWatchProviderEnrichment(items, true));

    await waitFor(() => expect(result.current.providerMap.get('movie-1')).toEqual([8]));
    expect(result.current.isLoadingEnrichment).toBe(false);

    await waitFor(() => expect(result.current.providerMap.get('movie-1')).toEqual([9]), {
      timeout: 3000,
    });
    expect(getCachedWatchProviders('US', 'movie-1')?.providerIds).toEqual([9]);
  });

  it('treats failed lookups as no providers without caching them', async () => {
    mockGetMovieWatchProviders.mockRejectedValue(new Error('network'));

    const items = [createListItem({ id: 1 })];
    const { result } = renderHook(() => useWatchProviderEnrichment(items, true));

    await waitFor(() => expect(result.current.isLoadingEnrichment).toBe(false));
    expect(result.current.providerMap.get('movie-1')).toEqual([]);
    expect(getCachedWatchProviders('US', 'movie-1')).toBeUndefined();
  });

  it('retries after a 429 response', async () => {
    mockGetMovieWatchProviders
      .mockRejectedValueOnce(Object.assign(new Error('rate limited'), { status: 429 }))
      .mockResolvedValueOnce({ flatrate: [provider(8)] });

    const items = [createListItem({ id: 1 })];
    const { result } = renderHook(() => useWatchProviderEnrichment(items, true));

    await waitFor(() => expect(result.current.isLoadingEnrichment).toBe(false), {
      timeout: 4000,
    });
    expect(mockGetMovieWatchProviders).toHaveBeenCalledTimes(2);
    expect(result.current.providerMap.get('movie-1')).toEqual([8]);
  });

  it('does nothing while disabled', async () => {
    const items = [createListItem({ id: 1 })];
    const { result } = renderHook(() => useWatchProviderEnrichment(items, false));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isLoadingEnrichment).toBe(false);
    expect(result.current.providerMap.size).toBe(0);
    expect(mockGetMovieWatchProviders).not.toHaveBeenCalled();
  });

  it('reports loading immediately when switching to a different list', async () => {
    mockGetMovieWatchProviders.mockResolvedValue({ flatrate: [provider(8)] });
    const listA = [createListItem({ id: 1 })];
    const listB = [createListItem({ id: 2 })];

    const { result, rerender } = renderHook(
      ({ items }: { items: ListMediaItem[] }) => useWatchProviderEnrichment(items, true),
      { initialProps: { items: listA } }
    );
    await waitFor(() => expect(result.current.isLoadingEnrichment).toBe(false));

    let resolveB: (value: unknown) => void = () => {};
    mockGetMovieWatchProviders.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveB = resolve;
      })
    );
    rerender({ items: listB });
    expect(result.current.isLoadingEnrichment).toBe(true);

    await act(async () => {
      resolveB({ flatrate: [provider(337)] });
    });
    await waitFor(() => expect(result.current.isLoadingEnrichment).toBe(false));
    expect(result.current.providerMap.get('movie-2')).toEqual([337]);
  });
});
