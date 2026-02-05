import type { Episode, Season } from '@/src/api/tmdb';
import type { WatchedEpisode } from '@/src/types/episodeTracking';
import { episodeTrackingService } from '@/src/services/EpisodeTrackingService';

describe('EpisodeTrackingService progress calculations', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-06-15T12:00:00Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('excludes unaired episodes from season progress percentages', () => {
    const episodes: Episode[] = [
      {
        id: 1,
        name: 'Episode 1',
        episode_number: 1,
        season_number: 1,
        air_date: '2024-06-01',
        overview: '',
        still_path: null,
        runtime: null,
        vote_average: 0,
      },
      {
        id: 2,
        name: 'Episode 2',
        episode_number: 2,
        season_number: 1,
        air_date: '2024-06-20',
        overview: '',
        still_path: null,
        runtime: null,
        vote_average: 0,
      },
      {
        id: 3,
        name: 'Episode 3',
        episode_number: 3,
        season_number: 1,
        air_date: '2024-05-10',
        overview: '',
        still_path: null,
        runtime: null,
        vote_average: 0,
      },
    ];

    const watched: Record<string, WatchedEpisode> = {
      '1_1': {
        episodeId: 1,
        tvShowId: 10,
        seasonNumber: 1,
        episodeNumber: 1,
        watchedAt: Date.now(),
        episodeName: 'Episode 1',
        episodeAirDate: '2024-06-01',
      },
    };

    const result = episodeTrackingService.calculateSeasonProgress(1, episodes, watched);

    expect(result.totalCount).toBe(3);
    expect(result.totalAiredCount).toBe(2);
    expect(result.watchedCount).toBe(1);
    expect(result.percentage).toBe(50);
  });

  it('excludes season 0 and unaired episodes from show progress', () => {
    const seasons: Season[] = [
      {
        id: 0,
        name: 'Specials',
        season_number: 0,
        episode_count: 1,
        air_date: '2024-06-01',
        overview: '',
        poster_path: null,
      },
      {
        id: 1,
        name: 'Season 1',
        season_number: 1,
        episode_count: 2,
        air_date: '2024-06-01',
        overview: '',
        poster_path: null,
      },
    ];

    const episodes: Episode[] = [
      {
        id: 100,
        name: 'Special 1',
        episode_number: 1,
        season_number: 0,
        air_date: '2024-06-01',
        overview: '',
        still_path: null,
        runtime: null,
        vote_average: 0,
      },
      {
        id: 200,
        name: 'Episode 1',
        episode_number: 1,
        season_number: 1,
        air_date: '2024-06-01',
        overview: '',
        still_path: null,
        runtime: null,
        vote_average: 0,
      },
      {
        id: 201,
        name: 'Episode 2',
        episode_number: 2,
        season_number: 1,
        air_date: '2024-07-01',
        overview: '',
        still_path: null,
        runtime: null,
        vote_average: 0,
      },
    ];

    const watched: Record<string, WatchedEpisode> = {
      '1_1': {
        episodeId: 200,
        tvShowId: 10,
        seasonNumber: 1,
        episodeNumber: 1,
        watchedAt: Date.now(),
        episodeName: 'Episode 1',
        episodeAirDate: '2024-06-01',
      },
      '0_1': {
        episodeId: 100,
        tvShowId: 10,
        seasonNumber: 0,
        episodeNumber: 1,
        watchedAt: Date.now(),
        episodeName: 'Special 1',
        episodeAirDate: '2024-06-01',
      },
    };

    const result = episodeTrackingService.calculateShowProgress(seasons, episodes, watched);

    expect(result.totalEpisodes).toBe(2);
    expect(result.totalAiredEpisodes).toBe(1);
    expect(result.totalWatched).toBe(1);
    expect(result.percentage).toBe(100);
    expect(result.seasonProgress).toHaveLength(1);
    expect(result.seasonProgress[0].seasonNumber).toBe(1);
  });
});
