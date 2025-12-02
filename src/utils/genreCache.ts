import { tmdbApi } from '@/src/api/tmdb';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MOVIE_GENRE_CACHE_KEY = '@genre_map_movie';
const TV_GENRE_CACHE_KEY = '@genre_map_tv';
const CACHE_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days

interface Genre {
  id: number;
  name: string;
}

interface CachedGenres {
  data: Record<number, string>;
  timestamp: number;
}

export const getGenres = async (type: 'movie' | 'tv'): Promise<Record<number, string>> => {
  const cacheKey = type === 'movie' ? MOVIE_GENRE_CACHE_KEY : TV_GENRE_CACHE_KEY;

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
      const cacheKey = type === 'movie' ? MOVIE_GENRE_CACHE_KEY : TV_GENRE_CACHE_KEY;
      await AsyncStorage.removeItem(cacheKey);
      console.log(`${type} genre cache cleared`);
    } else {
      await Promise.all([
        AsyncStorage.removeItem(MOVIE_GENRE_CACHE_KEY),
        AsyncStorage.removeItem(TV_GENRE_CACHE_KEY),
      ]);
      console.log('All genre caches cleared');
    }
  } catch (error) {
    console.error('Error clearing genre cache:', error);
  }
};
