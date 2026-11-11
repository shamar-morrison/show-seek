export type OpenWithServiceId =
  | 'imdb'
  | 'trakt'
  | 'stremio'
  | 'tmdb'
  | 'letterboxd'
  | 'rottenTomatoes'
  | 'metacritic'
  | 'wikipedia'
  | 'webSearch';

export interface BuildOpenWithUrlParams {
  serviceId: OpenWithServiceId;
  mediaType: 'movie' | 'tv';
  mediaId: number;
  title: string;
  year?: string | number | null;
  imdbId?: string | null;
  traktSlug?: string | null;
}

/** Stremio Web; the app's `stremio:///` links use the same paths (Stremio addon SDK deep links). */
const STREMIO_WEB_BASE = 'https://web.stremio.com/#/';

const normalizeQuery = (title: string, year?: string | number | null) => {
  const safeTitle = title.trim();
  const safeYear = year ? String(year).trim() : '';
  return safeYear ? `${safeTitle} ${safeYear}` : safeTitle;
};

export const buildOpenWithFallbackUrl = ({
  serviceId,
  mediaType,
  title,
  year,
}: Omit<BuildOpenWithUrlParams, 'mediaId' | 'imdbId' | 'traktSlug'>): string => {
  const query = encodeURIComponent(normalizeQuery(title, year));
  const traktType = mediaType === 'movie' ? 'movies' : 'shows';

  switch (serviceId) {
    case 'imdb':
      return `https://www.imdb.com/find/?q=${query}&s=tt`;
    case 'trakt':
      return `https://trakt.tv/search/${traktType}?query=${query}`;
    case 'stremio':
      return `${STREMIO_WEB_BASE}search?search=${encodeURIComponent(title.trim())}`;
    case 'tmdb':
      return `https://www.themoviedb.org/search/${mediaType}?query=${query}`;
    case 'letterboxd':
      return `https://letterboxd.com/search/${query}/`;
    case 'rottenTomatoes':
      return `https://www.rottentomatoes.com/search?search=${query}`;
    case 'metacritic':
      return `https://www.metacritic.com/search/${query}/`;
    case 'wikipedia':
      return `https://en.wikipedia.org/w/index.php?search=${query}`;
    case 'webSearch':
      return `https://www.google.com/search?q=${query}`;
    default:
      return `https://www.google.com/search?q=${query}`;
  }
};

export const buildOpenWithUrl = (params: BuildOpenWithUrlParams): string => {
  const { serviceId, mediaType, mediaId, imdbId, traktSlug } = params;
  const tmdbPath = mediaType === 'movie' ? 'movie' : 'tv';

  if (serviceId === 'imdb' && imdbId) {
    return `https://www.imdb.com/title/${imdbId}/`;
  }

  if (serviceId === 'trakt' && traktSlug) {
    const traktType = mediaType === 'movie' ? 'movies' : 'shows';
    return `https://trakt.tv/${traktType}/${traktSlug}`;
  }

  // Letterboxd redirects /tmdb/{id}/ to the film's page. It's film-only, so shows use its search.
  if (serviceId === 'letterboxd' && mediaType === 'movie') {
    return `https://letterboxd.com/tmdb/${mediaId}/`;
  }

  // Stremio's Cinemeta ids are IMDb ids. A movie opens its own page; a show opens its episodes.
  if (serviceId === 'stremio' && imdbId) {
    return mediaType === 'movie'
      ? `${STREMIO_WEB_BASE}detail/movie/${imdbId}/${imdbId}`
      : `${STREMIO_WEB_BASE}detail/series/${imdbId}`;
  }

  if (serviceId === 'tmdb') {
    return `https://www.themoviedb.org/${tmdbPath}/${mediaId}`;
  }

  return buildOpenWithFallbackUrl(params);
};

export const buildTraktAppUrlFromWeb = (webUrl: string): string | null => {
  const base = 'https://trakt.tv/';
  if (!webUrl.startsWith(base)) {
    return null;
  }

  return `trakt://${webUrl.slice(base.length)}`;
};

/** The Stremio app link for a Stremio Web link, e.g. `stremio:///detail/movie/tt0111161/tt0111161`. */
export const buildStremioAppUrlFromWeb = (webUrl: string): string | null => {
  if (!webUrl.startsWith(STREMIO_WEB_BASE)) {
    return null;
  }

  return `stremio:///${webUrl.slice(STREMIO_WEB_BASE.length)}`;
};
