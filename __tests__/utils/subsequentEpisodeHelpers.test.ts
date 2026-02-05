const mockGetSeasonDetails = jest.fn();

jest.mock('@/src/api/tmdb', () => ({
  tmdbApi: {
    getSeasonDetails: (...args: any[]) => mockGetSeasonDetails(...args),
  },
}));

import { getSubsequentEpisode } from '@/src/utils/subsequentEpisodeHelpers';

describe('getSubsequentEpisode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the next episode in the same season when available', async () => {
    mockGetSeasonDetails.mockResolvedValueOnce({
      episodes: [
        { season_number: 1, episode_number: 1, name: 'Ep 1', air_date: '2024-01-01' },
        { season_number: 1, episode_number: 2, name: 'Ep 2', air_date: '2024-01-08' },
      ],
    });

    const result = await getSubsequentEpisode(123, {
      seasonNumber: 1,
      episodeNumber: 1,
      episodeName: 'Ep 1',
      airDate: '2024-01-01',
    });

    expect(result).toEqual({
      seasonNumber: 1,
      episodeNumber: 2,
      episodeName: 'Ep 2',
      airDate: '2024-01-08',
    });
  });

  it('falls back to the next season when current season is complete', async () => {
    mockGetSeasonDetails
      .mockResolvedValueOnce({
        episodes: [
          { season_number: 1, episode_number: 10, name: 'Finale', air_date: '2024-02-01' },
        ],
      })
      .mockResolvedValueOnce({
        episodes: [
          { season_number: 2, episode_number: 1, name: 'Season 2 Premiere', air_date: '2024-03-01' },
        ],
      });

    const result = await getSubsequentEpisode(456, {
      seasonNumber: 1,
      episodeNumber: 10,
      episodeName: 'Finale',
      airDate: '2024-02-01',
    });

    expect(result).toEqual({
      seasonNumber: 2,
      episodeNumber: 1,
      episodeName: 'Season 2 Premiere',
      airDate: '2024-03-01',
    });
  });
});
