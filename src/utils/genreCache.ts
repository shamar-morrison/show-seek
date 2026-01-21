import { getApiLanguage, tmdbApi } from '@/src/api/tmdb';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MOVIE_GENRE_CACHE_KEY_PREFIX = '@genre_map_movie_';
const TV_GENRE_CACHE_KEY_PREFIX = '@genre_map_tv_';
const CACHE_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Get the cache key for genres, including language suffix.
 * This ensures genres are cached per-language.
 */
const getCacheKey = (type: 'movie' | 'tv'): string => {
  const language = getApiLanguage();
  const prefix = type === 'movie' ? MOVIE_GENRE_CACHE_KEY_PREFIX : TV_GENRE_CACHE_KEY_PREFIX;
  return `${prefix}${language}`;
};

interface Genre {
  id: number;
  name: string;
}

interface CachedGenres {
  data: Record<number, string>;
  timestamp: number;
}

export const getGenres = async (type: 'movie' | 'tv'): Promise<Record<number, string>> => {
  const cacheKey = getCacheKey(type);

  try {
    const cached = await AsyncStorage.getItem(cacheKey);

    if (cached) {
      const { data, timestamp }: CachedGenres = JSON.parse(cached);
      const isExpired = Date.now() - timestamp > CACHE_DURATION;

      if (!isExpired) {
        // Use cached genres
        return data;
      }
      console.log(`${type} genre cache expired, fetching fresh data`);
    } else {
      console.log(`No cached ${type} genres found, fetching from API`);
    }
  } catch (error) {
    console.error(`Error reading ${type} genre cache:`, error);
  }

  // Fetch fresh data
  try {
    const genres = await tmdbApi.getGenres(type);

    const map: Record<number, string> = {};
    genres.forEach((genre: Genre) => {
      map[genre.id] = genre.name;
    });

    // Cache the data
    try {
      await AsyncStorage.setItem(
        cacheKey,
        JSON.stringify({
          data: map,
          timestamp: Date.now(),
        })
      );
      console.log(`${type} genres cached successfully`);
    } catch (error) {
      console.error(`Error caching ${type} genres:`, error);
    }

    return map;
  } catch (error) {
    console.error(`Failed to fetch ${type} genres from API:`, error);
    throw error;
  }
};

export const clearGenreCache = async (type?: 'movie' | 'tv'): Promise<void> => {
  try {
    if (type) {
      const cacheKey = getCacheKey(type);
      await AsyncStorage.removeItem(cacheKey);
      console.log(`${type} genre cache for current language cleared`);
    } else {
      // Clear cache for current language only
      await Promise.all([
        AsyncStorage.removeItem(getCacheKey('movie')),
        AsyncStorage.removeItem(getCacheKey('tv')),
      ]);
      console.log('All genre caches for current language cleared');
    }
  } catch (error) {
    console.error('Error clearing genre cache:', error);
  }
};
