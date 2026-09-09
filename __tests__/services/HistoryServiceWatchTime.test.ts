import { historyService } from '@/src/services/HistoryService';

const mockFetchUserCollection = jest.fn();
const mockGetSignedInUser = jest.fn();
const mockBackfillRuntimes = jest.fn();

jest.mock('@/src/services/firestoreHelpers', () => ({
  fetchUserCollection: (...args: any[]) => mockFetchUserCollection(...args),
}));

jest.mock('@/src/services/serviceSupport', () => ({
  ...jest.requireActual('@/src/services/serviceSupport'),
  getSignedInUser: (...args: any[]) => mockGetSignedInUser(...args),
}));

jest.mock('@/src/services/WatchTimeBackfill', () => ({
  ...jest.requireActual('@/src/services/WatchTimeBackfill'),
  resolveMissingRuntimes: jest.fn(),
  backfillRuntimes: (...args: any[]) => mockBackfillRuntimes(...args),
}));

const buildSnapshotDoc = (id: string, data: Record<string, unknown>) => ({
  id,
  data: () => data,
});

describe('HistoryService watch time', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-03-09T12:00:00Z'));
    mockGetSignedInUser.mockReturnValue({ uid: 'test-user-id' });

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
                metadata: { tvShowName: 'Grouped Show', posterPath: '/grouped-show.jpg' },
                episodes: {
                  // Stamped at write time: used directly, never looked up.
                  '1_1': {
                    episodeId: 1001,
                    tvShowId: 500,
                    seasonNumber: 1,
                    episodeNumber: 1,
                    watchedAt: firstEpisodeWatchedAt,
                    episodeName: 'Pilot',
                    episodeAirDate: '2026-03-01',
                    runtimeMinutes: 42,
                  },
                  // Legacy entry: fallback (45) in the calc; backfilled in background.
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
                  // Stamped movie: 120 min used directly.
                  'movie-101': {
                    id: 101,
                    media_type: 'movie',
                    title: 'Watched Movie',
                    poster_path: '/watched-movie.jpg',
                    addedAt: watchedMovieAddedAt,
                    release_date: '2025-01-01',
                    vote_average: 7.8,
                    runtimeMinutes: 120,
                  },
                  // Legacy TV entry: episode fallback (45) in the calc.
                  'tv-600': {
                    id: 600,
                    media_type: 'tv',
                    name: 'Watched Show',
                    poster_path: '/watched-show.jpg',
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
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('computes totals deterministically from stamped values and fallbacks only', async () => {
    const result = await historyService.fetchUserHistory({}, 1);

    // 42 (stamped ep) + 45 (fallback ep) + 120 (stamped movie) + 45 (fallback tv).
    // The calc never consults TMDB resolution, so it cannot diverge by load.
    expect(result.totalWatchMinutes).toBe(252);
    expect(result.monthlyStats).toHaveLength(1);
    expect(result.monthlyStats[0]).toEqual(
      expect.objectContaining({ month: '2026-03', totalWatchMinutes: 252 })
    );
  });

  it('dispatches background backfill with exactly the unstamped entries', async () => {
    await historyService.fetchUserHistory({}, 1);

    expect(mockBackfillRuntimes).toHaveBeenCalledTimes(1);
    const [episodes, items, deps] = mockBackfillRuntimes.mock.calls[0];
    // Only the legacy 1_2 episode needs a lookup; the stamped 1_1 does not.
    expect(episodes).toEqual([
      expect.objectContaining({ tvShowId: 500, episodeKey: '1_2' }),
    ]);
    // Only the legacy tv-600 item needs a lookup; the stamped movie does not.
    expect(items).toEqual([
      expect.objectContaining({ itemKey: 'tv-600', mediaType: 'tv', mediaId: 600 }),
    ]);
    expect(typeof deps.onStampsSettled).toBe('function');
  });

  it('forwards backfill settle notifications to the caller', async () => {
    const onBackfillSettled = jest.fn();
    await historyService.fetchUserHistory({}, 1, onBackfillSettled);

    const [, , deps] = mockBackfillRuntimes.mock.calls[0];
    deps.onStampsSettled(true);

    expect(onBackfillSettled).toHaveBeenCalledWith(true);
  });

  it('produces identical totals in the overview bucket and the month detail', async () => {
    const overview = await historyService.fetchUserHistory({}, 1);
    const detail = await historyService.fetchMonthDetail('2026-03', {});

    // Same documents in, same totals out — the reported 667-vs-697 class of
    // divergence is impossible regardless of backfill timing.
    expect(detail?.stats).toEqual(
      expect.objectContaining({
        totalWatchMinutes: overview.monthlyStats[0].totalWatchMinutes,
      })
    );
    expect(detail?.stats.totalWatchMinutes).toBe(252);
  });

  it('dispatches background backfill for month detail too', async () => {
    const onBackfillSettled = jest.fn();
    await historyService.fetchMonthDetail('2026-03', {}, onBackfillSettled);

    expect(mockBackfillRuntimes).toHaveBeenCalledTimes(1);
    const [, , deps] = mockBackfillRuntimes.mock.calls[0];
    deps.onStampsSettled(false);
    expect(onBackfillSettled).toHaveBeenCalledWith(false);
  });
});
