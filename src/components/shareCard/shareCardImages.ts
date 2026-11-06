import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import {
  ShareCardData,
  ShareCardFormat,
  ShareCardIdentity,
  ShareCardStyle,
} from './shareCardTypes';

/** Tracking key for the bundled logo, which has no URL of its own. */
export const SHARE_CARD_LOGO_KEY = 'share-card-logo';

export interface ShareCardImages {
  /** Blurred behind everything else. */
  backgroundUrl: string | null;
  /** Sharp image with rounded corners. */
  foregroundUrl: string | null;
  /** True when a format that wants a backdrop has to use the poster instead. */
  foregroundIsPosterFallback: boolean;
  /** Several overlapping posters, shown in place of the foreground image. */
  fanUrls: string[];
  /** Sharp, full-width art behind the cinematic style. It replaces the other images. */
  heroUrl: string | null;
}

/** Portrait stretches its art across the card, so it needs more detail than a framed poster. */
function resolveHeroUrl(data: ShareCardData, format: ShareCardFormat): string | null {
  if (data.kind === 'list') {
    return getImageUrl(data.posterPaths[0] ?? null, TMDB_IMAGE_SIZES.poster.original);
  }

  const poster = getImageUrl(data.posterPath, TMDB_IMAGE_SIZES.poster.original);
  const backdrop = getImageUrl(
    (data.kind === 'episode' ? data.stillPath : null) ?? data.backdropPath,
    TMDB_IMAGE_SIZES.backdrop.original
  );

  return format === 'portrait' ? (poster ?? backdrop) : (backdrop ?? poster);
}

export function resolveShareCardImages(
  data: ShareCardData,
  format: ShareCardFormat,
  style: ShareCardStyle = 'classic'
): ShareCardImages {
  if (style === 'cinematic') {
    return {
      backgroundUrl: null,
      foregroundUrl: null,
      foregroundIsPosterFallback: false,
      fanUrls: [],
      heroUrl: resolveHeroUrl(data, format),
    };
  }

  if (data.kind === 'list') {
    const urls = data.posterPaths
      .map((path) => getImageUrl(path, TMDB_IMAGE_SIZES.poster.large))
      .filter((url): url is string => !!url);

    return {
      backgroundUrl: urls[0] ?? null,
      foregroundUrl: urls.length === 1 ? urls[0] : null,
      foregroundIsPosterFallback: false,
      fanUrls: urls.length > 1 ? urls : [],
      heroUrl: null,
    };
  }

  const poster = getImageUrl(data.posterPath, TMDB_IMAGE_SIZES.poster.large);
  // An episode's own still suits its card better than the show's backdrop.
  const backdrop = getImageUrl(
    (data.kind === 'episode' ? data.stillPath : null) ?? data.backdropPath,
    TMDB_IMAGE_SIZES.backdrop.large
  );

  switch (format) {
    case 'portrait':
      return {
        backgroundUrl: poster ?? backdrop,
        foregroundUrl: poster,
        foregroundIsPosterFallback: false,
        fanUrls: [],
        heroUrl: null,
      };
    case 'square':
      return {
        backgroundUrl: backdrop ?? poster,
        foregroundUrl: backdrop ?? poster,
        foregroundIsPosterFallback: !backdrop && !!poster,
        fanUrls: [],
        heroUrl: null,
      };
    case 'landscape':
      return {
        backgroundUrl: backdrop ?? poster,
        foregroundUrl: poster,
        foregroundIsPosterFallback: false,
        fanUrls: [],
        heroUrl: null,
      };
  }
}

/** Every image a card has to finish loading before it is safe to capture. */
export function getShareCardImageKeys(
  data: ShareCardData,
  format: ShareCardFormat,
  identity: ShareCardIdentity | null,
  style: ShareCardStyle = 'classic'
): string[] {
  const { backgroundUrl, foregroundUrl, fanUrls, heroUrl } = resolveShareCardImages(
    data,
    format,
    style
  );

  return [
    ...new Set(
      [
        SHARE_CARD_LOGO_KEY,
        backgroundUrl,
        foregroundUrl,
        heroUrl,
        ...fanUrls,
        identity?.photoUrl,
      ].filter((key): key is string => !!key)
    ),
  ];
}
