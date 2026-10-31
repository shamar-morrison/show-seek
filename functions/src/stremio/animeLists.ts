import { ANIME_LIST_MIN_ENTRIES, ANIME_LIST_RETRY_AFTER_MS, ANIME_LIST_TTL_MS } from './constants';

export interface AnimeMapping {
  tmdbTvId?: number;
  tmdbMovieIds: number[];
  /** TMDB season holding this Kitsu entry. Unknown for some long-running single-entry shows. */
  tmdbSeason?: number;
  /** Episodes of that TMDB season aired before this entry's first episode (e.g. later cours). */
  episodeOffset: number;
  /** Another Kitsu entry claims the same TMDB episodes, so episode positions cannot be trusted. */
  ambiguous: boolean;
}

type AnimeIndex = Map<number, AnimeMapping>;

let index: AnimeIndex | null = null;
let loadedAt = 0;
let failedAt = 0;
let loading: Promise<AnimeIndex | null> | null = null;

export function clearAnimeListCache(): void {
  index = null;
  loadedAt = 0;
  failedAt = 0;
  loading = null;
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
const positiveId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const nonNegative = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;

/**
 * Builds a Kitsu -> TMDB index from Fribb/anime-lists. Only the few fields needed here are
 * kept, so the parsed multi-megabyte list can be garbage collected straight away.
 */
export function buildAnimeIndex(raw: unknown): AnimeIndex | null {
  if (!Array.isArray(raw) || raw.length < ANIME_LIST_MIN_ENTRIES) return null;
  const built: AnimeIndex = new Map();
  for (const value of raw) {
    const entry = record(value);
    const kitsuId = entry?.kitsu_id;
    const tmdb = record(entry?.themoviedb_id);
    if (!entry || !positiveId(kitsuId) || !tmdb) continue;
    const tmdbTvId = positiveId(tmdb.tv) ? tmdb.tv : undefined;
    const movies = Array.isArray(tmdb.movie) ? tmdb.movie : [tmdb.movie];
    const tmdbMovieIds = [...new Set(movies.filter(positiveId))];
    if (tmdbTvId === undefined && tmdbMovieIds.length === 0) continue;
    const mapping: AnimeMapping = {
      tmdbTvId,
      tmdbMovieIds,
      tmdbSeason: nonNegative(record(entry.season)?.tmdb),
      episodeOffset: nonNegative(record(entry.episode_offset)?.tmdb) ?? 0,
      ambiguous: false,
    };
    const existing = built.get(kitsuId);
    if (!existing) built.set(kitsuId, mapping);
    else if (existing.tmdbTvId !== mapping.tmdbTvId || existing.tmdbSeason !== mapping.tmdbSeason
      || existing.episodeOffset !== mapping.episodeOffset
      || existing.tmdbMovieIds.join() !== mapping.tmdbMovieIds.join()) existing.ambiguous = true;
  }

  const byShow = new Map<number, AnimeMapping[]>();
  for (const mapping of built.values()) {
    if (mapping.tmdbTvId === undefined) continue;
    const list = byShow.get(mapping.tmdbTvId);
    if (list) list.push(mapping);
    else byShow.set(mapping.tmdbTvId, [mapping]);
  }
  for (const mappings of byShow.values()) {
    for (const mapping of mappings) {
      const overlaps = mappings.some((other) => other !== mapping && (mapping.tmdbSeason === undefined
        // Without a season, the entry is walked across every regular season of the show.
        ? other.tmdbSeason !== 0
        : other.tmdbSeason === mapping.tmdbSeason && other.episodeOffset === mapping.episodeOffset));
      if (overlaps) mapping.ambiguous = true;
    }
  }
  return built;
}

/**
 * The Kitsu -> TMDB index, refreshed daily. A stale copy keeps serving when a refresh fails,
 * and a failed first load is not retried on every request. Returns null when unavailable.
 */
export async function loadAnimeIndex(download: () => Promise<unknown>): Promise<AnimeIndex | null> {
  const now = Date.now();
  if (index && now - loadedAt < ANIME_LIST_TTL_MS) return index;
  if (loading) return loading;
  if (failedAt && now - failedAt < ANIME_LIST_RETRY_AFTER_MS) return index;
  loading = (async () => {
    try {
      const built = buildAnimeIndex(await download());
      if (!built) throw new Error('anime list looks truncated');
      index = built;
      loadedAt = Date.now();
      failedAt = 0;
    } catch {
      failedAt = Date.now();
    }
    return index;
  })().finally(() => {
    loading = null;
  });
  return loading;
}
