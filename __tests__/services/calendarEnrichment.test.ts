import AsyncStorage from '@react-native-async-storage/async-storage';

const mockGetTVShowDetails = jest.fn();
const mockGetSeasonDetails = jest.fn();
const mockGetMovieDetails = jest.fn();

jest.mock('@/src/api/tmdb', () => ({
  tmdbApi: {
    getTVShowDetails: (...args: unknown[]) => mockGetTVShowDetails(...args),
    getSeasonDetails: (...args: unknown[]) => mockGetSeasonDetails(...args),
    getMovieDetails: (...args: unknown[]) => mockGetMovieDetails(...args),
  },
}));

import {
  CALENDAR_FRESH_TIME_MS,
  CALENDAR_SETTLED_FRESH_TIME_MS,
  calendarEnrichmentCache,
  calendarTvQueryOptions,
  fetchCalendarMovieSummary,
  fetchCalendarSeasonSummary,
  fetchCalendarTvSummary,
  getCalendarSummaryFreshTime,
  isCalendarEnrichmentQueryKey,
  summarizeTvDetails,
} from '@/src/services/calendarEnrichment';

const tvDetails = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 1,
    name: 'Show',
    status: 'Returning Series',
    backdrop_path: '/b.jpg',
    seasons: [
      { season_number: 0 },
      { season_number: 1 },
      { season_number: 3 },
    ],
    next_episode_to_air: null,
    ...overrides,
  }) as any;

describe('calendarEnrichment', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    calendarEnrichmentCache.resetForTests();
    await AsyncStorage.clear();
  });

  describe('summarizeTvDetails', () => {
    it("prefers the next episode's season", () => {
      const summary = summarizeTvDetails(
        tvDetails({
          next_episode_to_air: {
            season_number: 2,
            episode_number: 5,
            name: 'Next',
            air_date: '2026-03-01',
          },
        })
      );

      expect(summary.seasonToFetch).toBe(2);
      expect(summary.nextEpisode).toEqual({
        seasonNumber: 2,
        episodeNumber: 5,
        name: 'Next',
        airDate: '2026-03-01',
      });
    });

    it('uses the latest regular season for active shows without a next episode', () => {
      expect(summarizeTvDetails(tvDetails()).seasonToFetch).toBe(3);
    });

    it('skips season lookups for finished shows', () => {
      expect(summarizeTvDetails(tvDetails({ status: 'Ended' })).seasonToFetch).toBeNull();
    });
  });

  it('keeps finished shows and released movies fresh for longer', () => {
    expect(getCalendarSummaryFreshTime(summarizeTvDetails(tvDetails({ status: 'Canceled' })))).toBe(
      CALENDAR_SETTLED_FRESH_TIME_MS
    );
    expect(getCalendarSummaryFreshTime(summarizeTvDetails(tvDetails()))).toBe(
      CALENDAR_FRESH_TIME_MS
    );
    expect(
      getCalendarSummaryFreshTime({ k: 'movie', releaseDate: '2020-01-01', backdropPath: null })
    ).toBe(CALENDAR_SETTLED_FRESH_TIME_MS);
    expect(
      getCalendarSummaryFreshTime({ k: 'movie', releaseDate: '2099-01-01', backdropPath: null })
    ).toBe(CALENDAR_FRESH_TIME_MS);
  });

  it('writes fetched summaries to the device cache and serves them as initial data', async () => {
    await calendarEnrichmentCache.load();
    mockGetTVShowDetails.mockResolvedValue(tvDetails({ id: 7, name: 'Seven' }));
    mockGetSeasonDetails.mockResolvedValue({
      episodes: [{ season_number: 3, episode_number: 1, name: 'Pilot', air_date: '2026-02-01' }],
    });
    mockGetMovieDetails.mockResolvedValue({
      backdrop_path: null,
      release_date: '2026-05-01',
      release_dates: {
        results: [
          { iso_3166_1: 'GB', release_dates: [{ type: 3, release_date: '2026-06-01T00:00:00Z' }] },
        ],
      },
    });

    await fetchCalendarTvSummary(7);
    await fetchCalendarSeasonSummary(7, 3);
    const movie = await fetchCalendarMovieSummary(9, 'GB');

    expect(movie.releaseDate).toBe('2026-06-01');
    expect(calendarEnrichmentCache.get('season:7:3')?.value).toEqual({
      k: 'season',
      episodes: [{ seasonNumber: 3, episodeNumber: 1, name: 'Pilot', airDate: '2026-02-01' }],
    });
    expect(calendarEnrichmentCache.get('movie:GB:9')).toBeDefined();

    const options = calendarTvQueryOptions(7);
    expect(options.initialData()?.name).toBe('Seven');
    expect(options.initialDataUpdatedAt()).toEqual(expect.any(Number));
    expect(calendarTvQueryOptions(8).initialData()).toBeUndefined();
  });

  it('identifies calendar query keys for refresh invalidation', () => {
    expect(isCalendarEnrichmentQueryKey(['calendar', 'tv', 1])).toBe(true);
    expect(isCalendarEnrichmentQueryKey(['tv', 1, 'calendar-enrichment'])).toBe(false);
  });
});
