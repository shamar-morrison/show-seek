import { clearAppCache } from '@/src/utils/appCache';
import { clearRequestQueue } from '@/src/utils/rateLimitedQuery';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';

jest.mock('expo-image', () => ({
  Image: {
    clearMemoryCache: jest.fn(),
    clearDiskCache: jest.fn(),
  },
}));

jest.mock('@/src/utils/rateLimitedQuery', () => ({
  clearRequestQueue: jest.fn(),
}));

describe('appCache', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient();

    (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue([]);
    (AsyncStorage.multiRemove as jest.Mock).mockResolvedValue(undefined);
    (Image.clearMemoryCache as jest.Mock).mockResolvedValue(true);
    (Image.clearDiskCache as jest.Mock).mockResolvedValue(true);
  });

  it('removes only safe cache keys and preserves non-cache keys', async () => {
    (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue([
      '@genre_map_movie_en-US',
      '@genre_map_tv_en-US',
      '@omdb_ratings_tt12345',
      'widget_data_upcoming_movies',
      'showseek_language',
      'showseek_region',
      'hasCompletedOnboarding',
    ]);

    await clearAppCache(queryClient);

    expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([
      '@genre_map_movie_en-US',
      '@genre_map_tv_en-US',
      '@omdb_ratings_tt12345',
      'widget_data_upcoming_movies',
    ]);
  });

  it('calls query cache clear and clears request queue', async () => {
    queryClient.setQueryData(['trending'], { id: 1 });

    await clearAppCache(queryClient);

    expect(queryClient.getQueryData(['trending'])).toBeUndefined();
    expect(clearRequestQueue).toHaveBeenCalledTimes(1);
  });

  it('invokes expo-image memory and disk cache clearing', async () => {
    await clearAppCache(queryClient);

    expect(Image.clearMemoryCache).toHaveBeenCalledTimes(1);
    expect(Image.clearDiskCache).toHaveBeenCalledTimes(1);
  });

  it('handles empty AsyncStorage keyset safely', async () => {
    (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue([]);

    await expect(clearAppCache(queryClient)).resolves.toBeUndefined();
    expect(AsyncStorage.multiRemove).not.toHaveBeenCalled();
  });
});
