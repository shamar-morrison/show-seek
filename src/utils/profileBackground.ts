import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';

/**
 * The image someone picked as their profile background: a movie or show's poster or backdrop,
 * stored as its TMDB path (nothing is uploaded). Shown behind their profile on the Account screen
 * and in the Home drawer, fading into the background.
 */
export interface ProfileBackground {
  /** TMDB image path, e.g. "/hZkgoQYus5vegHoetLkCJzb17zJ.jpg". */
  path: string;
  /** Posters are cropped from the top so the artwork shows rather than the title band. */
  kind: 'backdrop' | 'poster';
}

/** Same shape the Firestore rule accepts. */
const TMDB_IMAGE_PATH = /^\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/;

/** A saved value if it's valid, otherwise undefined (nothing set). */
export function sanitizeProfileBackground(value: unknown): ProfileBackground | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { path, kind } = value as Partial<ProfileBackground>;
  if (typeof path !== 'string' || !TMDB_IMAGE_PATH.test(path)) return undefined;
  if (kind !== 'backdrop' && kind !== 'poster') return undefined;
  return { path, kind };
}

/** Large enough to stay sharp across a phone-wide header. */
export function getProfileBackgroundUrl(background: ProfileBackground): string | null {
  return getImageUrl(
    background.path,
    background.kind === 'poster' ? TMDB_IMAGE_SIZES.poster.large : TMDB_IMAGE_SIZES.backdrop.large
  );
}
