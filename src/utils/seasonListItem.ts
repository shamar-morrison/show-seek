import type { Episode, Season } from '@/src/api/tmdb';
import type { ListMediaItem } from '@/src/services/ListService';

/** Separator between show and season in a season entry's combined title. */
export const SEASON_TITLE_SEPARATOR = ' · ';

export interface SeasonListItemShow {
  id: number;
  name: string;
  poster_path: string | null;
  genres?: { id: number }[];
}

/** Sum of the season's known episode runtimes, or undefined when none are known yet. */
export const getSeasonRuntimeMinutes = (
  episodes: Pick<Episode, 'runtime'>[] | undefined
): number | undefined => {
  const total = (episodes ?? []).reduce(
    (sum, episode) =>
      typeof episode.runtime === 'number' && episode.runtime > 0 ? sum + episode.runtime : sum,
    0
  );
  return total > 0 ? total : undefined;
};

/**
 * Builds the list entry for a season. The entry carries the show's ID and genres (TMDB seasons
 * have no genres, so genre filters would otherwise hide every season), the season's poster
 * (falling back to the show's), and a combined title that app versions predating seasons can
 * still show.
 */
export const buildSeasonListItem = (
  show: SeasonListItemShow,
  season: Pick<Season, 'season_number' | 'name' | 'poster_path' | 'air_date' | 'vote_average'> & {
    episodes?: Pick<Episode, 'runtime'>[];
  },
  fallbackSeasonName: string
): Omit<ListMediaItem, 'addedAt'> => {
  const seasonName = season.name?.trim() || fallbackSeasonName;
  const title = `${show.name}${SEASON_TITLE_SEPARATOR}${seasonName}`;
  const airDate = season.air_date ?? '';
  const runtime = getSeasonRuntimeMinutes(season.episodes);

  return {
    id: show.id,
    media_type: 'season',
    season_number: season.season_number,
    season_name: seasonName,
    show_name: show.name,
    title,
    name: title,
    poster_path: season.poster_path ?? show.poster_path ?? null,
    vote_average: typeof season.vote_average === 'number' ? season.vote_average : 0,
    release_date: airDate,
    first_air_date: airDate,
    genre_ids: (show.genres ?? []).map((genre) => genre.id),
    ...(runtime ? { runtimeMinutes: runtime, seasonRuntimeMinutes: runtime } : {}),
  };
};

/**
 * How a season entry is shown on a card: the show's name as the title, and "Season X" (or
 * TMDB's own name for specials, e.g. "Specials") on the line under it.
 */
export const getSeasonEntryDisplay = (
  item: Partial<
    Pick<ListMediaItem, 'show_name' | 'title' | 'name' | 'season_number' | 'season_name'>
  >,
  formatSeasonNumber: (seasonNumber: number) => string
): { title: string; seasonLabel: string } => {
  const showTitle = item.show_name || item.title || item.name || '';
  const seasonNumber = item.season_number ?? 0;
  const seasonLabel =
    seasonNumber === 0 && item.season_name ? item.season_name : formatSeasonNumber(seasonNumber);
  return { title: showTitle, seasonLabel };
};
