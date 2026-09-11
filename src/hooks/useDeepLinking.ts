import * as Linking from 'expo-linking';

/**
 * Pure URL-to-route resolver for app deep links. Returns the href to navigate
 * to, or null when the URL carries no in-app destination.
 *
 * Custom-scheme URLs (showseek://library/...) land their first section in
 * `hostname` rather than `path`, so the hostname is folded back into the
 * segments for non-http(s) schemes. Web URLs keep hostname separate.
 */
export function resolveDeepLinkTarget(url: string): string | null {
  const parsed = Linking.parse(url);

  const rawSegments = (parsed.path || '').split('/').filter(Boolean);
  const segments = [
    ...(parsed.hostname && parsed.scheme !== 'http' && parsed.scheme !== 'https'
      ? [parsed.hostname]
      : []),
    ...rawSegments,
  ];

  if (segments.length < 1) {
    console.warn('[DeepLink] Invalid deep link format:', url);
    return null;
  }

  const [first, second, third] = segments;

  // showseek://home (sent by the home-screen widgets)
  if (first === 'home') {
    return '/(tabs)/home';
  }

  // showseek://library (fallback when a widget has no list bound)
  if (first === 'library' && segments.length === 1) {
    return '/(tabs)/library';
  }

  // showseek://library/custom-list/<id> (sent by the watchlist widget)
  if (first === 'library' && second === 'custom-list' && third) {
    return `/(tabs)/library/custom-list/${third}`;
  }

  if (segments.length < 2) {
    console.warn('[DeepLink] Invalid deep link format:', url);
    return null;
  }

  const mediaType = segments[0]; // 'movie' or 'tv'
  const mediaId = segments[1]; // the ID

  if (mediaType !== 'movie' && mediaType !== 'tv') {
    console.warn('[DeepLink] Invalid media type in deep link:', mediaType);
    return null;
  }

  return `/(tabs)/home/${mediaType}/${mediaId}`;
}

/**
 * Maps a widget tap target captured from the launch/new intent
 * (see MainActivity.pendingWidgetTarget) to an in-app route.
 * Format: "watchlist:<listId>" | "upcoming_movies" | "upcoming_tv".
 */
export function resolveWidgetTarget(target: string): string | null {
  const separator = target.indexOf(':');
  const kind = separator === -1 ? target : target.slice(0, separator);
  const listId = separator === -1 ? '' : target.slice(separator + 1);

  if (kind === 'upcoming_movies' || kind === 'upcoming_tv') {
    return '/(tabs)/home';
  }
  if (kind === 'watchlist') {
    return listId ? `/(tabs)/library/custom-list/${listId}` : '/(tabs)/library';
  }

  console.warn('[DeepLink] Unknown widget target:', target);
  return null;
}
