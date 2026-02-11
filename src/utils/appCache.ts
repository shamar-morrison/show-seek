import { Image } from 'expo-image';

/**
 * Clear only cached images (memory + disk).
 */
export async function clearAppCache(): Promise<void> {
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
