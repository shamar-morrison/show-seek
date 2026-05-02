type AxiosClientMock = {
  get: jest.Mock;
  interceptors: {
    request: {
      use: jest.Mock;
    };
  };
};

let requestInterceptor: ((config: Record<string, any>) => Record<string, any>) | null = null;
let mockAxiosClient: AxiosClientMock;
const mockAxiosCreate = jest.fn();

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: (...args: unknown[]) => mockAxiosCreate(...args),
  },
}));

describe('tmdb api client', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    requestInterceptor = null;
    mockAxiosClient = {
      get: jest.fn(),
      interceptors: {
        request: {
          use: jest.fn((handler: (config: Record<string, any>) => Record<string, any>) => {
            requestInterceptor = handler;
            return 0;
          }),
        },
      },
    };
    mockAxiosCreate.mockReturnValue(mockAxiosClient);
  });

  const loadTmdbModule = () => require('@/src/api/tmdb') as typeof import('@/src/api/tmdb');

  // Verifies the shared client uses the right base URL, API key, timeout, and request interceptor defaults.
  it('creates the tmdb client with base config and injects language and region params', () => {
    process.env.EXPO_PUBLIC_TMDB_API_KEY = 'tmdb-test-key';

    const { setApiLanguage, setApiRegion } = loadTmdbModule();

    expect(mockAxiosCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://api.themoviedb.org/3',
        params: { api_key: 'tmdb-test-key' },
        timeout: 10000,
      })
    );

    setApiLanguage('es-ES');
    setApiRegion('GB');

    const config = requestInterceptor?.({ params: { page: 2 } });

    expect(config).toEqual({
      params: {
        language: 'es-ES',
        page: 2,
        region: 'GB',
        watch_region: 'GB',
      },
    });
  });

  // Verifies pagination arguments are forwarded unchanged to the TMDB search endpoint.
  it('forwards pagination params for paginated endpoints', async () => {
    const { tmdbApi } = loadTmdbModule();
    mockAxiosClient.get.mockResolvedValueOnce({ data: { page: 3, results: [] } });

    await tmdbApi.searchMovies('dune', 3);

    expect(mockAxiosClient.get).toHaveBeenCalledWith('/search/movie', {
      params: { page: 3, query: 'dune' },
    });
  });

  // Verifies discover filters are translated into TMDB parameter names for personalized browse results.
  it('passes discover filter params through to TMDB', async () => {
    const { tmdbApi } = loadTmdbModule();
    mockAxiosClient.get.mockResolvedValueOnce({ data: { page: 2, results: [] } });

    await tmdbApi.discoverMovies({
      page: 2,
      genre: '18|35',
      year: 2024,
      sortBy: 'vote_average.desc',
      voteAverageGte: 7,
      withOriginalLanguage: 'es',
      withWatchProviders: 8,
      watchRegion: 'MX',
      hideUnreleased: true,
    });

    expect(mockAxiosClient.get).toHaveBeenCalledWith('/discover/movie', {
      params: expect.objectContaining({
        page: 2,
        with_genres: '18|35',
        primary_release_year: 2024,
        sort_by: 'vote_average.desc',
        'vote_average.gte': 7,
        with_original_language: 'es',
        with_watch_providers: 8,
        watch_region: 'MX',
        'primary_release_date.lte': expect.any(String),
      }),
    });
  });

  // Verifies watch-provider lookups call the right endpoint and return the region-scoped provider payload.
  it('uses the watch-provider lookup path and resolves the current region payload', async () => {
    const { setApiRegion, tmdbApi } = loadTmdbModule();
    setApiRegion('CA');
    mockAxiosClient.get.mockResolvedValueOnce({
      data: {
        results: {
          CA: {
            link: 'https://watch.example',
          },
          US: {
            link: 'https://us-watch.example',
          },
        },
      },
    });

    await expect(tmdbApi.getMovieWatchProviders(12)).resolves.toEqual({
      link: 'https://watch.example',
    });
    expect(mockAxiosClient.get).toHaveBeenCalledWith('/movie/12/watch/providers');
  });

  // Verifies 4xx and 5xx responses are normalized into the shared TMDB error shape.
  it('maps API failures to a consistent TmdbApiError shape', async () => {
    const { tmdbApi } = loadTmdbModule();
    mockAxiosClient.get.mockRejectedValueOnce({
      message: 'Request failed with status code 404',
      response: {
        data: {
          status_message: 'The resource was not found.',
        },
        status: 404,
        statusText: 'Not Found',
      },
    });

    await expect(tmdbApi.getTrendingMovies()).rejects.toEqual(
      expect.objectContaining({
        code: 'TMDB_API_ERROR',
        message: 'The resource was not found.',
        name: 'TmdbApiError',
        status: 404,
      })
    );
  });

  // Verifies request timeouts are mapped separately so callers can distinguish slow networks from API failures.
  it('maps network timeouts to the TMDB timeout error shape', async () => {
    const { tmdbApi } = loadTmdbModule();
    mockAxiosClient.get.mockRejectedValueOnce({
      code: 'ECONNABORTED',
      message: 'timeout of 10000ms exceeded',
    });

    await expect(tmdbApi.getPopularMovies()).rejects.toEqual(
      expect.objectContaining({
        code: 'TMDB_TIMEOUT',
        message: 'TMDB request timed out',
        name: 'TmdbApiError',
        status: null,
      })
    );
  });
});
