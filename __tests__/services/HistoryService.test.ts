import { historyService } from '@/src/services/HistoryService';

const mockFetchUserCollection = jest.fn();
const mockGetSignedInUser = jest.fn();

jest.mock('@/src/services/firestoreHelpers', () => ({
  fetchUserCollection: (...args: any[]) => mockFetchUserCollection(...args),
}));

jest.mock('@/src/services/serviceSupport', () => ({
  ...jest.requireActual('@/src/services/serviceSupport'),
  getSignedInUser: (...args: any[]) => mockGetSignedInUser(...args),
}));

const buildSnapshotDoc = (id: string, data: Record<string, unknown>) => ({
  id,
  data: () => data,
});

describe('HistoryService', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-03-09T12:00:00Z'));
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetSignedInUser.mockReturnValue({ uid: 'test-user-id' });

    const validRatedAt = new Date('2026-03-05T15:00:00Z').getTime();

    mockFetchUserCollection.mockImplementation(
      async (
        subcollectionPath: string[],
        mapFn: (snapshot: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => unknown[]
      ) => {
        if (subcollectionPath[0] === 'episode_tracking') {
          return mapFn({ docs: [] });
        }

        if (subcollectionPath[0] === 'ratings') {
          return mapFn({
            docs: [
              buildSnapshotDoc('movie-101', {
                mediaType: 'movie',
                rating: 8,
                ratedAt: validRatedAt,
                title: 'Valid Movie',
                posterPath: null,
              }),
              buildSnapshotDoc('tv-202', {
                mediaType: 'tv',
                rating: 7,
              }),
              buildSnapshotDoc('movie-303', {
                rating: 9,
                ratedAt: validRatedAt,
              }),
            ],
          });
        }

        if (subcollectionPath[0] === 'lists') {
          return mapFn({ docs: [] });
        }

        return [];
      }
    );
  });

  afterEach(() => {
    warnSpy.mockRestore();
    jest.useRealTimers();
  });

  it('ignores invalid ratings when aggregating monthly history stats', async () => {
    const result = await historyService.fetchUserHistory({}, 1);

    expect(result.totalRated).toBe(1);
    expect(result.monthlyStats).toHaveLength(1);
    expect(result.monthlyStats[0]).toEqual(
      expect.objectContaining({
        month: '2026-03',
        rated: 1,
        averageRating: 8,
      })
    );
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('ignores invalid ratings when building month detail items', async () => {
    const detail = await historyService.fetchMonthDetail('2026-03', {});

    expect(detail).not.toBeNull();
    expect(detail?.items.rated).toHaveLength(1);
    expect(detail?.items.rated[0]).toEqual(
      expect.objectContaining({
        id: 101,
        mediaType: 'movie',
        title: 'Valid Movie',
        rating: 8,
      })
    );
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('returns null for month detail when no signed-in user is available', async () => {
    mockGetSignedInUser.mockReturnValueOnce(null);

    const detail = await historyService.fetchMonthDetail('2026-03', {});

    expect(detail).toBeNull();
  });

  it('groups watched episodes by show while keeping already-watched media rows separate', async () => {
    const firstEpisodeWatchedAt = new Date('2026-03-03T12:00:00Z').getTime();
    const secondEpisodeWatchedAt = new Date('2026-03-07T09:30:00Z').getTime();
    const watchedMovieAddedAt = new Date('2026-03-06T10:00:00Z').getTime();
    const watchedShowAddedAt = new Date('2026-03-04T08:00:00Z').getTime();

    mockFetchUserCollection.mockImplementation(
      async (
        subcollectionPath: string[],
        mapFn: (snapshot: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => unknown[]
      ) => {
        if (subcollectionPath[0] === 'episode_tracking') {
          return mapFn({
            docs: [
              buildSnapshotDoc('500', {
                metadata: {
                  tvShowName: 'Grouped Show',
                  posterPath: '/grouped-show.jpg',
                },
                episodes: {
                  '1_1': {
                    episodeId: 1001,
                    tvShowId: 500,
                    seasonNumber: 1,
                    episodeNumber: 1,
                    watchedAt: firstEpisodeWatchedAt,
                    episodeName: 'Pilot',
                    episodeAirDate: '2026-03-01',
                  },
                  '1_2': {
                    episodeId: 1002,
                    tvShowId: 500,
                    seasonNumber: 1,
                    episodeNumber: 2,
                    watchedAt: secondEpisodeWatchedAt,
                    episodeName: 'Second Episode',
                    episodeAirDate: '2026-03-02',
                  },
                },
              }),
            ],
          });
        }

        if (subcollectionPath[0] === 'ratings') {
          return mapFn({ docs: [] });
        }

        if (subcollectionPath[0] === 'lists') {
          return mapFn({
            docs: [
              buildSnapshotDoc('already-watched', {
                name: 'Already Watched',
                items: {
                  'movie-101': {
                    id: 101,
                    media_type: 'movie',
                    title: 'Watched Movie',
                    poster_path: '/watched-movie.jpg',
                    addedAt: watchedMovieAddedAt,
                    release_date: '2025-01-01',
                    vote_average: 7.8,
                  },
                  'tv-500': {
                    id: 500,
                    media_type: 'tv',
                    name: 'Grouped Show',
                    poster_path: '/grouped-show-list.jpg',
                    addedAt: watchedShowAddedAt,
                    first_air_date: '2024-01-01',
                    vote_average: 8.2,
                  },
                },
              }),
            ],
          });
        }

        return [];
      }
    );

    const detail = await historyService.fetchMonthDetail('2026-03', {});

    expect(detail).not.toBeNull();
    expect(detail?.stats.watched).toBe(4);
    expect(detail?.items.watched).toEqual([
      {
        kind: 'episode-group',
        id: 500,
        mediaType: 'tv',
        title: 'Grouped Show',
        posterPath: '/grouped-show.jpg',
        timestamp: secondEpisodeWatchedAt,
        episodeCount: 2,
      },
      {
        kind: 'media',
        id: 101,
        mediaType: 'movie',
        title: 'Watched Movie',
        posterPath: '/watched-movie.jpg',
        timestamp: watchedMovieAddedAt,
        releaseDate: '2025-01-01',
        voteAverage: 7.8,
      },
      {
        kind: 'media',
        id: 500,
        mediaType: 'tv',
        title: 'Grouped Show',
        posterPath: '/grouped-show-list.jpg',
        timestamp: watchedShowAddedAt,
        releaseDate: '2024-01-01',
        voteAverage: 8.2,
      },
    ]);
  });
});
