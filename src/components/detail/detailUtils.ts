import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';

/**
 * Process review author avatar URL
 * Handles special case where avatar_path contains embedded URL
 */
export function getAvatarUrl(avatarPath: string | null): string | null {
  if (!avatarPath) return null;

  // Handle embedded URLs (starts with /https://)
  if (avatarPath.startsWith('/https://')) {
    return avatarPath.substring(1);
  }

  // Handle TMDB paths
  return getImageUrl(avatarPath, TMDB_IMAGE_SIZES.profile.small);
}

/**
 * Get the display title for similar media items
 * Handles both movie (title) and TV show (name) properties
 */
export function getMediaTitle(item: { title?: string; name?: string }): string {
  return item.title || item.name || 'Unknown';
}

/**
 * Get the release year from a date string
 */
export function getMediaYear(dateString: string | undefined): number | null {
  if (!dateString) return null;
  return new Date(dateString).getFullYear();
}
