import type { SeasonWithEpisodes } from '@/src/components/tv/SeasonItem';
import {
  buildTVSeasonsListRows,
  filterSeasonsBySearch,
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

  it('inserts details and episode rows for the expanded season', () => {
    const rows = buildTVSeasonsListRows(mockSeasons, 1);

    expect(rows.map((row) => row.type)).toEqual([
      'season-header',
      'season-details',
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

describe('filterSeasonsBySearch', () => {
  const label = (season: SeasonWithEpisodes) => season.name || `Season ${season.season_number}`;
  const numbers = (seasons: SeasonWithEpisodes[]) => seasons.map((s) => s.season_number);

  it('returns every season for an empty or blank query', () => {
    expect(filterSeasonsBySearch(mockSeasons, '', label)).toBe(mockSeasons);
    expect(filterSeasonsBySearch(mockSeasons, '   ', label)).toBe(mockSeasons);
  });

  it('matches a 4-digit year against the season and episode air dates', () => {
    const spanning: SeasonWithEpisodes = {
      ...mockSeasons[1],
      id: 3,
      season_number: 3,
      air_date: '2022-09-01',
      episodes: [{ ...mockSeasons[1].episodes![0], air_date: '2023-05-01' }],
    };
    const seasons = [...mockSeasons, spanning];

    expect(numbers(filterSeasonsBySearch(seasons, '2021', label))).toEqual([2]);
    expect(numbers(filterSeasonsBySearch(seasons, '2023', label))).toEqual([3]);
    expect(numbers(filterSeasonsBySearch(seasons, '1999', label))).toEqual([]);
  });

  it('matches 1–3 digits against the season number only', () => {
    expect(numbers(filterSeasonsBySearch(mockSeasons, '2', label))).toEqual([2]);
    expect(numbers(filterSeasonsBySearch(mockSeasons, '20', label))).toEqual([]);
  });

  it('matches text against the season label, ignoring case and accents', () => {
    const seasons: SeasonWithEpisodes[] = [
      { ...mockSeasons[0], name: 'Saison Été' },
      { ...mockSeasons[1], name: '' },
    ];

    expect(numbers(filterSeasonsBySearch(seasons, 'ete', label))).toEqual([1]);
    expect(numbers(filterSeasonsBySearch(seasons, 'SEASON 2', label))).toEqual([2]);
  });
});
