import axios from 'axios';

const TMDB_API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY || 'YOUR_TMDB_API_KEY';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

export const TMDB_IMAGE_SIZES = {
  poster: {
    small: '/w185',
    medium: '/w342',
    large: '/w500',
    original: '/original',
  },
  backdrop: {
    small: '/w300',
    medium: '/w780',
    large: '/w1280',
    original: '/original',
  },
  profile: {
    small: '/w45',
    medium: '/w185',
    large: '/h632',
    original: '/original',
  },
} as const;

// Dynamic language setting for TMDB API requests
let currentLanguage = 'en-US';

/**
 * Set the language for all TMDB API requests.
 * Call this when the user changes their language preference.
 */
export const setApiLanguage = (language: string) => {
  currentLanguage = language;
};

/**
 * Get the current API language setting.
 */
export const getApiLanguage = () => currentLanguage;

export const tmdbClient = axios.create({
  baseURL: BASE_URL,
  params: {
    api_key: TMDB_API_KEY,
    // Note: language is now injected dynamically via interceptor
  },
});

// Inject language parameter dynamically on every request
tmdbClient.interceptors.request.use((config) => {
  config.params = config.params || {};
  config.params.language = currentLanguage;
  return config;
});

export const getImageUrl = (path: string | null, size: string = TMDB_IMAGE_SIZES.poster.medium) => {
  if (!path) return null;
  return `${IMAGE_BASE_URL}${size}${path}`;
};

export interface Movie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
  genre_ids: number[];
  video: boolean;
  adult: boolean;
  original_language: string;
}

export interface TVShow {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
  genre_ids: number[];
  original_language: string;
}

export interface Person {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department: string;
  popularity: number;
}

export interface PaginatedResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface Genre {
  id: number;
  name: string;
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

export interface CrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

export interface Video {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official?: boolean;
}

export interface TrailerItem extends Video {
  mediaId: number;
  mediaType: 'movie' | 'tv';
  mediaTitle: string;
  mediaPosterPath: string | null;
}

export interface ProductionCountry {
  iso_3166_1: string;
  name: string;
}

export interface ProductionCompany {
  id: number;
  logo_path: string | null;
  name: string;
  origin_country: string;
}

export interface ReleaseDate {
  certification: string;
  descriptors: string[];
  iso_639_1: string;
  note: string;
  release_date: string;
  type: number;
}

export interface ReleaseDatesResult {
  iso_3166_1: string;
  release_dates: ReleaseDate[];
}

export interface ContentRating {
  iso_3166_1: string;
  rating: string;
}

export interface CollectionBasic {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
}

export interface CollectionPart {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
}

export interface CollectionDetails {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  parts: CollectionPart[];
}

export interface MovieDetails extends Movie {
  runtime: number | null;
  genres: Genre[];
  status: string;
  tagline: string | null;
  budget: number;
  revenue: number;
  production_countries: ProductionCountry[];
  production_companies: ProductionCompany[];
  release_dates: {
    results: ReleaseDatesResult[];
  };
  belongs_to_collection: CollectionBasic | null;
}

export interface TVShowDetails extends TVShow {
  number_of_seasons: number;
  number_of_episodes: number;
  genres: Genre[];
  status: 'Returning Series' | 'Ended' | 'Canceled' | 'In Production' | 'Planned' | 'Pilot';
  seasons: Season[];
  episode_run_time: number[];
  last_air_date: string;
  production_countries: ProductionCountry[];
  production_companies: ProductionCompany[];
  content_ratings: {
    results: ContentRating[];
  };
  created_by: {
    id: number;
    name: string;
    profile_path: string | null;
  }[];
  // Episode tracking for reminders
  next_episode_to_air?: {
    id: number;
    name: string;
    overview: string;
    air_date: string | null;
    episode_number: number;
    season_number: number;
    still_path: string | null;
  } | null;
  last_episode_to_air?: {
    id: number;
    name: string;
    overview: string;
    air_date: string | null;
    episode_number: number;
    season_number: number;
    still_path: string | null;
  } | null;
}

export interface Season {
  id: number;
  name: string;
  season_number: number;
  episode_count: number;
  air_date: string | null;
  poster_path: string | null;
  overview: string;
}

export interface Episode {
  id: number;
  name: string;
  episode_number: number;
  season_number: number;
  air_date: string | null;
  overview: string;
  still_path: string | null;
  runtime: number | null;
  vote_average: number;
}

// Extended episode details
export interface EpisodeDetails extends Episode {
  crew: CrewMember[];
  guest_stars: CastMember[];
  production_code: string;
}

// Episode credits response
export interface EpisodeCredits {
  cast: CastMember[];
  crew: CrewMember[];
  guest_stars: CastMember[];
}

// Episode images response
export interface EpisodeImages {
  stills: ImageData[];
}

export interface PersonDetails extends Person {
  biography: string;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  also_known_as: string[];
}
export interface MovieCrewCredit extends Movie {
  job: string;
  department: string;
}

export interface TVCrewCredit extends TVShow {
  job: string;
  department: string;
}

export interface ImageData {
  aspect_ratio: number;
  file_path: string;
  height: number;
  width: number;
  vote_average: number;
  vote_count: number;
}

export interface WatchProvider {
  logo_path: string;
  provider_id: number;
  provider_name: string;
  display_priority: number;
}

export interface WatchProviderResults {
  link?: string;
  flatrate?: WatchProvider[];
  rent?: WatchProvider[];
  buy?: WatchProvider[];
}

export interface ReviewAuthor {
  name: string;
  username: string;
  avatar_path: string | null;
  rating: number | null;
}

export interface Review {
  id: string;
  author: string;
  author_details: ReviewAuthor;
  content: string;
  created_at: string;
  updated_at: string;
  url: string;
}

export const tmdbApi = {
  getTrendingMovies: async (timeWindow: 'day' | 'week' = 'week', page: number = 1) => {
    const { data } = await tmdbClient.get<PaginatedResponse<Movie>>(
      `/trending/movie/${timeWindow}`,
      { params: { page } }
    );
    return data;
  },

  getTrendingTV: async (timeWindow: 'day' | 'week' = 'week', page: number = 1) => {
    const { data } = await tmdbClient.get<PaginatedResponse<TVShow>>(`/trending/tv/${timeWindow}`, {
      params: { page },
    });
    return data;
  },

  getPopularMovies: async (page: number = 1) => {
    const { data } = await tmdbClient.get<PaginatedResponse<Movie>>('/movie/popular', {
      params: { page },
    });
    return data;
  },

  getTopRatedMovies: async (page: number = 1) => {
    const { data } = await tmdbClient.get<PaginatedResponse<Movie>>('/movie/top_rated', {
      params: { page },
    });
    return data;
  },

  getUpcomingMovies: async (page: number = 1) => {
    const { data } = await tmdbClient.get<PaginatedResponse<Movie>>('/movie/upcoming', {
      params: { page },
    });
    return data;
  },

  getUpcomingTVShows: async (page: number = 1) => {
    // Get today's date and 30 days from now for the upcoming window
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + 30);

    const formatDate = (date: Date) => date.toISOString().split('T')[0];

    const { data } = await tmdbClient.get<PaginatedResponse<TVShow>>('/discover/tv', {
      params: {
        page,
        'first_air_date.gte': formatDate(today),
        'first_air_date.lte': formatDate(futureDate),
        sort_by: 'first_air_date.asc',
        with_original_language: 'en',
      },
    });
    return data;
  },

  getMovieDetails: async (id: number) => {
    const { data } = await tmdbClient.get<MovieDetails>(`/movie/${id}`, {
      params: {
        append_to_response: 'release_dates',
      },
    });
    return data;
  },

  getTVShowDetails: async (id: number) => {
    const { data } = await tmdbClient.get<TVShowDetails>(`/tv/${id}`, {
      params: {
        append_to_response: 'content_ratings',
      },
    });
    return data;
  },

  getCollectionDetails: async (id: number) => {
    const { data } = await tmdbClient.get<CollectionDetails>(`/collection/${id}`);
    return data;
  },

  getMovieCredits: async (id: number) => {
    const { data } = await tmdbClient.get<{ cast: CastMember[]; crew: CrewMember[] }>(
      `/movie/${id}/credits`
    );
    return data;
  },

  getTVCredits: async (id: number) => {
    const { data } = await tmdbClient.get<{ cast: CastMember[]; crew: CrewMember[] }>(
      `/tv/${id}/credits`
    );
    return data;
  },

  getMovieVideos: async (id: number) => {
    const { data } = await tmdbClient.get<{ results: Video[] }>(`/movie/${id}/videos`);
    return data.results;
  },

  getTVVideos: async (id: number) => {
    const { data } = await tmdbClient.get<{ results: Video[] }>(`/tv/${id}/videos`);
    return data.results;
  },

  getSimilarMovies: async (id: number) => {
    const { data } = await tmdbClient.get<PaginatedResponse<Movie>>(`/movie/${id}/similar`);
    return data;
  },

  getSimilarTV: async (id: number) => {
    const { data } = await tmdbClient.get<PaginatedResponse<TVShow>>(`/tv/${id}/similar`);
    return data;
  },

  getRecommendedMovies: async (id: number) => {
    const { data } = await tmdbClient.get<PaginatedResponse<Movie>>(`/movie/${id}/recommendations`);
    return data;
  },

  getRecommendedTV: async (id: number) => {
    const { data } = await tmdbClient.get<PaginatedResponse<TVShow>>(`/tv/${id}/recommendations`);
    return data;
  },

  searchMovies: async (query: string, page: number = 1) => {
    const { data } = await tmdbClient.get<PaginatedResponse<Movie>>('/search/movie', {
      params: { query, page },
    });
    return data;
  },

  searchTV: async (query: string, page: number = 1) => {
    const { data } = await tmdbClient.get<PaginatedResponse<TVShow>>('/search/tv', {
      params: { query, page },
    });
    return data;
  },

  searchMulti: async (query: string, page: number = 1) => {
    const { data } = await tmdbClient.get<PaginatedResponse<Movie | TVShow | Person>>(
      '/search/multi',
      {
        params: { query, page },
      }
    );
    return data;
  },

  getPersonDetails: async (id: number) => {
    const { data } = await tmdbClient.get<PersonDetails>(`/person/${id}`);
    return data;
  },

  getPersonMovieCredits: async (id: number) => {
    const { data } = await tmdbClient.get<{ cast: Movie[]; crew: MovieCrewCredit[] }>(
      `/person/${id}/movie_credits`
    );
    return data;
  },

  getPersonTVCredits: async (id: number) => {
    const { data } = await tmdbClient.get<{ cast: TVShow[]; crew: TVCrewCredit[] }>(
      `/person/${id}/tv_credits`
    );
    return data;
  },

  getSeasonDetails: async (tvId: number, seasonNumber: number) => {
    const { data } = await tmdbClient.get<Season & { episodes: Episode[] }>(
      `/tv/${tvId}/season/${seasonNumber}`
    );
    return data;
  },

  // Get detailed episode information
  getEpisodeDetails: async (tvId: number, seasonNumber: number, episodeNumber: number) => {
    const { data } = await tmdbClient.get<EpisodeDetails>(
      `/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}`
    );
    return data;
  },

  // Get episode credits (guest cast and crew)
  getEpisodeCredits: async (tvId: number, seasonNumber: number, episodeNumber: number) => {
    const { data } = await tmdbClient.get<EpisodeCredits>(
      `/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}/credits`
    );
    return data;
  },

  // Get episode videos (clips, trailers)
  getEpisodeVideos: async (tvId: number, seasonNumber: number, episodeNumber: number) => {
    const { data } = await tmdbClient.get<{ results: Video[] }>(
      `/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}/videos`
    );
    return data.results;
  },

  // Get episode images (stills)
  getEpisodeImages: async (tvId: number, seasonNumber: number, episodeNumber: number) => {
    const { data } = await tmdbClient.get<EpisodeImages>(
      `/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}/images`
    );
    return data;
  },

  // Get episode reviews
  getEpisodeReviews: async (
    tvId: number,
    seasonNumber: number,
    episodeNumber: number,
    page: number = 1
  ) => {
    const { data } = await tmdbClient.get<PaginatedResponse<Review>>(
      `/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}/reviews`,
      { params: { page } }
    );
    return data;
  },

  getGenres: async (type: 'movie' | 'tv') => {
    const { data } = await tmdbClient.get<{ genres: Genre[] }>(`/genre/${type}/list`);
    return data.genres;
  },

  getLanguages: async () => {
    const { data } = await tmdbClient.get<
      { iso_639_1: string; english_name: string; name: string }[]
    >('/configuration/languages');
    return data.sort((a, b) => a.english_name.localeCompare(b.english_name));
  },

  discoverMovies: async (params?: {
    page?: number;
    genre?: string;
    year?: number;
    sortBy?: string;
    voteAverageGte?: number;
    withOriginalLanguage?: string;
    withWatchProviders?: number;
    watchRegion?: string;
  }) => {
    const { data } = await tmdbClient.get<PaginatedResponse<Movie>>('/discover/movie', {
      params: {
        page: params?.page || 1,
        with_genres: params?.genre,
        primary_release_year: params?.year,
        sort_by: params?.sortBy || 'popularity.desc',
        'vote_average.gte': params?.voteAverageGte,
        with_original_language: params?.withOriginalLanguage,
        with_watch_providers: params?.withWatchProviders,
        watch_region: params?.withWatchProviders ? params?.watchRegion || 'US' : undefined,
      },
    });
    return data;
  },

  discoverTV: async (params?: {
    page?: number;
    genre?: string;
    year?: number;
    sortBy?: string;
    voteAverageGte?: number;
    withOriginalLanguage?: string;
    withWatchProviders?: number;
    watchRegion?: string;
  }) => {
    const { data } = await tmdbClient.get<PaginatedResponse<TVShow>>('/discover/tv', {
      params: {
        page: params?.page || 1,
        with_genres: params?.genre,
        first_air_date_year: params?.year,
        sort_by: params?.sortBy || 'popularity.desc',
        'vote_average.gte': params?.voteAverageGte,
        with_original_language: params?.withOriginalLanguage,
        with_watch_providers: params?.withWatchProviders,
        watch_region: params?.withWatchProviders ? params?.watchRegion || 'US' : undefined,
      },
    });
    return data;
  },

  getMovieImages: async (id: number) => {
    const { data } = await tmdbClient.get<{ backdrops: ImageData[]; posters: ImageData[] }>(
      `/movie/${id}/images`
    );
    return data;
  },

  getTVImages: async (id: number) => {
    const { data } = await tmdbClient.get<{ backdrops: ImageData[]; posters: ImageData[] }>(
      `/tv/${id}/images`
    );
    return data;
  },

  getMovieWatchProviders: async (id: number) => {
    const { data } = await tmdbClient.get<{ results: { US?: WatchProviderResults } }>(
      `/movie/${id}/watch/providers`
    );
    return data.results.US || null;
  },

  getTVWatchProviders: async (id: number) => {
    const { data } = await tmdbClient.get<{ results: { US?: WatchProviderResults } }>(
      `/tv/${id}/watch/providers`
    );
    return data.results.US || null;
  },

  getMovieReviews: async (id: number, page: number = 1) => {
    const { data } = await tmdbClient.get<PaginatedResponse<Review>>(`/movie/${id}/reviews`, {
      params: { page },
    });
    return data;
  },

  getTVReviews: async (id: number, page: number = 1) => {
    const { data } = await tmdbClient.get<PaginatedResponse<Review>>(`/tv/${id}/reviews`, {
      params: { page },
    });
    return data;
  },

  // These are cached for 30 days since they rarely change
  getWatchProviders: async (type: 'movie' | 'tv') => {
    const { data } = await tmdbClient.get<{
      results: WatchProvider[];
    }>(`/watch/providers/${type}`, {
      params: {
        watch_region: 'US',
      },
    });
    return data.results.sort((a, b) => a.display_priority - b.display_priority);
  },

  /**
   * Get latest trailers from upcoming movies and TV shows
   * Returns 5 movie trailers + 5 TV show trailers, filtered by official YouTube trailers
   * Optimized to reduce API calls by processing sequentially with early termination
   */
  getLatestTrailers: async (): Promise<TrailerItem[]> => {
    const [moviesData, tvData] = await Promise.all([
      tmdbApi.getUpcomingMovies(1),
      tmdbApi.getUpcomingTVShows(1),
    ]);

    const getOfficialTrailer = async (
      id: number,
      type: 'movie' | 'tv',
      title: string,
      posterPath: string | null
    ): Promise<TrailerItem | null> => {
      try {
        const videos =
          type === 'movie' ? await tmdbApi.getMovieVideos(id) : await tmdbApi.getTVVideos(id);

        const trailer = videos.find(
          (v) => v.site === 'YouTube' && v.type === 'Trailer' && v.official === true
        );

        if (trailer) {
          return {
            ...trailer,
            mediaId: id,
            mediaType: type,
            mediaTitle: title,
            mediaPosterPath: posterPath,
          };
        }
        return null;
      } catch {
        return null;
      }
    };

    // Process items sequentially with early termination to reduce API calls
    const collectTrailers = async (
      items: Array<{ id: number; title: string; poster_path: string | null }>,
      type: 'movie' | 'tv',
      targetCount: number
    ): Promise<TrailerItem[]> => {
      const trailers: TrailerItem[] = [];
      for (const item of items) {
        if (trailers.length >= targetCount) break;
        const trailer = await getOfficialTrailer(item.id, type, item.title, item.poster_path);
        if (trailer) {
          trailers.push(trailer);
        }
      }
      return trailers;
    };

    // Prepare items with normalized title field
    const movieItems = moviesData.results.slice(0, 8).map((m) => ({
      id: m.id,
      title: m.title,
      poster_path: m.poster_path,
    }));

    const tvItems = tvData.results.slice(0, 8).map((s) => ({
      id: s.id,
      title: s.name,
      poster_path: s.poster_path,
    }));

    // Fetch trailers for movies and TV shows in parallel (but each processes sequentially)
    const [movieTrailers, tvTrailers] = await Promise.all([
      collectTrailers(movieItems, 'movie', 5),
      collectTrailers(tvItems, 'tv', 5),
    ]);

    return [...movieTrailers, ...tvTrailers];
  },
};
