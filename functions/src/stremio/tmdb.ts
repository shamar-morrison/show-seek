import { loadAnimeIndex, type AnimeMapping } from './animeLists';
import {
  ANIME_KITSU_META_URL,
  ANIME_LIST_URL,
  CINEMETA_META_URL,
  STREMIO_TMDB_CACHE_MAX_SIZE,
  STREMIO_TMDB_CACHE_TTL_MS,
  TMDB_MAX_RETRIES,
  TMDB_REQUEST_TIMEOUT_MS,
  TMDB_TOTAL_BUDGET_MS,
} from './constants';
import type { PlayerEvent } from './parsing';

interface MediaDetails {
  id: number;
  poster_path: string | null;
  vote_average: number;
  genres: { id: number }[];
}

export interface MovieDetails extends MediaDetails {
  title: string;
  release_date: string;
  runtime: number | null;
}

export interface ShowDetails extends MediaDetails {
  name: string;
  first_air_date: string;
}

export interface EpisodeDetails {
  id: number;
  season_number: number;
  episode_number: number;
  name: string;
  air_date: string | null;
  runtime: number | null;
}

export type MappedTitle =
  | { kind: 'movie'; movie: MovieDetails }
  | { kind: 'episode'; show: ShowDetails; episode: EpisodeDetails };

export type UnmappedTitle = {
  kind: 'unmapped';
  reason: 'continuous_numbering_unsupported' | 'kitsu_mapping_missing' | 'kitsu_mapping_ambiguous';
};

const titleCache = new Map<string, { title: MappedTitle; expiresAt: number }>();

export const clearStremioTmdbCache = (): void => titleCache.clear();

function cacheMappedTitle(key: string, title: MappedTitle): MappedTitle {
  const now = Date.now();
  for (const [cacheKey, entry] of titleCache) {
    if (entry.expiresAt <= now) titleCache.delete(cacheKey);
  }
  titleCache.delete(key);
  if (titleCache.size >= STREMIO_TMDB_CACHE_MAX_SIZE) {
    const oldest = titleCache.keys().next().value;
    if (oldest !== undefined) titleCache.delete(oldest);
  }
  // Neither the initial result nor a later cache hit exposes the stored object.
  titleCache.set(key, { title: structuredClone(title), expiresAt: now + STREMIO_TMDB_CACHE_TTL_MS });
  return title;
}

export class StremioTmdbError extends Error {
  constructor(readonly reason: string, readonly statusCode?: number) {
    // Keep messages categorical: never expose API keys or URLs via error logging.
    super(reason);
    this.name = 'StremioTmdbError';
  }
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
const positiveId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const positiveRuntime = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
const nonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

// TMDB's Animation genre. Paired with a Japanese origin, this marks titles whose Cinemeta
// seasons often split or merge differently from TMDB's.
const ANIMATION_GENRE_ID = 16;

/** Parsed JSON, or null for a 404. */
async function requestJson(url: string, deadline: number): Promise<unknown> {
  for (let attempt = 0; attempt <= TMDB_MAX_RETRIES; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new StremioTmdbError('budget_exhausted');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(TMDB_REQUEST_TIMEOUT_MS, remaining));
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (response.status === 404) return null;
      if (response.status === 429 && attempt < TMDB_MAX_RETRIES) {
        const retryAfter = Number(response.headers.get('retry-after') ?? 0);
        const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt;
        if (delay >= deadline - Date.now()) throw new StremioTmdbError('budget_exhausted', 429);
        clearTimeout(timeout);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      if (!response.ok) throw new StremioTmdbError('http_error', response.status);
      const data: unknown = await response.json();
      if (Date.now() >= deadline) throw new StremioTmdbError('budget_exhausted');
      return data;
    } catch (error) {
      if (error instanceof StremioTmdbError) throw error;
      throw new StremioTmdbError(controller.signal.aborted ? 'timeout' : 'request_failed');
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new StremioTmdbError('retry_exhausted');
}

type Tmdb = (path: string) => Promise<Record<string, unknown> | null>;

interface ShowResult {
  show: ShowDetails;
  isAnime: boolean;
  seasons: { number: number; episodeCount: number }[];
}

function mediaDetails(data: Record<string, unknown>, id: number): MediaDetails | null {
  if (data.id !== id) return null;
  return {
    id,
    poster_path: typeof data.poster_path === 'string' ? data.poster_path : null,
    vote_average: typeof data.vote_average === 'number' && Number.isFinite(data.vote_average) ? data.vote_average : 0,
    genres: Array.isArray(data.genres)
      ? data.genres.flatMap((genre) => positiveId(record(genre)?.id) ? [{ id: (genre as { id: number }).id }] : [])
      : [],
  };
}

function episodeDetails(value: unknown): EpisodeDetails | null {
  const episode = record(value);
  if (!episode || !positiveId(episode.id) || typeof episode.name !== 'string') return null;
  if (!nonNegative(episode.season_number) || !positiveId(episode.episode_number)) return null;
  return {
    id: episode.id,
    season_number: episode.season_number,
    episode_number: episode.episode_number,
    name: episode.name,
    air_date: typeof episode.air_date === 'string' ? episode.air_date : null,
    runtime: positiveRuntime(episode.runtime),
  };
}

async function fetchMovie(id: number, tmdb: Tmdb): Promise<MappedTitle | null> {
  const movie = await tmdb(`/movie/${id}`);
  const details = movie && mediaDetails(movie, id);
  if (!movie || !details || typeof movie.title !== 'string' || !movie.title) return null;
  return {
    kind: 'movie',
    movie: {
      ...details,
      title: movie.title,
      release_date: typeof movie.release_date === 'string' ? movie.release_date : '',
      runtime: positiveRuntime(movie.runtime),
    },
  };
}

async function fetchShow(id: number, tmdb: Tmdb): Promise<ShowResult | null> {
  const show = await tmdb(`/tv/${id}`);
  const details = show && mediaDetails(show, id);
  if (!show || !details || typeof show.name !== 'string' || !show.name) return null;
  const japanese = (Array.isArray(show.origin_country) && show.origin_country.includes('JP'))
    || show.original_language === 'ja';
  return {
    show: { ...details, name: show.name, first_air_date: typeof show.first_air_date === 'string' ? show.first_air_date : '' },
    isAnime: japanese && details.genres.some((genre) => genre.id === ANIMATION_GENRE_ID),
    seasons: Array.isArray(show.seasons)
      ? show.seasons.flatMap((value) => {
        const season = record(value);
        return season && nonNegative(season.season_number) && nonNegative(season.episode_count)
          ? [{ number: season.season_number, episodeCount: season.episode_count }] : [];
      }).sort((a, b) => a.number - b.number)
      : [],
  };
}

/** A season's episodes in order, or null when any entry is malformed (positions would shift). */
async function fetchSeasonEpisodes(showId: number, seasonNumber: number, tmdb: Tmdb): Promise<EpisodeDetails[] | null> {
  const season = await tmdb(`/tv/${showId}/season/${seasonNumber}`);
  if (!season || season.season_number !== seasonNumber || !Array.isArray(season.episodes)) return null;
  const episodes = season.episodes.map(episodeDetails);
  if (episodes.some((episode) => !episode || episode.season_number !== seasonNumber)) return null;
  return (episodes as EpisodeDetails[]).sort((a, b) => a.episode_number - b.episode_number);
}

/** Matches a Cinemeta season and episode against the same TMDB season and episode numbers. */
async function resolveSameNumbering(
  show: ShowResult,
  season: number,
  episode: number,
  tmdb: Tmdb
): Promise<MappedTitle | UnmappedTitle | null> {
  const episodes = await fetchSeasonEpisodes(show.show.id, season, tmdb);
  if (!episodes) return null;
  // Mirrors the app's isContinuousNumbering signal. Incoming Cinemeta numbers are per-season,
  // so a TMDB season numbered from N > 1 cannot be matched safely, even when a number coincides.
  if (episodes.length > 0 && episodes[0].episode_number > 1) {
    return { kind: 'unmapped', reason: 'continuous_numbering_unsupported' };
  }
  const matches = episodes.filter((value) => value.episode_number === episode);
  return matches.length === 1 ? { kind: 'episode', show: show.show, episode: matches[0] } : null;
}

/**
 * Finds the TMDB episode through the TVDB or IMDb ID Cinemeta lists for that episode. This
 * holds when Cinemeta and TMDB group episodes into different seasons (One Piece S2E1 is
 * TMDB S1E9) or when TMDB has no show for the IMDb ID (Bleach: Thousand-Year Blood War S4E1
 * is TMDB Bleach S2E41).
 */
async function resolveByEpisodeIds(
  imdbId: string,
  season: number,
  episode: number,
  known: ShowResult | null,
  tmdb: Tmdb,
  deadline: number
): Promise<MappedTitle | null> {
  const meta = record(await requestJson(`${CINEMETA_META_URL}/series/${encodeURIComponent(imdbId)}.json`, deadline));
  const videos = record(meta?.meta)?.videos;
  if (!Array.isArray(videos)) return null;
  const matches = videos.flatMap((value) => {
    const video = record(value);
    return video?.season === season && video.episode === episode ? [video] : [];
  });
  if (matches.length !== 1) return null;
  const video = matches[0];
  const lookups = [
    positiveId(video.tvdb_id) ? `/find/${video.tvdb_id}?external_source=tvdb_id` : null,
    typeof video.imdb_id === 'string' && /^tt\d+$/.test(video.imdb_id)
      ? `/find/${video.imdb_id}?external_source=imdb_id` : null,
  ];
  for (const path of lookups) {
    if (!path) continue;
    const results = (await tmdb(path))?.tv_episode_results;
    if (!Array.isArray(results) || results.length !== 1) continue;
    const showId = record(results[0])?.show_id;
    const found = episodeDetails(results[0]);
    if (!positiveId(showId) || !found) continue;
    const show = known?.show.id === showId ? known : await fetchShow(showId, tmdb);
    return show ? { kind: 'episode', show: show.show, episode: found } : null;
  }
  return null;
}

async function resolveImdb(event: PlayerEvent & { imdbId: string }, tmdb: Tmdb, deadline: number) {
  const found = await tmdb(`/find/${encodeURIComponent(event.imdbId)}?external_source=imdb_id`);
  const results = found?.[event.type === 'movie' ? 'movie_results' : 'tv_results'];
  // Ambiguous or wrong-type results are not safe mappings.
  const id = Array.isArray(results) && results.length === 1 ? record(results[0])?.id : undefined;
  if (event.type === 'movie') return positiveId(id) ? fetchMovie(id, tmdb) : null;

  const show = positiveId(id) ? await fetchShow(id, tmdb) : null;
  if (!show || show.isAnime) {
    const mapped = await resolveByEpisodeIds(event.imdbId, event.season!, event.episode!, show, tmdb, deadline);
    if (mapped) return mapped;
  }
  return show ? resolveSameNumbering(show, event.season!, event.episode!, tmdb) : null;
}

/**
 * Maps an Anime Kitsu episode, numbered within its Kitsu entry (one cour or part), onto TMDB
 * through Fribb/anime-lists, which records each entry's TMDB season and episode offset.
 */
async function resolveKitsuFromList(
  event: PlayerEvent & { kitsuId: number },
  mapping: AnimeMapping | undefined,
  tmdb: Tmdb
): Promise<MappedTitle | UnmappedTitle | null> {
  const missing: UnmappedTitle = { kind: 'unmapped', reason: 'kitsu_mapping_missing' };
  const ambiguous: UnmappedTitle = { kind: 'unmapped', reason: 'kitsu_mapping_ambiguous' };

  if (event.type === 'movie') {
    if (!mapping?.tmdbMovieIds.length) return missing;
    if (mapping.ambiguous || mapping.tmdbMovieIds.length !== 1) return ambiguous;
    return fetchMovie(mapping.tmdbMovieIds[0], tmdb);
  }

  if (mapping?.tmdbTvId === undefined) return missing;
  if (mapping.ambiguous) return ambiguous;
  const show = await fetchShow(mapping.tmdbTvId, tmdb);
  if (!show) return null;
  const position = mapping.episodeOffset + event.episode!;
  if (mapping.tmdbSeason !== undefined) {
    // Offsets count positions, which also holds for continuously numbered TMDB seasons.
    const episode = (await fetchSeasonEpisodes(show.show.id, mapping.tmdbSeason, tmdb))?.[position - 1];
    return episode ? { kind: 'episode', show: show.show, episode } : null;
  }

  // A single Kitsu entry spanning the whole show (One Piece): walk its regular seasons.
  let remaining = position;
  for (const season of show.seasons) {
    if (season.number === 0) continue;
    if (remaining > season.episodeCount) {
      remaining -= season.episodeCount;
      continue;
    }
    const episodes = await fetchSeasonEpisodes(show.show.id, season.number, tmdb);
    const episode = episodes?.[remaining - 1];
    // Continuously numbered seasons must agree with the walked position, catching stale counts.
    if (!episodes || !episode || (episodes[0].episode_number > 1 && episode.episode_number !== position)) return null;
    return { kind: 'episode', show: show.show, episode };
  }
  return null;
}

/**
 * Falls back to the IMDb IDs, seasons and episodes the Anime Kitsu addon lists for its
 * entries. This covers entries the anime list is missing or has stale TMDB seasons for.
 */
async function resolveKitsuFromMeta(
  event: PlayerEvent & { kitsuId: number },
  tmdb: Tmdb,
  deadline: number
): Promise<MappedTitle | null> {
  const id = `kitsu:${event.kitsuId}`;
  const body = record(await requestJson(`${ANIME_KITSU_META_URL}/${event.type}/${id}.json`, deadline));
  const meta = record(body?.meta);
  if (!meta || meta.id !== id) return null;
  if (event.type === 'movie') {
    if (typeof meta.imdb_id !== 'string' || !/^tt\d+$/.test(meta.imdb_id)) return null;
    const results = (await tmdb(`/find/${meta.imdb_id}?external_source=imdb_id`))?.movie_results;
    const movieId = Array.isArray(results) && results.length === 1 ? record(results[0])?.id : undefined;
    return positiveId(movieId) ? fetchMovie(movieId, tmdb) : null;
  }
  const videos = Array.isArray(meta.videos) ? meta.videos.map(record) : [];
  const matches = videos.filter((video) => video?.id === `${id}:${event.episode}`);
  const video = matches.length === 1 ? matches[0] : null;
  if (!video || typeof video.imdb_id !== 'string' || !/^tt\d+$/.test(video.imdb_id)) return null;
  if (!nonNegative(video.imdbSeason) || !positiveId(video.imdbEpisode)) return null;
  return resolveByEpisodeIds(video.imdb_id, video.imdbSeason, video.imdbEpisode, null, tmdb, deadline);
}

async function resolveKitsu(
  event: PlayerEvent & { kitsuId: number },
  tmdb: Tmdb,
  deadline: number
): Promise<MappedTitle | UnmappedTitle | null> {
  const lists = await loadAnimeIndex(() => requestJson(ANIME_LIST_URL, deadline));
  const fromList = lists ? await resolveKitsuFromList(event, lists.get(event.kitsuId), tmdb) : null;
  if (fromList && fromList.kind !== 'unmapped') return fromList;
  const fromMeta = await resolveKitsuFromMeta(event, tmdb, deadline);
  if (fromMeta) return fromMeta;
  if (!lists) throw new StremioTmdbError('anime_list_unavailable');
  return fromList;
}

export async function resolveStremioTitle(
  event: PlayerEvent,
  rawApiKey: string
): Promise<MappedTitle | UnmappedTitle | null> {
  const apiKey = rawApiKey.trim();
  if (!apiKey) throw new StremioTmdbError('missing_api_key');
  const id = event.kitsuId !== undefined ? `kitsu:${event.kitsuId}` : event.imdbId;
  const cacheKey = event.type === 'movie' ? `movie:${id}` : `series:${id}:${event.season ?? ''}:${event.episode}`;
  const cached = titleCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return structuredClone(cached.title);
  titleCache.delete(cacheKey);
  const deadline = Date.now() + TMDB_TOTAL_BUDGET_MS;
  const tmdb: Tmdb = async (path) => {
    const separator = path.includes('?') ? '&' : '?';
    const data = await requestJson(`https://api.themoviedb.org/3${path}${separator}api_key=${encodeURIComponent(apiKey)}`, deadline);
    if (data === null) return null;
    const parsed = record(data);
    if (!parsed) throw new StremioTmdbError('invalid_payload');
    return parsed;
  };

  const title = event.kitsuId !== undefined
    ? await resolveKitsu(event, tmdb, deadline)
    : await resolveImdb(event, tmdb, deadline);
  return title && title.kind !== 'unmapped' ? cacheMappedTitle(cacheKey, title) : title;
}
