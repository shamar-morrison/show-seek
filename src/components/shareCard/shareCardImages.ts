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
}

export function resolveShareCardImages(
  data: ShareCardData,
  format: ShareCardFormat
): ShareCardImages {
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
      };
    case 'square':
      return {
        backgroundUrl: backdrop ?? poster,
        foregroundUrl: backdrop ?? poster,
        foregroundIsPosterFallback: !backdrop && !!poster,
      };
    case 'landscape':
      return {
        backgroundUrl: backdrop ?? poster,
        foregroundUrl: poster,
        foregroundIsPosterFallback: false,
      };
  }
}

/** Every image a card has to finish loading before it is safe to capture. */
export function getShareCardImageKeys(
  data: ShareCardData,
  format: ShareCardFormat,
  identity: ShareCardIdentity | null
): string[] {
  const { backgroundUrl, foregroundUrl } = resolveShareCardImages(data, format);

  return [
    ...new Set(
      [SHARE_CARD_LOGO_KEY, backgroundUrl, foregroundUrl, identity?.photoUrl].filter(
        (key): key is string => !!key
      )
    ),
  ];
}
