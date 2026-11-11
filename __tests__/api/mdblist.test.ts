const mockGetItem = jest.fn();
const mockSetItem = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: (...args: unknown[]) => mockGetItem(...args),
  setItem: (...args: unknown[]) => mockSetItem(...args),
}));

const loadModule = (apiKey: string | undefined = 'test-key') => {
  jest.resetModules();
  process.env.EXPO_PUBLIC_MDBLIST_API_KEY = apiKey;
  return require('@/src/api/mdblist') as typeof import('@/src/api/mdblist');
};

const fightClubResponse = {
  imdb_id: 'tt0137523',
  ids: { imdb: 'tt0137523', tmdb: 550 },
  ratings: [
    { source: 'imdb', value: 8.8, score: 88, votes: 2400000 },
    { source: 'tomatoes', value: 79, score: 79, votes: 140 },
    { source: 'metacritic', value: 67, score: 67, votes: 35 },
    { source: 'letterboxd', value: 4.27, score: 85, votes: 900000 },
    { source: 'trakt', value: 88, score: 88, votes: 60000 },
    { source: 'popcorn', value: 96, score: 96, votes: 250000 },
  ],
};

describe('MDBList ratings', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch as unknown as typeof fetch;
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe('parseMdblistRatings', () => {
    it('formats each site in its own scale', () => {
      const { parseMdblistRatings } = loadModule();
      expect(parseMdblistRatings(fightClubResponse)).toEqual({
        imdb: '8.8',
        rottenTomatoes: '79%',
        metacritic: '67',
        letterboxd: '4.3',
        trakt: '88%',
        imdbId: 'tt0137523',
      });
    });

    it('treats empty sources as missing', () => {
      const { parseMdblistRatings } = loadModule();
      const ratings = parseMdblistRatings({
        ratings: [
          { source: 'imdb', value: null, score: null, votes: null },
          { source: 'letterboxd', value: 0, score: 0, votes: 0 },
          { source: 'tomatoes', value: 0, score: 0, votes: 12 },
        ],
      });
      expect(ratings.imdb).toBeNull();
      expect(ratings.letterboxd).toBeNull();
      // A real 0% with reviews behind it is a score.
      expect(ratings.rottenTomatoes).toBe('0%');
    });

    it('converts the 0–100 score when a value is out of the site range', () => {
      const { parseMdblistRatings } = loadModule();
      const ratings = parseMdblistRatings({
        ratings: [
          { source: 'imdb', value: 88, score: 88, votes: 10 },
          { source: 'letterboxd', value: 85, score: 85, votes: 10 },
        ],
      });
      expect(ratings.imdb).toBe('8.8');
      expect(ratings.letterboxd).toBe('4.3');
    });
  });

  describe('fetchExternalRatings', () => {
    it('asks MDBList by TMDB ID (shows as "show") and caches the result', async () => {
      const { fetchExternalRatings } = loadModule();
      mockFetch.mockResolvedValue({ ok: true, json: async () => fightClubResponse });

      const ratings = await fetchExternalRatings('tv', 1399);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.mdblist.com/tmdb/show/1399?apikey=test-key'
      );
      expect(ratings?.trakt).toBe('88%');
      expect(mockSetItem).toHaveBeenCalledWith(
        '@mdblist_ratings_v1_show_1399',
        expect.stringContaining('"trakt":"88%"')
      );
    });

    it('uses ratings cached in the last 7 days without asking MDBList', async () => {
      const { fetchExternalRatings } = loadModule();
      const data = {
        imdb: '8.8',
        rottenTomatoes: null,
        metacritic: null,
        letterboxd: null,
        trakt: null,
        imdbId: 'tt1',
      };
      mockGetItem.mockResolvedValue(
        JSON.stringify({ data, timestamp: Date.now() - 6 * 24 * 60 * 60 * 1000 })
      );

      expect(await fetchExternalRatings('movie', 550)).toEqual(data);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('asks again once the cache is over 7 days old', async () => {
      const { fetchExternalRatings } = loadModule();
      mockGetItem.mockResolvedValue(
        JSON.stringify({ data: {}, timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000 })
      );
      mockFetch.mockResolvedValue({ ok: true, json: async () => fightClubResponse });

      expect((await fetchExternalRatings('movie', 550))?.imdb).toBe('8.8');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.mdblist.com/tmdb/movie/550?apikey=test-key'
      );
    });

    it.each([
      ['the daily limit is reached', () => mockFetch.mockResolvedValue({ ok: false, status: 429 })],
      ['the request fails', () => mockFetch.mockRejectedValue(new Error('offline'))],
    ])('returns nothing (so the row hides) when %s', async (_label, setup) => {
      const { fetchExternalRatings } = loadModule();
      setup();

      expect(await fetchExternalRatings('movie', 550)).toBeNull();
      expect(mockSetItem).not.toHaveBeenCalled();
    });

    it('does nothing without an API key', async () => {
      const { fetchExternalRatings } = loadModule('');
      expect(await fetchExternalRatings('movie', 550)).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
