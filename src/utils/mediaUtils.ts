import { MovieDetails, TVShowDetails } from '@/src/api/tmdb';

/**
 * Utility functions for media-related operations
 */

/**
 * Check if watch providers data contains any available providers
 * (streaming, rent, or buy options)
 */
export const hasWatchProviders = (providers: any): boolean => {
  if (!providers) return false;
  return (
    (providers.flatrate && providers.flatrate.length > 0) ||
    (providers.rent && providers.rent.length > 0) ||
    (providers.buy && providers.buy.length > 0)
  );
};

/**
 * Get the release date for a specific region, with fallbacks.
 * Prioritizes:
 * 1. Selected region's theatrical release (Type 3)
 * 2. Selected region's digital release (Type 4)
 * 3. Selected region's first available release
 * 4. US release (as a common fallback)
 * 5. The global release_date property
 */
export const getRegionalReleaseDate = (
  movie: MovieDetails | null,
  regionCode: string
): string | null => {
  if (!movie) return null;

  // If we have detailed release dates
  if (movie.release_dates?.results?.length > 0) {
    const getReleaseForRegion = (code: string) => {
      const regionData = movie.release_dates.results.find((r) => r.iso_3166_1 === code);
      if (regionData?.release_dates?.length > 0) {
        // Try to find theatrical (3) or digital (4)
        return (
          regionData.release_dates.find((d) => d.type === 3) ||
          regionData.release_dates.find((d) => d.type === 4) ||
          regionData.release_dates[0]
        );
      }
      return null;
    };

    // 1. Try selected region
    const regionalRelease = getReleaseForRegion(regionCode);
    if (regionalRelease?.release_date) {
      return regionalRelease.release_date.split('T')[0]; // Ensure YYYY-MM-DD
    }

    // 2. Try US as fallback if region is not US
    if (regionCode !== 'US') {
      const usRelease = getReleaseForRegion('US');
      if (usRelease?.release_date) {
        return usRelease.release_date.split('T')[0];
      }
    }
  }

  // 3. Fallback to global release date
  return movie.release_date || null;
};

/**
 * Get the certification (content rating) for a specific region.
 */
export const getRegionalCertification = (
  media: MovieDetails | TVShowDetails,
  type: 'movie' | 'tv',
  regionCode: string
): string => {
  const isMovie = type === 'movie';
  const movie = isMovie ? (media as MovieDetails) : null;
  const show = !isMovie ? (media as TVShowDetails) : null;

  if (isMovie && movie?.release_dates) {
    const getCertForRegion = (code: string) => {
      const regionData = movie.release_dates.results.find((r) => r.iso_3166_1 === code);
      if (regionData?.release_dates) {
        // Find first entry with a non-empty certification
        // Prioritize theatrical (3) if available
        const theatrical = regionData.release_dates.find((d) => d.type === 3 && d.certification);
        if (theatrical) return theatrical.certification;
        
        const anyCert = regionData.release_dates.find((d) => d.certification);
        return anyCert?.certification;
      }
      return null;
    };

    const regionalCert = getCertForRegion(regionCode);
    if (regionalCert) return regionalCert;

    // Fallback to US if different
    if (regionCode !== 'US') {
      const usCert = getCertForRegion('US');
      if (usCert) return usCert;
    }
  } else if (!isMovie && show?.content_ratings) {
    const getCertForRegion = (code: string) => {
      const regionData = show.content_ratings.results.find((r) => r.iso_3166_1 === code);
      return regionData?.rating || null;
    };

    const regionalCert = getCertForRegion(regionCode);
    if (regionalCert) return regionalCert;

    if (regionCode !== 'US') {
      const usCert = getCertForRegion('US');
      if (usCert) return usCert;
    }
  }

  return 'N/A';
};
