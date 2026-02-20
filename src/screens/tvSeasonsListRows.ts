import type { Episode } from '@/src/api/tmdb';
import type { SeasonWithEpisodes } from '@/src/components/tv/SeasonItem';

export type TVSeasonsListRow =
  | {
      type: 'season-header';
      key: string;
      season: SeasonWithEpisodes;
    }
  | {
      type: 'season-overview';
      key: string;
      season: SeasonWithEpisodes;
      overview: string;
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

    if (season.overview?.trim()) {
      rows.push({
        type: 'season-overview',
        key: `season-overview-${season.season_number}`,
        season,
        overview: season.overview,
      });
    }

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
