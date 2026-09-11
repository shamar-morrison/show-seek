/**
 * expo-router native-intent hook (special file, not a route).
 *
 * Rewrites incoming system URLs into canonical in-app paths BEFORE
 * expo-router resolves its initial navigation state. Widget taps arrive as
 * custom-scheme URLs (showseek://library/custom-list/<id>) whose first
 * section the link parser drops into `hostname`, which state resolution
 * chokes on during cold start and leaves a blank screen. Plain paths always
 * resolve, so normalize here and let both cold and warm taps land correctly.
 *
 * Must never throw (per expo-router docs, a throw here can crash the app).
 */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    return normalizeWidgetPath(path);
  } catch {
    return path;
  }
}

function normalizeWidgetPath(path: string): string {
  let rest = path;
  // 'custom' = custom scheme (host section is part of the route),
  // 'web' = http(s) (first section is a domain, drop it),
  // 'plain' = already a path, keep everything.
  let kind: 'custom' | 'web' | 'plain' = 'plain';

  const schemeMatch = rest.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//);
  if (schemeMatch) {
    kind = schemeMatch[1].toLowerCase().startsWith('http') ? 'web' : 'custom';
    rest = rest.slice(schemeMatch[0].length);
  }

  const segments = rest
    .split('?')[0]
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  if (kind === 'web' && segments.length > 0) {
    segments.shift();
  }

  const [first, second, third] = segments;

  if (first === 'home' && segments.length === 1) {
    return '/home';
  }
  if (first === 'library' && segments.length === 1) {
    return '/library';
  }
  if (first === 'library' && second === 'custom-list' && third) {
    return `/library/custom-list/${third}`;
  }
  if ((first === 'movie' || first === 'tv') && second) {
    return `/home/${first}/${second}`;
  }

  return path;
}
