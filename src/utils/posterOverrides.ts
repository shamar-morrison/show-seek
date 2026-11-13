export type PosterOverrideMediaType = 'movie' | 'tv';

const POSTER_OVERRIDE_KEY_PATTERN = /^(movie|tv)_\d+$/;
export const POSTER_OVERRIDE_MAX_ENTRIES = 1000;

export function buildPosterOverrideKey(mediaType: PosterOverrideMediaType, mediaId: number): string {
  return `${mediaType}_${mediaId}`;
}

export function sanitizePosterOverrides(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const entries = Object.entries(raw as Record<string, unknown>);
  const sanitized: Record<string, string> = {};

  for (const [key, value] of entries) {
    if (!POSTER_OVERRIDE_KEY_PATTERN.test(key)) {
      continue;
    }
    if (typeof value !== 'string' || value.length === 0) {
      continue;
    }
    if (!value.startsWith('/')) {
      continue;
    }
    sanitized[key] = value;
  }

  return sanitized;
}

/**
 * The poster to show: the user's chosen poster for a movie or show, else `fallbackPosterPath`.
 * Seasons and episodes have no poster override (and must never pick up their show's), so they
 * always use their own saved poster.
 */
export function resolvePosterPath(
  overrides: Record<string, string> | null | undefined,
  mediaType: PosterOverrideMediaType | 'season' | 'episode',
  mediaId: number,
  fallbackPosterPath: string | null | undefined
): string | null {
  if (mediaType === 'season' || mediaType === 'episode') {
    return fallbackPosterPath ?? null;
  }
  const key = buildPosterOverrideKey(mediaType, mediaId);
  const overridePosterPath = overrides?.[key];

  if (typeof overridePosterPath === 'string' && overridePosterPath.length > 0) {
    return overridePosterPath;
  }

  return fallbackPosterPath ?? null;
}
