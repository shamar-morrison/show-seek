import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { ShareCardData, ShareCardFormat, ShareCardIdentity } from './shareCardTypes';

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
}

export function resolveShareCardImages(
  data: ShareCardData,
  format: ShareCardFormat
): ShareCardImages {
  if (data.kind === 'list') {
    const urls = data.posterPaths
      .map((path) => getImageUrl(path, TMDB_IMAGE_SIZES.poster.large))
      .filter((url): url is string => !!url);

    return {
      backgroundUrl: urls[0] ?? null,
      foregroundUrl: urls.length === 1 ? urls[0] : null,
      foregroundIsPosterFallback: false,
      fanUrls: urls.length > 1 ? urls : [],
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
      };
    case 'square':
      return {
        backgroundUrl: backdrop ?? poster,
        foregroundUrl: backdrop ?? poster,
        foregroundIsPosterFallback: !backdrop && !!poster,
        fanUrls: [],
      };
    case 'landscape':
      return {
        backgroundUrl: backdrop ?? poster,
        foregroundUrl: poster,
        foregroundIsPosterFallback: false,
        fanUrls: [],
      };
  }
}

/** Every image a card has to finish loading before it is safe to capture. */
export function getShareCardImageKeys(
  data: ShareCardData,
  format: ShareCardFormat,
  identity: ShareCardIdentity | null
): string[] {
  const { backgroundUrl, foregroundUrl, fanUrls } = resolveShareCardImages(data, format);

  return [
    ...new Set(
      [SHARE_CARD_LOGO_KEY, backgroundUrl, foregroundUrl, ...fanUrls, identity?.photoUrl].filter(
        (key): key is string => !!key
      )
    ),
  ];
}
