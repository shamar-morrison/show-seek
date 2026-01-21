import { clearGenreCache, getGenres } from '@/src/utils/genreCache';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock the TMDB API module
const mockGetGenres = jest.fn();
const mockGetApiLanguage = jest.fn();

jest.mock('@/src/api/tmdb', () => ({
  getApiLanguage: () => mockGetApiLanguage(),
  tmdbApi: {
    getGenres: (type: 'movie' | 'tv') => mockGetGenres(type),
  },
}));

describe('genreCache', () => {
  const mockMovieGenres = [
    { id: 28, name: 'Action' },
    { id: 35, name: 'Comedy' },
    { id: 18, name: 'Drama' },
  ];

  const mockMovieGenresFrench = [
    { id: 28, name: 'Action' },
    { id: 35, name: 'Comédie' },
    { id: 18, name: 'Drame' },
  ];

  const mockTVGenres = [
    { id: 10759, name: 'Action & Adventure' },
    { id: 35, name: 'Comedy' },
  ];

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    // Default to English
    mockGetApiLanguage.mockReturnValue('en-US');
    mockGetGenres.mockImplementation((type) => {
      if (type === 'movie') return Promise.resolve(mockMovieGenres);
      return Promise.resolve(mockTVGenres);
    });
  });

  describe('cache key language isolation', () => {
    it('creates language-specific cache keys for English', async () => {
      mockGetApiLanguage.mockReturnValue('en-US');

      await getGenres('movie');

      // Verify the cache was set with the language-specific key
      const cachedData = await AsyncStorage.getItem('@genre_map_movie_en-US');
      expect(cachedData).not.toBeNull();

      const parsed = JSON.parse(cachedData!);
      expect(parsed.data).toEqual({
        28: 'Action',
        35: 'Comedy',
        18: 'Drama',
      });
    });

    it('creates language-specific cache keys for French', async () => {
      mockGetApiLanguage.mockReturnValue('fr-FR');
      mockGetGenres.mockImplementation((type) => {
        if (type === 'movie') return Promise.resolve(mockMovieGenresFrench);
        return Promise.resolve(mockTVGenres);
      });

      await getGenres('movie');

      // Verify the cache was set with the French language-specific key
      const cachedData = await AsyncStorage.getItem('@genre_map_movie_fr-FR');
      expect(cachedData).not.toBeNull();

      const parsed = JSON.parse(cachedData!);
      expect(parsed.data).toEqual({
        28: 'Action',
        35: 'Comédie',
        18: 'Drame',
      });

      // English cache should NOT exist
      const englishCache = await AsyncStorage.getItem('@genre_map_movie_en-US');
      expect(englishCache).toBeNull();
    });

    it('fetches fresh genres when language changes', async () => {
      // First, cache English genres
      mockGetApiLanguage.mockReturnValue('en-US');
      await getGenres('movie');
      expect(mockGetGenres).toHaveBeenCalledTimes(1);

      // Switch to French - should fetch new data (no cache for fr-FR)
      mockGetApiLanguage.mockReturnValue('fr-FR');
      mockGetGenres.mockImplementation((type) => {
        if (type === 'movie') return Promise.resolve(mockMovieGenresFrench);
        return Promise.resolve(mockTVGenres);
      });

      const frenchGenres = await getGenres('movie');
      expect(mockGetGenres).toHaveBeenCalledTimes(2);
      expect(frenchGenres).toEqual({
        28: 'Action',
        35: 'Comédie',
        18: 'Drame',
      });
    });

    it('uses cached data for same language', async () => {
      mockGetApiLanguage.mockReturnValue('en-US');

      // First call - fetches from API
      await getGenres('movie');
      expect(mockGetGenres).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      await getGenres('movie');
      expect(mockGetGenres).toHaveBeenCalledTimes(1); // No additional API call
    });

    it('maintains separate caches for movie and TV genres', async () => {
      mockGetApiLanguage.mockReturnValue('en-US');

      await getGenres('movie');
      await getGenres('tv');

      const movieCache = await AsyncStorage.getItem('@genre_map_movie_en-US');
      const tvCache = await AsyncStorage.getItem('@genre_map_tv_en-US');

      expect(movieCache).not.toBeNull();
      expect(tvCache).not.toBeNull();

      const movieParsed = JSON.parse(movieCache!);
      const tvParsed = JSON.parse(tvCache!);

      expect(Object.keys(movieParsed.data)).toContain('28'); // Action movie
      expect(Object.keys(tvParsed.data)).toContain('10759'); // Action & Adventure TV
    });
  });

  describe('clearGenreCache', () => {
    it('clears cache for specific type in current language', async () => {
      mockGetApiLanguage.mockReturnValue('en-US');

      // Populate cache
      await getGenres('movie');
      await getGenres('tv');

      // Clear only movie cache
      await clearGenreCache('movie');

      const movieCache = await AsyncStorage.getItem('@genre_map_movie_en-US');
      const tvCache = await AsyncStorage.getItem('@genre_map_tv_en-US');

      expect(movieCache).toBeNull();
      expect(tvCache).not.toBeNull();
    });

    it('clears all genre caches for current language', async () => {
      mockGetApiLanguage.mockReturnValue('en-US');

      // Populate cache
      await getGenres('movie');
      await getGenres('tv');

      // Clear all caches
      await clearGenreCache();

      const movieCache = await AsyncStorage.getItem('@genre_map_movie_en-US');
      const tvCache = await AsyncStorage.getItem('@genre_map_tv_en-US');

      expect(movieCache).toBeNull();
      expect(tvCache).toBeNull();
    });

    it('only clears cache for current language, not other languages', async () => {
      // Populate English cache
      mockGetApiLanguage.mockReturnValue('en-US');
      await getGenres('movie');

      // Populate French cache
      mockGetApiLanguage.mockReturnValue('fr-FR');
      mockGetGenres.mockImplementation(() => Promise.resolve(mockMovieGenresFrench));
      await getGenres('movie');

      // Clear French cache
      await clearGenreCache('movie');

      // French cache should be cleared
      const frenchCache = await AsyncStorage.getItem('@genre_map_movie_fr-FR');
      expect(frenchCache).toBeNull();

      // English cache should still exist
      const englishCache = await AsyncStorage.getItem('@genre_map_movie_en-US');
      expect(englishCache).not.toBeNull();
    });
  });

  describe('cache structure', () => {
    it('stores timestamp along with genre data', async () => {
      mockGetApiLanguage.mockReturnValue('en-US');
      const beforeFetch = Date.now();

      await getGenres('movie');

      const cachedData = await AsyncStorage.getItem('@genre_map_movie_en-US');
      const parsed = JSON.parse(cachedData!);

      expect(parsed.timestamp).toBeDefined();
      expect(parsed.timestamp).toBeGreaterThanOrEqual(beforeFetch);
      expect(parsed.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('converts genre array to id-name map', async () => {
      mockGetApiLanguage.mockReturnValue('en-US');

      const result = await getGenres('movie');

      expect(result).toEqual({
        28: 'Action',
        35: 'Comedy',
        18: 'Drama',
      });
    });
  });
});
