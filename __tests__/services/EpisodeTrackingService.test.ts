import { deleteField, getDoc, getDocs, updateDoc } from 'firebase/firestore';

let mockUserId: string | null = 'test-user-id';
let mockIsAnonymous = false;

jest.mock('@/src/firebase/config', () => ({
  auth: {
    get currentUser() {
      return mockUserId ? { uid: mockUserId, isAnonymous: mockIsAnonymous } : null;
    },
  },
  db: {},
}));

jest.mock('@/src/firebase/firestore', () => ({
  getFirestoreErrorMessage: jest.fn((error) => error.message || 'Unknown error'),
}));

import { episodeTrackingService } from '@/src/services/EpisodeTrackingService';

describe('EpisodeTrackingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = 'test-user-id';
    mockIsAnonymous = false;
  });

  it('does not call updateDoc when unwatching a missing document', async () => {
    (getDoc as jest.Mock).mockResolvedValue({ exists: () => false });

    await episodeTrackingService.markEpisodeUnwatched(123, 1, 1);

    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('does not call updateDoc when bulk unwatching a missing document', async () => {
    (getDoc as jest.Mock).mockResolvedValue({ exists: () => false });

    await episodeTrackingService.markAllEpisodesUnwatched(123, 1, [
      { id: 1, episode_number: 1 } as any,
      { id: 2, episode_number: 2 } as any,
    ]);

    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('uses a single updateDoc call to bulk unwatch all episodes in a season', async () => {
    (getDoc as jest.Mock).mockResolvedValue({ exists: () => true });

    await episodeTrackingService.markAllEpisodesUnwatched(123, 2, [
      { id: 10, episode_number: 1 } as any,
      { id: 11, episode_number: 3 } as any,
    ]);

    expect(updateDoc).toHaveBeenCalledTimes(1);

    const updatePayload = (updateDoc as jest.Mock).mock.calls[0][1];
    expect(updatePayload['episodes.2_1']).toBe('__deleteField__');
    expect(updatePayload['episodes.2_3']).toBe('__deleteField__');
    expect(typeof updatePayload['metadata.lastUpdated']).toBe('number');
    expect(deleteField).toHaveBeenCalledTimes(2);
  });

  it('returns null from getShowTracking for anonymous users without reading Firestore', async () => {
    mockIsAnonymous = true;

    const result = await episodeTrackingService.getShowTracking(123);

    expect(result).toBeNull();
    expect(getDoc).not.toHaveBeenCalled();
  });

  it('normalizes sparse Firestore docs when loading a show tracking document', async () => {
    const watchedAtMs = new Date('2026-03-07T12:00:00Z').getTime();
    const lastUpdatedMs = new Date('2026-03-08T09:30:00Z').getTime();

    (getDoc as jest.Mock).mockResolvedValue({
      data: () => ({
        metadata: {
          lastUpdated: {
            toDate: () => new Date(lastUpdatedMs),
          },
          tvShowName: 'Sparse Show',
        },
        episodes: {
          '2_3': {
            watchedAt: {
              toMillis: () => watchedAtMs,
            },
          },
        },
      }),
      exists: () => true,
      id: '700',
    });

    const result = await episodeTrackingService.getShowTracking(700);

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

  it('normalizes all watched shows when loading the episode tracking collection', async () => {
    const watchedAtMs = new Date('2026-03-09T14:00:00Z').getTime();

    (getDocs as jest.Mock).mockResolvedValue({
      docs: [
        {
          data: () => ({
            metadata: {
              tvShowName: 'Collection Show',
            },
            episodes: {
              '1_1': {
                watchedAt: {
                  toMillis: () => watchedAtMs,
                },
              },
            },
          }),
          id: '999',
        },
      ],
      size: 1,
    });

    const result = await episodeTrackingService.getAllWatchedShows('test-user-id');

    expect(result).toEqual([
      {
        metadata: {
          tvShowName: 'Collection Show',
          posterPath: null,
          lastUpdated: watchedAtMs,
        },
        episodes: {
          '1_1': {
            episodeId: 0,
            tvShowId: 999,
            seasonNumber: 1,
            episodeNumber: 1,
            watchedAt: watchedAtMs,
            episodeName: 'Episode 1',
            episodeAirDate: null,
          },
        },
      },
    ]);
  });
});

describe('markMultipleEpisodesUnwatched', () => {
  const makeEpisode = (seasonNumber: number, episodeNumber: number) =>
    ({
      id: seasonNumber * 100 + episodeNumber,
      name: `S${seasonNumber} E${episodeNumber}`,
      episode_number: episodeNumber,
      season_number: seasonNumber,
      air_date: '2024-01-01',
    }) as any;

  const makeFlatList = (seasonNumber: number, count: number, startAt = 1) =>
    Array.from({ length: count }, (_, i) => ({
      seasonNumber,
      episode: makeEpisode(seasonNumber, startAt + i),
    }));

  beforeEach(() => {
    (getDoc as jest.Mock).mockResolvedValue({ exists: () => true });
  });

  it('chunks N episodes into ceil(N/batchSize) updateDoc calls with cumulative progress', async () => {
    const episodesToUnmark = [...makeFlatList(1, 15), ...makeFlatList(2, 10)];
    const onProgress = jest.fn();

    const result = await episodeTrackingService.markMultipleEpisodesUnwatched(123, episodesToUnmark, {
      batchSize: 10,
      delayMs: 0,
      onProgress,
    });

    expect(result).toEqual({ unmarkedCount: 25, wasCancelled: false });
    expect(updateDoc).toHaveBeenCalledTimes(3);
    expect(onProgress.mock.calls).toEqual([
      [10, 25],
      [20, 25],
      [25, 25],
    ]);
  });

  it('writes a season-boundary-straddling chunk in a single updateDoc call', async () => {
    // Season 1 contributes 7 episodes, season 2 fills the rest of the 10-episode chunk.
    const episodesToUnmark = [...makeFlatList(1, 7), ...makeFlatList(2, 5)];

    await episodeTrackingService.markMultipleEpisodesUnwatched(123, episodesToUnmark, {
      batchSize: 10,
      delayMs: 0,
    });

    expect(updateDoc).toHaveBeenCalledTimes(2);
    const firstPayload = (updateDoc as jest.Mock).mock.calls[0][1];
    const deleteKeys = Object.keys(firstPayload).filter((k) => k !== 'metadata.lastUpdated');
    expect(deleteKeys.sort()).toEqual(
      ['1_1', '1_2', '1_3', '1_4', '1_5', '1_6', '1_7', '2_1', '2_2', '2_3']
        .map((k) => `episodes.${k}`)
        .sort()
    );
    expect(deleteKeys).toHaveLength(10);
    expect(typeof firstPayload['metadata.lastUpdated']).toBe('number');
  });

  it('stops before the next chunk when cancelled and keeps prior chunks committed', async () => {
    const episodesToUnmark = makeFlatList(1, 25);
    let calls = 0;

    const result = await episodeTrackingService.markMultipleEpisodesUnwatched(123, episodesToUnmark, {
      batchSize: 10,
      delayMs: 0,
      isCancelled: () => calls > 0,
      onProgress: () => {
        calls += 1;
      },
    });

    expect(result).toEqual({ unmarkedCount: 10, wasCancelled: true });
    expect(updateDoc).toHaveBeenCalledTimes(1);
  });

  it('throws fail-fast on a chunk error without attempting later chunks', async () => {
    const episodesToUnmark = makeFlatList(1, 25);
    (updateDoc as jest.Mock).mockRejectedValueOnce(new Error('chunk failed'));

    await expect(
      episodeTrackingService.markMultipleEpisodesUnwatched(123, episodesToUnmark, {
        batchSize: 10,
        delayMs: 0,
      })
    ).rejects.toThrow('chunk failed');
    expect(updateDoc).toHaveBeenCalledTimes(1);
  });

  it('does not write when the tracking document does not exist', async () => {
    (getDoc as jest.Mock).mockResolvedValue({ exists: () => false });

    const result = await episodeTrackingService.markMultipleEpisodesUnwatched(
      123,
      makeFlatList(1, 5),
      { batchSize: 10, delayMs: 0 }
    );

    expect(result).toEqual({ unmarkedCount: 0, wasCancelled: false });
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('returns zero counts without reading Firestore for an empty list', async () => {
    const result = await episodeTrackingService.markMultipleEpisodesUnwatched(123, [], {
      batchSize: 10,
      delayMs: 0,
    });

    expect(result).toEqual({ unmarkedCount: 0, wasCancelled: false });
    expect(getDoc).not.toHaveBeenCalled();
    expect(updateDoc).not.toHaveBeenCalled();
  });
});
