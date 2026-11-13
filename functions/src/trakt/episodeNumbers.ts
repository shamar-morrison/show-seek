import { fetchTMDBJson } from './client';
import { getTraktEpisodeRef } from './seasons';
import type { TraktIds } from './types';

/** A TMDB season's episodes, as far as numbering needs them. */
export interface TMDBSeasonEpisodeNumbers {
  episodes?: { episode_number?: number; id?: number; season_number?: number }[];
}

/** TMDB `/find` results for an external episode ID. */
export interface TMDBFindEpisodeResponse {
  tv_episode_results?: { episode_number?: number; season_number?: number; show_id?: number }[];
}

export interface EpisodeNumberLookup {
  /** The season's episodes, or null when TMDB has no such season. */
  getSeason: (tvId: number, seasonNumber: number) => Promise<TMDBSeasonEpisodeNumbers | null>;
  /** Episodes TMDB knows by this TVDB or IMDb ID, or null when it knows none. */
  findEpisode: (
    externalId: string,
    source: 'tvdb_id' | 'imdb_id'
  ) => Promise<TMDBFindEpisodeResponse | null>;
}

/** Most TMDB requests one alignment run makes; later episodes keep Trakt's numbers. */
export const MAX_EPISODE_NUMBER_LOOKUPS = 150;

const defaultLookup: EpisodeNumberLookup = {
  getSeason: (tvId, seasonNumber) =>
    fetchTMDBJson<TMDBSeasonEpisodeNumbers>(`/tv/${tvId}/season/${seasonNumber}`),
  findEpisode: (externalId, source) =>
    fetchTMDBJson<TMDBFindEpisodeResponse>(
      `/find/${encodeURIComponent(externalId)}?external_source=${source}`
    ),
};

interface TraktEpisodeEntry {
  episode?: {
    ids?: Partial<TraktIds>;
    number?: number;
    season?: number;
    title?: string;
  } | null;
  show?: { ids?: Partial<TraktIds> } | null;
  type?: string;
}

const isWholeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

/**
 * Trakt numbers episodes as TVDB does, which for some shows (anime, shows aired out of order)
 * isn't TMDB's numbering. ShowSeek keys and opens episodes by TMDB's numbers, so each Trakt
 * episode entry is checked against TMDB before it is keyed:
 * - the TMDB season with Trakt's number is fetched once per show and season; when it holds
 *   Trakt's TMDB episode ID, or (with no such ID) an episode with that number, the entry keeps
 *   or takes those numbers;
 * - otherwise the episode is found by its TVDB, then IMDb, ID through TMDB `/find`, and takes
 *   that result's numbers when it belongs to the same show.
 * Anything that can't be confirmed keeps Trakt's numbers. Lookups fail open: an error (or the
 * request budget running out) leaves the remaining entries as they are, and the sync goes on.
 * Entries that aren't episodes are returned untouched, and no request is made without episodes.
 */
export async function alignTraktEpisodeNumbers<T extends TraktEpisodeEntry>(
  items: T[],
  lookup: EpisodeNumberLookup = defaultLookup,
  maxLookups: number = MAX_EPISODE_NUMBER_LOOKUPS
): Promise<T[]> {
  if (!Array.isArray(items) || !items.some((item) => item && getTraktEpisodeRef(item))) {
    return items;
  }

  const seasons = new Map<string, Promise<TMDBSeasonEpisodeNumbers | null>>();
  let lookupsLeft = maxLookups;
  let stopped = false;

  const request = async <R>(run: () => Promise<R>): Promise<R | undefined> => {
    if (stopped || lookupsLeft <= 0) return undefined;
    lookupsLeft -= 1;
    try {
      return await run();
    } catch (error) {
      // Rate limits or an outage: keep Trakt's numbers for everything still to check.
      stopped = true;
      console.warn('[TraktSync] Episode numbering lookup failed; keeping Trakt numbers:', error);
      return undefined;
    }
  };

  const getSeason = (tvId: number, seasonNumber: number) => {
    const key = `${tvId}:${seasonNumber}`;
    let season = seasons.get(key);
    if (!season) {
      season = request(() => lookup.getSeason(tvId, seasonNumber)).then((result) => result ?? null);
      seasons.set(key, season);
    }
    return season;
  };

  const findByExternalId = async (
    tvId: number,
    ids: Partial<TraktIds> | undefined
  ): Promise<{ season: number; episode: number } | null> => {
    const candidates: [string | undefined, 'tvdb_id' | 'imdb_id'][] = [
      [ids?.tvdb !== undefined && ids.tvdb !== null ? String(ids.tvdb) : undefined, 'tvdb_id'],
      [ids?.imdb || undefined, 'imdb_id'],
    ];
    for (const [externalId, source] of candidates) {
      if (!externalId) continue;
      const found = await request(() => lookup.findEpisode(externalId, source));
      const match = found?.tv_episode_results?.find((result) => result.show_id === tvId);
      if (match && isWholeNumber(match.season_number) && isWholeNumber(match.episode_number)) {
        return { season: match.season_number, episode: match.episode_number };
      }
    }
    return null;
  };

  const aligned: T[] = [];
  for (const item of items) {
    const ref = item ? getTraktEpisodeRef(item) : undefined;
    const tvId = item?.show?.ids?.tmdb;
    if (!ref || typeof tvId !== 'number' || tvId <= 0 || !item.episode) {
      aligned.push(item);
      continue;
    }

    const tmdbEpisodeId = item.episode.ids?.tmdb;
    const season = await getSeason(tvId, ref.seasonNumber);
    const byId =
      typeof tmdbEpisodeId === 'number'
        ? season?.episodes?.find((episode) => episode.id === tmdbEpisodeId)
        : undefined;
    const byNumber =
      typeof tmdbEpisodeId !== 'number'
        ? season?.episodes?.find((episode) => episode.episode_number === ref.episodeNumber)
        : undefined;

    let numbers: { season: number; episode: number } | null = null;
    if (byId && isWholeNumber(byId.episode_number)) {
      numbers = {
        season: isWholeNumber(byId.season_number) ? byId.season_number : ref.seasonNumber,
        episode: byId.episode_number,
      };
    } else if (byNumber) {
      numbers = { season: ref.seasonNumber, episode: ref.episodeNumber };
    } else {
      numbers = await findByExternalId(tvId, item.episode.ids);
    }

    if (
      !numbers ||
      (numbers.season === ref.seasonNumber && numbers.episode === ref.episodeNumber)
    ) {
      aligned.push(item);
      continue;
    }
    aligned.push({
      ...item,
      episode: { ...item.episode, number: numbers.episode, season: numbers.season },
    });
  }
  return aligned;
}
