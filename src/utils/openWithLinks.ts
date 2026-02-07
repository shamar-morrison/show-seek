export type OpenWithServiceId =
  | 'imdb'
  | 'trakt'
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
