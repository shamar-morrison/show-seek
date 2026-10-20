import { TMDB_MAX_RETRIES, TMDB_REQUEST_TIMEOUT_MS, TMDB_TOTAL_BUDGET_MS } from './constants';
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

async function requestTmdb(path: string, apiKey: string, deadline: number): Promise<Record<string, unknown> | null> {
  for (let attempt = 0; attempt <= TMDB_MAX_RETRIES; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new StremioTmdbError('budget_exhausted');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(TMDB_REQUEST_TIMEOUT_MS, remaining));
    try {
      const separator = path.includes('?') ? '&' : '?';
      const response = await fetch(`https://api.themoviedb.org/3${path}${separator}api_key=${encodeURIComponent(apiKey)}`, {
        signal: controller.signal,
      });
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
      const parsed = record(data);
      if (!parsed) throw new StremioTmdbError('invalid_payload');
      return parsed;
    } catch (error) {
      if (error instanceof StremioTmdbError) throw error;
      throw new StremioTmdbError(controller.signal.aborted ? 'timeout' : 'request_failed');
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new StremioTmdbError('retry_exhausted');
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

export async function resolveStremioTitle(event: PlayerEvent, rawApiKey: string): Promise<MappedTitle | null> {
  const apiKey = rawApiKey.trim();
  if (!apiKey) throw new StremioTmdbError('missing_api_key');
  const deadline = Date.now() + TMDB_TOTAL_BUDGET_MS;
  const found = await requestTmdb(`/find/${encodeURIComponent(event.imdbId)}?external_source=imdb_id`, apiKey, deadline);
  const results = found?.[event.type === 'movie' ? 'movie_results' : 'tv_results'];
  // Ambiguous or wrong-type results are not safe mappings.
  if (!Array.isArray(results) || results.length !== 1) return null;
  const id = record(results[0])?.id;
  if (!positiveId(id)) return null;

  if (event.type === 'movie') {
    const movie = await requestTmdb(`/movie/${id}`, apiKey, deadline);
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

  const show = await requestTmdb(`/tv/${id}`, apiKey, deadline);
  const details = show && mediaDetails(show, id);
  if (!show || !details || typeof show.name !== 'string' || !show.name) return null;
  const season = await requestTmdb(`/tv/${id}/season/${event.season}`, apiKey, deadline);
  if (!season || season.season_number !== event.season || !Array.isArray(season.episodes)) return null;
  const matches = season.episodes.filter((value) => {
    const episode = record(value);
    return episode?.season_number === event.season && episode?.episode_number === event.episode;
  });
  if (matches.length !== 1) return null;
  const episode = record(matches[0]);
  if (!episode || !positiveId(episode.id) || typeof episode.name !== 'string') return null;
  return {
    kind: 'episode',
    show: {
      ...details,
      name: show.name,
      first_air_date: typeof show.first_air_date === 'string' ? show.first_air_date : '',
    },
    episode: {
      id: episode.id,
      season_number: event.season!,
      episode_number: event.episode!,
      name: episode.name,
      air_date: typeof episode.air_date === 'string' ? episode.air_date : null,
      runtime: positiveRuntime(episode.runtime),
    },
  };
}
