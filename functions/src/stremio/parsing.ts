import { STREMIO_TOKEN_PATTERN } from './constants';

interface PlayerEventBase {
  action: 'start' | 'pause' | 'stop';
  type: 'movie' | 'series';
  currentTime: number;
  duration: number;
}

// Cinemeta IDs carry an IMDb season and episode. Anime Kitsu IDs carry only an episode
// number within that Kitsu entry, which is mapped to TMDB separately.
export type PlayerEvent = PlayerEventBase & (
  | { imdbId: string; kitsuId?: undefined; season?: number; episode?: number }
  | { kitsuId: number; imdbId?: undefined; season?: undefined; episode?: number }
);

export type AddonRoute =
  | { kind: 'manifest'; token: string }
  | { kind: 'player'; token: string; event: PlayerEvent | null }
  | { kind: 'bad_token' }
  | { kind: 'not_found' };

const parseInteger = (value: string | null): number | null => {
  if (value === null || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
};

export function parsePlayerEvent(type: string, encodedId: string, extraArgs: string): PlayerEvent | null {
  if (type !== 'movie' && type !== 'series') return null;

  try {
    // Split the path before decoding, and never decode an ID more than once.
    const videoId = decodeURIComponent(encodedId);
    const match = type === 'movie'
      ? /^(tt\d+)$/.exec(videoId)
      : /^(tt\d+):(\d+):(\d+)$/.exec(videoId);
    const kitsuMatch = type === 'movie'
      ? /^kitsu:(\d+)$/.exec(videoId)
      : /^kitsu:(\d+):(\d+)$/.exec(videoId);
    if (!match && !kitsuMatch) return null;

    // Extras are a path segment containing query-string syntax, not req.query.
    if (/%(?![a-f\d]{2})/i.test(extraArgs)) return null;
    const extras = new URLSearchParams(extraArgs);
    if (['action', 'currentTime', 'duration'].some((key) => extras.getAll(key).length !== 1)) {
      return null;
    }
    const action = extras.get('action');
    if (action !== 'start' && action !== 'pause' && action !== 'stop') return null;
    const currentTime = parseInteger(extras.get('currentTime'));
    const duration = parseInteger(extras.get('duration'));
    if (currentTime === null || duration === null) return null;

    if (kitsuMatch) {
      const kitsuId = parseInteger(kitsuMatch[1]);
      if (kitsuId === null || kitsuId === 0) return null;
      if (type === 'movie') return { action, type, kitsuId, currentTime, duration };
      const episode = parseInteger(kitsuMatch[2]);
      if (episode === null || episode === 0) return null;
      return { action, type, kitsuId, episode, currentTime, duration };
    }
    if (!match) return null;

    if (type === 'series') {
      const season = parseInteger(match[2]);
      const episode = parseInteger(match[3]);
      if (season === null || episode === null || episode === 0) return null;
      return { action, type, imdbId: match[1], season, episode, currentTime, duration };
    }
    return { action, type, imdbId: match[1], currentTime, duration };
  } catch {
    return null;
  }
}

export function parseAddonRoute(path: string): AddonRoute {
  if (path.length > 4096) return { kind: 'not_found' };
  const segments = path.split('/');
  if (segments[0] !== '' || !segments[1]) return { kind: 'not_found' };
  if (!STREMIO_TOKEN_PATTERN.test(segments[1])) return { kind: 'bad_token' };
  const token = segments[1];

  if (segments.length === 3 && segments[2] === 'manifest.json') {
    return { kind: 'manifest', token };
  }
  if (segments.length === 6 && segments[2] === 'player' && segments[5].endsWith('.json')) {
    if (segments[3].length > 16 || segments[4].length > 256 || segments[5].length > 2048) {
      return { kind: 'player', token, event: null };
    }
    return {
      kind: 'player',
      token,
      event: parsePlayerEvent(segments[3], segments[4], segments[5].slice(0, -5)),
    };
  }
  return { kind: 'not_found' };
}
