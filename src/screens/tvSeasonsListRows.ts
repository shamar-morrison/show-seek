import type { Episode } from '@/src/api/tmdb';
import type { SeasonWithEpisodes } from '@/src/components/tv/SeasonItem';
import { foldForSearch } from '@/src/utils/searchText';

export type TVSeasonsListRow =
  | {
      type: 'season-header';
      key: string;
      season: SeasonWithEpisodes;
    }
  | {
      type: 'season-details';
      key: string;
      season: SeasonWithEpisodes;
    }
  | {
      type: 'episode-row';
      key: string;
      season: SeasonWithEpisodes;
      episode: Episode;
    };

export function buildTVSeasonsListRows(
  seasons: SeasonWithEpisodes[],
  expandedSeason: number | null
): TVSeasonsListRow[] {
  const rows: TVSeasonsListRow[] = [];

  seasons.forEach((season) => {
    rows.push({
      type: 'season-header',
      key: `season-header-${season.season_number}`,
      season,
    });

    if (expandedSeason !== season.season_number) {
      return;
    }

    rows.push({
      type: 'season-details',
      key: `season-details-${season.season_number}`,
      season,
    });

    (season.episodes || []).forEach((episode) => {
      rows.push({
        type: 'episode-row',
        key: `season-episode-${season.season_number}-${episode.id}`,
        season,
        episode,
      });
    });
  });

  return rows;
}

export function getSeasonHeaderRowIndex(
  rows: TVSeasonsListRow[],
  targetSeason: number | null
): number {
  if (targetSeason === null) return -1;

  return rows.findIndex(
    (row) => row.type === 'season-header' && row.season.season_number === targetSeason
  );
}

const YEAR_QUERY = /^\d{4}$/;
const SEASON_NUMBER_QUERY = /^\d{1,3}$/;

/** Every year the season aired in, so a season running Sept 2019 – May 2020 matches both. */
function getSeasonAirYears(season: SeasonWithEpisodes): Set<string> {
  const years = new Set<string>();
  if (season.air_date) years.add(season.air_date.slice(0, 4));
  for (const episode of season.episodes ?? []) {
    if (episode.air_date) years.add(episode.air_date.slice(0, 4));
  }
  return years;
}

/**
 * Filters seasons by a search query:
 * - 4 digits ("2019") match any year the season aired in
 * - 1–3 digits ("12") match the season number
 * - anything else matches part of the season name, ignoring case and accents
 *
 * `getSeasonLabel` supplies the displayed name, so seasons TMDB leaves unnamed still match
 * "Season 3".
 */
export function filterSeasonsBySearch(
  seasons: SeasonWithEpisodes[],
  query: string,
  getSeasonLabel: (season: SeasonWithEpisodes) => string
): SeasonWithEpisodes[] {
  const foldedQuery = foldForSearch(query);
  if (!foldedQuery) return seasons;

  if (YEAR_QUERY.test(foldedQuery)) {
    return seasons.filter((season) => getSeasonAirYears(season).has(foldedQuery));
  }

  if (SEASON_NUMBER_QUERY.test(foldedQuery)) {
    const seasonNumber = Number(foldedQuery);
    return seasons.filter((season) => season.season_number === seasonNumber);
  }

  return seasons.filter((season) => foldForSearch(getSeasonLabel(season)).includes(foldedQuery));
}
