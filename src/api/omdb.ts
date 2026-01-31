/**
 * OMDb API Service
 *
 * Fetches external ratings (IMDb, Rotten Tomatoes, Metacritic) for movies and TV shows.
 * Implements 24-hour AsyncStorage caching to minimize API calls (1,000/day limit).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const OMDB_API_KEY = process.env.EXPO_PUBLIC_OMDB_API_KEY;
const BASE_URL = 'https://www.omdbapi.com';
const CACHE_KEY_PREFIX = '@omdb_ratings_';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Individual rating from a source (IMDb, Rotten Tomatoes, Metacritic)
 */
export interface OMDbRating {
  Source: string;
  Value: string;
}

/**
 * OMDb API response
 */
export interface OMDbResponse {
  Title: string;
  Year: string;
  Rated: string;
  imdbRating: string;
  imdbVotes: string;
  imdbID: string;
  Ratings: OMDbRating[];
  Response: 'True' | 'False';
  Error?: string;
}

/**
 * Parsed external ratings for UI display
 */
export interface ExternalRatings {
  imdb: { rating: string; votes: string } | null;
  rottenTomatoes: string | null;
  metacritic: string | null;
}

/**
 * Cached ratings with timestamp
 */
interface CachedRatings {
  data: ExternalRatings;
  timestamp: number;
}

/**
 * Parse OMDb response into structured ratings
 */
function parseRatings(response: OMDbResponse): ExternalRatings {
  const ratings: ExternalRatings = {
    imdb: null,
    rottenTomatoes: null,
    metacritic: null,
  };

  // IMDb rating from main fields
  if (response.imdbRating && response.imdbRating !== 'N/A') {
    ratings.imdb = {
      rating: response.imdbRating,
      votes: response.imdbVotes || '',
    };
  }

  // Parse Ratings array for RT and Metacritic
  for (const rating of response.Ratings) {
    if (rating.Source === 'Rotten Tomatoes') {
      ratings.rottenTomatoes = rating.Value;
    } else if (rating.Source === 'Metacritic') {
      ratings.metacritic = rating.Value;
    }
  }

  return ratings;
}

/**
 * Check if ratings has at least one valid rating
 */
export function hasValidRatings(ratings: ExternalRatings | null): boolean {
  if (!ratings) return false;
  return !!(ratings.imdb || ratings.rottenTomatoes || ratings.metacritic);
}

/**
 * Fetch external ratings from OMDb API
 *
 * @param imdbId - The IMDB ID (e.g., "tt0111161")
 * @returns Parsed ratings or null if unavailable/error
 */
export async function fetchExternalRatings(imdbId: string): Promise<ExternalRatings | null> {
  if (!OMDB_API_KEY) {
    console.warn('[OMDb] API key not configured');
    return null;
  }

  if (!imdbId) {
    return null;
  }

  const cacheKey = `${CACHE_KEY_PREFIX}${imdbId}`;

  // Check cache first
  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const { data, timestamp }: CachedRatings = JSON.parse(cached);
      const isExpired = Date.now() - timestamp > CACHE_DURATION;

      if (!isExpired) {
        console.log(`[OMDb] Cache hit for ${imdbId}`);
        return data;
      }
      console.log(`[OMDb] Cache expired for ${imdbId}`);
    }
  } catch (error) {
    console.error('[OMDb] Cache read error:', error);
  }

  // Fetch from API
  try {
    const url = `${BASE_URL}/?apikey=${OMDB_API_KEY}&i=${imdbId}`;
    const response = await fetch(url);

    if (!response.ok) {
      // Rate limit or other HTTP error
      console.warn(`[OMDb] HTTP error: ${response.status}`);
      return null;
    }

    const data: OMDbResponse = await response.json();

    if (data.Response === 'False') {
      console.warn(`[OMDb] API error: ${data.Error}`);
      return null;
    }

    const ratings = parseRatings(data);

    // Cache the result
    try {
      await AsyncStorage.setItem(
        cacheKey,
        JSON.stringify({
          data: ratings,
          timestamp: Date.now(),
        } as CachedRatings)
      );
      console.log(`[OMDb] Cached ratings for ${imdbId}`);
    } catch (error) {
      console.error('[OMDb] Cache write error:', error);
    }

    return ratings;
  } catch (error) {
    console.error('[OMDb] Fetch error:', error);
    return null;
  }
}
