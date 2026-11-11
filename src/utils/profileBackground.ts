import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import type { ImageContentPosition } from 'expo-image';

/**
 * The image someone picked as their profile background: a movie or show's poster or backdrop,
 * stored as its TMDB path (nothing is uploaded). Shown behind their profile on the Account screen
 * and in the Home drawer, fading into the background.
 */
export interface ProfileBackground {
  /** TMDB image path, e.g. "/hZkgoQYus5vegHoetLkCJzb17zJ.jpg". */
  path: string;
  /** Posters are cropped from the top by default so the artwork shows rather than the title. */
  kind: 'backdrop' | 'poster';
  /**
   * The part of the image to keep in view, chosen by dragging: 0–1 across and down, like CSS
   * `object-position` percentages (0 = left/top edge, 1 = right/bottom). Unset = the default.
   */
  focus?: ProfileBackgroundFocus;
}

export interface ProfileBackgroundFocus {
  x: number;
  y: number;
}

/** Backdrops centred; posters from the top, where the artwork usually is. */
export function getDefaultFocus(kind: ProfileBackground['kind']): ProfileBackgroundFocus {
  return kind === 'poster' ? { x: 0.5, y: 0 } : { x: 0.5, y: 0.5 };
}

export function getProfileBackgroundFocus(background: ProfileBackground): ProfileBackgroundFocus {
  return background.focus ?? getDefaultFocus(background.kind);
}

/** expo-image's `contentPosition` for the chosen part, so every frame shape keeps it in view. */
export function getProfileBackgroundPosition(background: ProfileBackground): ImageContentPosition {
  const { x, y } = getProfileBackgroundFocus(background);
  return { left: `${x * 100}%`, top: `${y * 100}%` };
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** How an image of `image` size covers a `frame`: its drawn size and how far it overflows. */
export function getCoverGeometry(
  image: { width: number; height: number },
  frame: { width: number; height: number }
) {
  const scale = Math.max(frame.width / image.width, frame.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    width,
    height,
    overflowX: Math.max(0, width - frame.width),
    overflowY: Math.max(0, height - frame.height),
  };
}

/**
 * The focus after dragging the image by (dx, dy) from `start`: dragging right shows more of the
 * left, so x goes down. An axis with no overflow can't move.
 */
export function dragFocus(
  start: ProfileBackgroundFocus,
  dx: number,
  dy: number,
  geometry: { overflowX: number; overflowY: number }
): ProfileBackgroundFocus {
  return {
    x: geometry.overflowX > 0 ? clamp01(start.x - dx / geometry.overflowX) : start.x,
    y: geometry.overflowY > 0 ? clamp01(start.y - dy / geometry.overflowY) : start.y,
  };
}

/** Same shape the Firestore rule accepts. */
const TMDB_IMAGE_PATH = /^\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/;

/** A saved value if it's valid, otherwise undefined (nothing set). */
export function sanitizeProfileBackground(value: unknown): ProfileBackground | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { path, kind } = value as Partial<ProfileBackground>;
  if (typeof path !== 'string' || !TMDB_IMAGE_PATH.test(path)) return undefined;
  if (kind !== 'backdrop' && kind !== 'poster') return undefined;
  const { focus } = value as { focus?: unknown };
  const validFocus =
    focus &&
    typeof focus === 'object' &&
    [(focus as ProfileBackgroundFocus).x, (focus as ProfileBackgroundFocus).y].every(
      (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1
    )
      ? { x: (focus as ProfileBackgroundFocus).x, y: (focus as ProfileBackgroundFocus).y }
      : undefined;
  return validFocus ? { path, kind, focus: validFocus } : { path, kind };
}

/** Large enough to stay sharp across a phone-wide header. */
export function getProfileBackgroundUrl(background: ProfileBackground): string | null {
  return getImageUrl(
    background.path,
    background.kind === 'poster' ? TMDB_IMAGE_SIZES.poster.large : TMDB_IMAGE_SIZES.backdrop.large
  );
}
