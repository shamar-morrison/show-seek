import { normalizeEpisodeTrackingDoc, toMillis } from '@/src/services/episodeTrackingNormalization';

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

  it('rekeys episodes when stored identifiers disagree with the raw Firestore map key', () => {
    const watchedAtMs = new Date('2026-03-10T07:45:00Z').getTime();

    const result = normalizeEpisodeTrackingDoc(
      {
        metadata: {
          tvShowName: 'Rekeyed Show',
        },
        episodes: {
          '1_1': {
            seasonNumber: '2',
            episodeNumber: '3',
            tvShowId: '777',
            watchedAt: watchedAtMs,
          },
        },
      },
      '777'
    );

    expect(result).not.toBeNull();
    expect(Object.keys(result!.episodes)).toEqual(['2_3']);
    expect(result!.episodes['2_3']).toEqual({
      episodeId: 0,
      tvShowId: 777,
      seasonNumber: 2,
      episodeNumber: 3,
      watchedAt: watchedAtMs,
      episodeName: 'Episode 3',
      episodeAirDate: null,
    });
    expect(result!.episodes['1_1']).toBeUndefined();
  });
});

describe('toMillis', () => {
  it('passes finite numbers through unchanged', () => {
    expect(toMillis(1710000000000)).toBe(1710000000000);
    expect(toMillis(0)).toBe(0);
  });

  it('converts Timestamp-like objects via toMillis()', () => {
    expect(toMillis({ toMillis: () => 1710000000000 })).toBe(1710000000000);
  });

  it('converts toDate() objects via getTime()', () => {
    const date = new Date('2026-03-07T12:00:00Z');
    expect(toMillis({ toDate: () => date })).toBe(date.getTime());
  });

  it('converts numeric strings', () => {
    expect(toMillis('1710000000000')).toBe(1710000000000);
  });

  it('returns null for null, undefined, zero-width and garbage input', () => {
    expect(toMillis(null)).toBeNull();
    expect(toMillis(undefined)).toBeNull();
    expect(toMillis('')).toBeNull();
    expect(toMillis('not-a-date')).toBeNull();
    expect(toMillis(Number.NaN)).toBeNull();
    expect(toMillis(Number.POSITIVE_INFINITY)).toBeNull();
    expect(toMillis({})).toBeNull();
    expect(toMillis([])).toBeNull();
    expect(toMillis({ toMillis: () => Number.NaN })).toBeNull();
  });
});
