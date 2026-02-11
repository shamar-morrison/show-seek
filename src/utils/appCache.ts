import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { clearRequestQueue } from './rateLimitedQuery';

const SAFE_CACHE_PREFIXES = [
  '@genre_map_movie_',
  '@genre_map_tv_',
  '@omdb_ratings_',
  'widget_data_',
] as const;

/**
 * Clear safe, derived app caches while preserving user/session preferences.
 */
export async function clearAppCache(queryClient: QueryClient): Promise<void> {
  const allKeys = await AsyncStorage.getAllKeys();
  const keysToRemove = allKeys.filter((key) =>
    SAFE_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))
  );

  if (keysToRemove.length > 0) {
    await AsyncStorage.multiRemove(keysToRemove);
  }

  queryClient.clear();
  clearRequestQueue();

  try {
    await Image.clearMemoryCache();
  } catch (error) {
    console.warn('[appCache] Failed to clear image memory cache:', error);
  }

  try {
    await Image.clearDiskCache();
  } catch (error) {
    console.warn('[appCache] Failed to clear image disk cache:', error);
  }
}
