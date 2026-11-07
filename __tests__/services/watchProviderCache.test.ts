import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  flushWatchProviderCache,
  getCachedWatchProviders,
  isWatchProviderEntryStale,
  loadWatchProviderCache,
  resetWatchProviderCacheForTests,
  setCachedWatchProviders,
  WATCH_PROVIDER_CACHE_MAX_ENTRIES,
  WATCH_PROVIDER_CACHE_TTL_MS,
} from '@/src/services/watchProviderCache';

const STORAGE_KEY_US = 'showseek_watch_provider_cache_v1:US';

describe('watchProviderCache', () => {
  beforeEach(async () => {
    resetWatchProviderCacheForTests();
    await AsyncStorage.clear();
  });

  it('round-trips entries through storage in a compact per-region format', async () => {
    await loadWatchProviderCache('US');
    setCachedWatchProviders('US', 'movie-1', [8, 337], 1_700_000_000_000);
    setCachedWatchProviders('US', 'tv-2', [], 1_700_000_000_000);
    await flushWatchProviderCache('US');

    const raw = await AsyncStorage.getItem(STORAGE_KEY_US);
    expect(JSON.parse(raw!)).toEqual({
      v: 1,
      e: { 'movie-1': [1_700_000_000, 8, 337], 'tv-2': [1_700_000_000] },
    });

    resetWatchProviderCacheForTests();
    await loadWatchProviderCache('US');

    expect(getCachedWatchProviders('US', 'movie-1')).toEqual({
      providerIds: [8, 337],
      fetchedAt: 1_700_000_000_000,
    });
    expect(getCachedWatchProviders('US', 'tv-2')?.providerIds).toEqual([]);
  });

  it('keeps regions separate', async () => {
    await loadWatchProviderCache('US');
    await loadWatchProviderCache('GB');
    setCachedWatchProviders('US', 'movie-1', [8]);

    expect(getCachedWatchProviders('GB', 'movie-1')).toBeUndefined();
  });

  it('ignores corrupt or old-format storage', async () => {
    await AsyncStorage.setItem(STORAGE_KEY_US, '{not json');
    await loadWatchProviderCache('US');
    expect(getCachedWatchProviders('US', 'movie-1')).toBeUndefined();

    resetWatchProviderCacheForTests();
    await AsyncStorage.setItem(STORAGE_KEY_US, JSON.stringify({ v: 0, e: { 'movie-1': [1, 8] } }));
    await loadWatchProviderCache('US');
    expect(getCachedWatchProviders('US', 'movie-1')).toBeUndefined();
  });

  it('marks entries stale after the TTL', () => {
    const now = 1_700_000_000_000;
    expect(isWatchProviderEntryStale({ providerIds: [], fetchedAt: now - 1000 }, now)).toBe(false);
    expect(
      isWatchProviderEntryStale(
        { providerIds: [], fetchedAt: now - WATCH_PROVIDER_CACHE_TTL_MS },
        now
      )
    ).toBe(true);
  });

  it('evicts the least recently updated entries beyond the size cap', async () => {
    await loadWatchProviderCache('US');
    for (let i = 0; i < WATCH_PROVIDER_CACHE_MAX_ENTRIES; i += 1) {
      setCachedWatchProviders('US', `movie-${i}`, [8], 1000 + i);
    }
    // Refresh movie-0 so it is no longer the oldest.
    setCachedWatchProviders('US', 'movie-0', [8], 999_999);
    setCachedWatchProviders('US', 'movie-new', [8], 1_000_000);

    expect(getCachedWatchProviders('US', 'movie-0')).toBeDefined();
    expect(getCachedWatchProviders('US', 'movie-1')).toBeUndefined();
    expect(getCachedWatchProviders('US', 'movie-new')).toBeDefined();
  });
});
