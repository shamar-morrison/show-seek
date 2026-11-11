/**
 * MDBList ratings
 *
 * One request returns a title's scores from IMDb, Rotten Tomatoes, Metacritic, Letterboxd and
 * Trakt (among others). Called straight from the phone with the app's key, so every person shares
 * the account's daily limit (1,000 free, more for supporters): results are kept on the phone for
 * 7 days, and when a fetch fails (offline, MDBList down, limit reached) the ratings are hidden.
 *
 * https://docs.mdblist.com/docs/api
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const MDBLIST_API_KEY = process.env.EXPO_PUBLIC_MDBLIST_API_KEY;
const BASE_URL = 'https://api.mdblist.com';
// v2 added `links`; older entries are ignored and fetched again.
const CACHE_KEY_PREFIX = '@mdblist_ratings_v2_';
export const MDBLIST_CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/** Scores ready to show, one string per site, null when that site has none. */
export interface ExternalRatings {
  /** IMDb out of 10, e.g. "8.8". */
  imdb: string | null;
  /** Rotten Tomatoes critics, e.g. "93%". */
  rottenTomatoes: string | null;
  /** Metascore out of 100, e.g. "74". */
  metacritic: string | null;
  /** Letterboxd out of 5, e.g. "4.3". */
  letterboxd: string | null;
  /** Trakt, e.g. "85%". */
  trakt: string | null;
  imdbId: string | null;
  /** The title's own page on each site, when MDBList knows it (else the app searches the site). */
  links: {
    rottenTomatoes: string | null;
    metacritic: string | null;
    letterboxd: string | null;
  };
}

/** One entry of MDBList's `ratings` array. Only the fields read here. */
interface MdblistRating {
  source?: string;
  /** In the site's own scale (IMDb 0–10, Letterboxd 0–5, the rest 0–100). */
  value?: number | null;
  /** The same score on a 0–100 scale. */
  score?: number | null;
  votes?: number | null;
  /** The title's path on that site, e.g. "/m/fight_club" (IMDb's is a number, not a path). */
  url?: string | number | null;
}

interface MdblistMediaResponse {
  imdb_id?: string | null;
  ids?: { imdb?: string | null };
  ratings?: MdblistRating[];
}

interface CachedRatings {
  data: ExternalRatings;
  timestamp: number;
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * A score in the site's scale. Uses `value`, or `score` (0–100) converted when `value` is missing
 * or outside the expected range, so a change in MDBList's scale can't produce "87/10".
 */
function scoreIn(rating: MdblistRating | undefined, outOf: number): number | null {
  if (!rating) return null;
  const { value, score, votes } = rating;
  // MDBList fills sources it has no score for with 0 or null and no votes.
  const hasScore = (isNumber(value) && value > 0) || (isNumber(score) && score > 0) || !!votes;
  if (!hasScore) return null;
  if (isNumber(value) && value >= 0 && value <= outOf) return value;
  if (isNumber(score) && score >= 0 && score <= 100) return (score / 100) * outOf;
  return null;
}

/** A site page from MDBList's path, or null when there's no usable path. */
function pageUrl(rating: MdblistRating | undefined, base: string): string | null {
  const path = rating?.url;
  if (typeof path !== 'string' || !path.startsWith('/')) return null;
  return `${base}${path}`;
}

export function parseMdblistRatings(
  response: MdblistMediaResponse,
  mediaType: 'movie' | 'tv' = 'movie'
): ExternalRatings {
  const bySource = new Map<string, MdblistRating>();
  for (const rating of response.ratings ?? []) {
    if (rating?.source) bySource.set(rating.source.toLowerCase(), rating);
  }

  const imdb = scoreIn(bySource.get('imdb'), 10);
  const tomatoes = scoreIn(bySource.get('tomatoes'), 100);
  const metacritic = scoreIn(bySource.get('metacritic'), 100);
  const letterboxd = scoreIn(bySource.get('letterboxd'), 5);
  const trakt = scoreIn(bySource.get('trakt'), 100);
  const imdbId = response.ids?.imdb || response.imdb_id || null;

  return {
    imdb: imdb === null ? null : imdb.toFixed(1),
    rottenTomatoes: tomatoes === null ? null : `${Math.round(tomatoes)}%`,
    metacritic: metacritic === null ? null : String(Math.round(metacritic)),
    letterboxd: letterboxd === null ? null : letterboxd.toFixed(1),
    trakt: trakt === null ? null : `${Math.round(trakt)}%`,
    imdbId,
    links: {
      // Rotten Tomatoes paths include the section ("/m/…", "/tv/…"); Metacritic's don't.
      rottenTomatoes:
        tomatoes === null
          ? null
          : pageUrl(bySource.get('tomatoes'), 'https://www.rottentomatoes.com'),
      metacritic:
        metacritic === null
          ? null
          : pageUrl(
              bySource.get('metacritic'),
              `https://www.metacritic.com/${mediaType === 'tv' ? 'tv' : 'movie'}`
            ),
      letterboxd:
        letterboxd === null ? null : pageUrl(bySource.get('letterboxd'), 'https://letterboxd.com'),
    },
  };
}

export function hasValidRatings(ratings: ExternalRatings | null): boolean {
  if (!ratings) return false;
  return !!(
    ratings.imdb ||
    ratings.rottenTomatoes ||
    ratings.metacritic ||
    ratings.letterboxd ||
    ratings.trakt
  );
}

/**
 * A title's ratings by its TMDB ID: from the phone's cache when under 7 days old, otherwise from
 * MDBList. Null when there's no key, the request fails, or MDBList has nothing for it.
 */
export async function fetchExternalRatings(
  mediaType: 'movie' | 'tv',
  tmdbId: number
): Promise<ExternalRatings | null> {
  if (!MDBLIST_API_KEY) {
    console.warn('[MDBList] API key not configured');
    return null;
  }
  if (!tmdbId) return null;

  const mdblistType = mediaType === 'movie' ? 'movie' : 'show';
  const cacheKey = `${CACHE_KEY_PREFIX}${mdblistType}_${tmdbId}`;

  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const { data, timestamp }: CachedRatings = JSON.parse(cached);
      if (Date.now() - timestamp <= MDBLIST_CACHE_DURATION_MS) return data;
    }
  } catch (error) {
    console.error('[MDBList] Cache read error:', error);
  }

  try {
    const response = await fetch(
      `${BASE_URL}/tmdb/${mdblistType}/${tmdbId}?apikey=${encodeURIComponent(MDBLIST_API_KEY)}`
    );
    if (!response.ok) {
      // 404 when MDBList doesn't know the title, 429 once the daily limit is reached.
      console.warn(`[MDBList] HTTP error: ${response.status}`);
      return null;
    }

    const ratings = parseMdblistRatings((await response.json()) as MdblistMediaResponse, mediaType);

    try {
      await AsyncStorage.setItem(
        cacheKey,
        JSON.stringify({ data: ratings, timestamp: Date.now() } satisfies CachedRatings)
      );
    } catch (error) {
      console.error('[MDBList] Cache write error:', error);
    }

    return ratings;
  } catch (error) {
    console.error('[MDBList] Fetch error:', error);
    return null;
  }
}
