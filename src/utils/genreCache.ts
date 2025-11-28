import { tmdbApi } from '@/src/api/tmdb';
import AsyncStorage from '@react-native-async-storage/async-storage';

const GENRE_CACHE_KEY = '@genre_map';
const CACHE_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days

interface Genre {
  id: number;
  name: string;
}

interface CachedGenres {
  data: Record<number, string>;
  timestamp: number;
}

export const getGenres = async (): Promise<Record<number, string>> => {
  try {
    const cached = await AsyncStorage.getItem(GENRE_CACHE_KEY);

    if (cached) {
      const { data, timestamp }: CachedGenres = JSON.parse(cached);
      const isExpired = Date.now() - timestamp > CACHE_DURATION;

      if (!isExpired) {
        // Use cached genres
        return data;
      }
      console.log('Genre cache expired, fetching fresh data');
    } else {
      console.log('No cached genres found, fetching from API');
    }
  } catch (error) {
    console.error('Error reading genre cache:', error);
  }

  // Fetch fresh data
  try {
    const [movieGenres, tvGenres] = await Promise.all([
      tmdbApi.getGenres('movie'),
      tmdbApi.getGenres('tv'),
    ]);

    const map: Record<number, string> = {};
    [...movieGenres, ...tvGenres].forEach((genre: Genre) => {
      map[genre.id] = genre.name;
    });

    // Cache the data
    try {
      await AsyncStorage.setItem(
        GENRE_CACHE_KEY,
        JSON.stringify({
          data: map,
          timestamp: Date.now(),
        })
      );
      console.log('Genres cached successfully');
    } catch (error) {
      console.error('Error caching genres:', error);
    }

    return map;
  } catch (error) {
    console.error('Failed to fetch genres from API:', error);
    throw error;
  }
};

export const clearGenreCache = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(GENRE_CACHE_KEY);
    console.log('Genre cache cleared');
  } catch (error) {
    console.error('Error clearing genre cache:', error);
  }
};
