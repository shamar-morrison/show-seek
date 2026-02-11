import { clearAppCache } from '@/src/utils/appCache';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';

jest.mock('expo-image', () => ({
  Image: {
    clearMemoryCache: jest.fn(),
    clearDiskCache: jest.fn(),
  },
}));

describe('appCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue([]);
    (AsyncStorage.multiRemove as jest.Mock).mockResolvedValue(undefined);
    (Image.clearMemoryCache as jest.Mock).mockResolvedValue(true);
    (Image.clearDiskCache as jest.Mock).mockResolvedValue(true);
  });

  it('does not touch AsyncStorage keys', async () => {
    (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue([
      '@genre_map_movie_en-US',
      '@genre_map_tv_en-US',
      '@omdb_ratings_tt12345',
      'widget_data_upcoming_movies',
      'showseek_language',
      'showseek_region',
      'hasCompletedOnboarding',
    ]);

    await clearAppCache();

    expect(AsyncStorage.getAllKeys).not.toHaveBeenCalled();
    expect(AsyncStorage.multiRemove).not.toHaveBeenCalled();
  });

  it('does not require a query client', async () => {
    await expect(clearAppCache()).resolves.toBeUndefined();
  });

  it('invokes expo-image memory and disk cache clearing', async () => {
    await clearAppCache();

    expect(Image.clearMemoryCache).toHaveBeenCalledTimes(1);
    expect(Image.clearDiskCache).toHaveBeenCalledTimes(1);
  });

  it('continues when one image clear operation fails', async () => {
    (Image.clearMemoryCache as jest.Mock).mockRejectedValueOnce(new Error('failed'));

    await expect(clearAppCache()).resolves.toBeUndefined();
    expect(AsyncStorage.multiRemove).not.toHaveBeenCalled();
    expect(Image.clearDiskCache).toHaveBeenCalledTimes(1);
  });
});
