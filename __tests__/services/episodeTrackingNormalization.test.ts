import { normalizeEpisodeTrackingDoc } from '@/src/services/episodeTrackingNormalization';

describe('episodeTrackingNormalization', () => {
  it('normalizes sparse Trakt docs and derives missing identifiers from the episode key and doc id', () => {
    const watchedAtMs = new Date('2026-03-07T12:00:00Z').getTime();
    const lastUpdatedMs = new Date('2026-03-08T09:30:00Z').getTime();

    const result = normalizeEpisodeTrackingDoc(
      {
        metadata: {
          lastUpdated: {
            toDate: () => new Date(lastUpdatedMs),
          },
          tvShowName: 'Sparse Show',
        },
        episodes: {
          '2_3': {
            watched: true,
            watchedAt: {
              toMillis: () => watchedAtMs,
            },
          },
        },
      },
      '700'
    );

    expect(result).toEqual({
      metadata: {
        tvShowName: 'Sparse Show',
        posterPath: null,
        lastUpdated: lastUpdatedMs,
      },
      episodes: {
        '2_3': {
          episodeId: 0,
          tvShowId: 700,
          seasonNumber: 2,
          episodeNumber: 3,
          watchedAt: watchedAtMs,
          episodeName: 'Episode 3',
          episodeAirDate: null,
        },
      },
    });
  });

  it('falls back metadata.lastUpdated to the latest watchedAt while preserving posterPath', () => {
    const newestWatchedAt = new Date('2026-03-09T18:15:00Z').getTime();

    const result = normalizeEpisodeTrackingDoc(
      {
        metadata: {
          posterPath: '/poster.jpg',
          tvShowName: 'Poster Show',
        },
        episodes: {
          '1_1': {
            episodeAirDate: '2026-03-01',
            episodeId: '101',
            episodeName: 'Pilot',
            episodeNumber: '1',
            seasonNumber: '1',
            tvShowId: '701',
            watchedAt: '2026-03-09T18:15:00Z',
          },
        },
      },
      '701'
    );

    expect(result).toEqual({
      metadata: {
        tvShowName: 'Poster Show',
        posterPath: '/poster.jpg',
        lastUpdated: newestWatchedAt,
      },
      episodes: {
        '1_1': {
          episodeId: 101,
          tvShowId: 701,
          seasonNumber: 1,
          episodeNumber: 1,
          watchedAt: newestWatchedAt,
          episodeName: 'Pilot',
          episodeAirDate: '2026-03-01',
        },
      },
    });
  });
});
