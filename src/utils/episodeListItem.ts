import type { Episode } from '@/src/api/tmdb';
import type { ListMediaItem } from '@/src/services/ListService';
import { SEASON_TITLE_SEPARATOR, type SeasonListItemShow } from '@/src/utils/seasonListItem';

/**
 * Builds the list entry for an episode. Like a season, it carries the show's ID and genres (so
 * genre filters keep it) and a combined "Show · S2E12 · Name" title that app versions predating
 * episodes can still show. Its poster is the season's (else the show's): list cards are posters,
 * and an episode's 16:9 still is kept alongside for later use.
 */
export const buildEpisodeListItem = (
  show: SeasonListItemShow,
  episode: Pick<
    Episode,
    'season_number' | 'episode_number' | 'name' | 'still_path' | 'air_date' | 'vote_average'
  > & { runtime?: number | null },
  seasonPosterPath: string | null | undefined,
  formatEpisodeCode: (seasonNumber: number, episodeNumber: number) => string
): Omit<ListMediaItem, 'addedAt'> => {
  const episodeName = episode.name?.trim() ?? '';
  const code = formatEpisodeCode(episode.season_number, episode.episode_number);
  const title = [show.name, code, episodeName].filter(Boolean).join(SEASON_TITLE_SEPARATOR);
  const airDate = episode.air_date ?? '';
  const runtime =
    typeof episode.runtime === 'number' && episode.runtime > 0 ? episode.runtime : undefined;

  return {
    id: show.id,
    media_type: 'episode',
    season_number: episode.season_number,
    episode_number: episode.episode_number,
    episode_name: episodeName,
    show_name: show.name,
    title,
    name: title,
    poster_path: seasonPosterPath ?? show.poster_path ?? null,
    still_path: episode.still_path ?? null,
    vote_average: typeof episode.vote_average === 'number' ? episode.vote_average : 0,
    release_date: airDate,
    first_air_date: airDate,
    genre_ids: (show.genres ?? []).map((genre) => genre.id),
    ...(runtime ? { runtimeMinutes: runtime, episodeRuntimeMinutes: runtime } : {}),
  };
};

/**
 * How an episode entry is shown on a card: the show's name as the title, and its code with its
 * name ("S2E12 · Phoenix") on the line under it. The code alone when the name isn't known yet
 * (e.g. an entry synced from Trakt before it was filled in).
 */
export const getEpisodeEntryDisplay = (
  item: Partial<
    Pick<
      ListMediaItem,
      'show_name' | 'title' | 'name' | 'season_number' | 'episode_number' | 'episode_name'
    >
  >,
  formatEpisodeCode: (seasonNumber: number, episodeNumber: number) => string
): { title: string; episodeLabel: string } => {
  const showTitle = item.show_name || item.title || item.name || '';
  const code = formatEpisodeCode(item.season_number ?? 0, item.episode_number ?? 0);
  const episodeName = item.episode_name?.trim();
  return {
    title: showTitle,
    episodeLabel: episodeName ? `${code}${SEASON_TITLE_SEPARATOR}${episodeName}` : code,
  };
};

/** TMDB's English stand-in for an episode it has no name for (also what enrichment saves). */
const ENGLISH_PLACEHOLDER_NAME = /^episode\s+\d+$/i;

/**
 * Whether a name is a stand-in rather than the episode's real name: TMDB's English "Episode N",
 * or `localizedPlaceholder`, the same pattern in the app's language (e.g. "Episódio 12").
 */
export const isPlaceholderEpisodeName = (
  name: string | null | undefined,
  localizedPlaceholder?: string
): boolean => {
  const trimmed = name?.trim() ?? '';
  if (!trimmed) return true;
  if (ENGLISH_PLACEHOLDER_NAME.test(trimmed)) return true;
  return (
    !!localizedPlaceholder && trimmed.toLowerCase() === localizedPlaceholder.trim().toLowerCase()
  );
};

/**
 * The fields of a saved episode entry that TMDB has since filled in or changed, or null when
 * none has. An episode is often saved before it airs, with a placeholder name ("Episode 5") and
 * no air date, still or runtime. Only fields TMDB now has a value for are returned, so a saved
 * value is never blanked.
 *
 * The name is fetched in the app's language while imports save TMDB's English one, so a real
 * saved name is never replaced: only a missing or placeholder one, and only by a real name
 * (`localizedPlaceholder` is this episode's placeholder in the app's language). Otherwise
 * devices in different languages would keep rewriting it, or swap a real English name for an
 * untranslated "Episódio 12". The combined title is left as saved: synced lists compare it, and
 * cards show the episode's own name.
 */
export const getEpisodeEntryRefresh = (
  saved: Pick<
    ListMediaItem,
    'episode_name' | 'release_date' | 'still_path' | 'episodeRuntimeMinutes'
  >,
  episode: Pick<Episode, 'name' | 'air_date' | 'still_path'> & { runtime?: number | null },
  localizedPlaceholder?: string
): Partial<ListMediaItem> | null => {
  const fields: Partial<ListMediaItem> = {};
  const name = episode.name?.trim();
  if (
    name &&
    name !== saved.episode_name &&
    !isPlaceholderEpisodeName(name, localizedPlaceholder) &&
    isPlaceholderEpisodeName(saved.episode_name, localizedPlaceholder)
  ) {
    fields.episode_name = name;
  }
  if (episode.air_date && episode.air_date !== saved.release_date) {
    fields.release_date = episode.air_date;
    fields.first_air_date = episode.air_date;
  }
  if (episode.still_path && episode.still_path !== saved.still_path) {
    fields.still_path = episode.still_path;
  }
  const hasRuntime = saved.episodeRuntimeMinutes != null && saved.episodeRuntimeMinutes > 0;
  if (!hasRuntime && typeof episode.runtime === 'number' && episode.runtime > 0) {
    fields.runtimeMinutes = episode.runtime;
    fields.episodeRuntimeMinutes = episode.runtime;
  }
  return Object.keys(fields).length > 0 ? fields : null;
};
