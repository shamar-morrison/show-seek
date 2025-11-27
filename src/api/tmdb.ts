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

export const tmdbClient = axios.create({
  baseURL: BASE_URL,
  params: {
    api_key: TMDB_API_KEY,
    language: 'en-US',
  },
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
  official: boolean;
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
}

export interface TVShowDetails extends TVShow {
  number_of_seasons: number;
  number_of_episodes: number;
  genres: Genre[];
  status: string;
  seasons: Season[];
  episode_run_time: number[];
  last_air_date: string;
  production_countries: ProductionCountry[];
  production_companies: ProductionCompany[];
  content_ratings: {
    results: ContentRating[];
  };
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

export interface PersonDetails extends Person {
  biography: string;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  also_known_as: string[];
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
    const { data } = await tmdbClient.get<{ cast: Movie[]; crew: Movie[] }>(
      `/person/${id}/movie_credits`
    );
    return data;
  },

  getPersonTVCredits: async (id: number) => {
    const { data } = await tmdbClient.get<{ cast: TVShow[]; crew: TVShow[] }>(
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
  }) => {
    const { data } = await tmdbClient.get<PaginatedResponse<Movie>>('/discover/movie', {
      params: {
        page: params?.page || 1,
        with_genres: params?.genre,
        primary_release_year: params?.year,
        sort_by: params?.sortBy || 'popularity.desc',
        'vote_average.gte': params?.voteAverageGte,
        with_original_language: params?.withOriginalLanguage,
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
  }) => {
    const { data } = await tmdbClient.get<PaginatedResponse<TVShow>>('/discover/tv', {
      params: {
        page: params?.page || 1,
        with_genres: params?.genre,
        first_air_date_year: params?.year,
        sort_by: params?.sortBy || 'popularity.desc',
        'vote_average.gte': params?.voteAverageGte,
        with_original_language: params?.withOriginalLanguage,
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
};
