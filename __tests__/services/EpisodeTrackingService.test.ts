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
