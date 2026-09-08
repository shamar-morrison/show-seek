/**
 * Extracts a plain YouTube video ID (11 characters) from various input formats:
 * - Plain video ID (e.g., 'dQw4w9WgXcQ')
 * - Full watch URL (e.g., 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
 * - Short URL (e.g., 'https://youtu.be/dQw4w9WgXcQ')
 * - Embed URL (e.g., 'https://www.youtube.com/embed/dQw4w9WgXcQ')
 * - Shorts URL (e.g., 'https://www.youtube.com/shorts/dQw4w9WgXcQ')
 * - Mobile URL (e.g., 'https://m.youtube.com/watch?v=dQw4w9WgXcQ')
 *
 * Returns the 11-character video ID, or null if no valid ID could be resolved.
 */
export function extractYouTubeVideoId(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  // Check if the input is already a raw 11-character video ID
  const rawIdPattern = /^[a-zA-Z0-9_-]{11}$/;
  if (rawIdPattern.test(trimmed)) {
    return trimmed;
  }

  // Check if it's a URL or path containing a YouTube video ID
  const urlPattern =
    /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

  const match = trimmed.match(urlPattern);
  if (match && match[1]) {
    return match[1];
  }

  return null;
}
