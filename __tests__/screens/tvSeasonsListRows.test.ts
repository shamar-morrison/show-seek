import type { SeasonWithEpisodes } from '@/src/components/tv/SeasonItem';
import {
  buildTVSeasonsListRows,
  getSeasonHeaderRowIndex,
} from '@/src/screens/tvSeasonsListRows';

const mockSeasons: SeasonWithEpisodes[] = [
  {
    id: 1,
    season_number: 1,
    name: 'Season 1',
    overview: 'Overview 1',
    air_date: '2020-01-01',
    poster_path: '/season1.jpg',
    episode_count: 2,
    episodes: [
      {
        id: 101,
        episode_number: 1,
        name: 'S1E1',
        overview: 'Episode 1',
        air_date: '2020-01-01',
        still_path: '/s1e1.jpg',
        vote_average: 7,
        runtime: 40,
        season_number: 1,
      },
      {
        id: 102,
        episode_number: 2,
        name: 'S1E2',
        overview: 'Episode 2',
        air_date: '2020-01-08',
        still_path: '/s1e2.jpg',
        vote_average: 8,
        runtime: 41,
        season_number: 1,
      },
    ],
  },
  {
    id: 2,
    season_number: 2,
    name: 'Season 2',
    overview: 'Overview 2',
    air_date: '2021-01-01',
    poster_path: '/season2.jpg',
    episode_count: 1,
    episodes: [
      {
        id: 201,
        episode_number: 1,
        name: 'S2E1',
        overview: 'Episode 1',
        air_date: '2021-01-01',
        still_path: '/s2e1.jpg',
        vote_average: 9,
        runtime: 42,
        season_number: 2,
      },
    ],
  },
];

describe('tvSeasonsListRows', () => {
  it('builds header-only rows when no season is expanded', () => {
    const rows = buildTVSeasonsListRows(mockSeasons, null);

    expect(rows).toHaveLength(2);
    expect(rows[0].type).toBe('season-header');
    expect(rows[1].type).toBe('season-header');
  });

  it('inserts overview and episode rows for the expanded season', () => {
    const rows = buildTVSeasonsListRows(mockSeasons, 1);

    expect(rows.map((row) => row.type)).toEqual([
      'season-header',
      'season-overview',
      'episode-row',
      'episode-row',
      'season-header',
    ]);
  });

  it('returns the correct header index for deep-link auto-scroll', () => {
    const rows = buildTVSeasonsListRows(mockSeasons, 1);

    expect(getSeasonHeaderRowIndex(rows, 2)).toBe(4);
    expect(getSeasonHeaderRowIndex(rows, 99)).toBe(-1);
    expect(getSeasonHeaderRowIndex(rows, null)).toBe(-1);
  });
});
