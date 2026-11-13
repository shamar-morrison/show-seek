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
  backfillRuntimes: (...args: any[]) => mockBackfillRuntimes(...args),
}));

const snapshotDoc = (id: string, data: Record<string, unknown>) => ({ id, data: () => data });

describe('HistoryService seasons in Already Watched', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-03-09T12:00:00Z'));
    mockGetSignedInUser.mockReturnValue({ uid: 'test-user-id' });
    const addedAt = new Date('2026-03-05T10:00:00Z').getTime();

    mockFetchUserCollection.mockImplementation(async (path: string[], mapFn: any) => {
      if (path[0] === 'episode_tracking') {
        return mapFn({
          docs: [
            snapshotDoc('500', {
              metadata: { tvShowName: 'Tracked Show', posterPath: null },
              episodes: {
                '1_1': {
                  episodeId: 1,
                  tvShowId: 500,
                  seasonNumber: 1,
                  episodeNumber: 1,
                  watchedAt: new Date('2026-03-03T12:00:00Z').getTime(),
                  episodeName: 'Pilot',
                  episodeAirDate: '2026-03-01',
                  runtimeMinutes: 42,
                },
              },
            }),
          ],
        });
      }
      if (path[0] === 'ratings') return mapFn({ docs: [] });
      if (path[0] === 'lists') {
        return mapFn({
          docs: [
            snapshotDoc('already-watched', {
              name: 'Already Watched',
              items: {
                'movie-101': {
                  id: 101,
                  media_type: 'movie',
                  title: 'Movie',
                  addedAt,
                  runtimeMinutes: 120,
                },
                // The show's episodes are tracked: already counted, so ignored.
                'season-500-1': {
                  id: 500,
                  media_type: 'season',
                  season_number: 1,
                  title: 'Tracked Show · Season 1',
                  addedAt,
                  runtimeMinutes: 400,
                  seasonRuntimeMinutes: 400,
                },
                // Untracked show: adds its runtime.
                'season-700-2': {
                  id: 700,
                  media_type: 'season',
                  season_number: 2,
                  title: 'Other Show · Season 2',
                  addedAt,
                  runtimeMinutes: 300,
                  seasonRuntimeMinutes: 300,
                },
                // Only an untrusted runtimeMinutes (e.g. from an older app version): counts 0
                // and is looked up as a season.
                'season-800-0': {
                  id: 800,
                  media_type: 'season',
                  season_number: 0,
                  title: 'Third Show · Specials',
                  addedAt,
                  runtimeMinutes: 117,
                },
              },
            }),
          ],
        });
      }
      return [];
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('adds season runtimes to watch time without counting seasons as watched titles', async () => {
    const result = await historyService.fetchUserHistory({}, 1);

    // 42 (episode) + 120 (movie) + 300 (untracked season).
    expect(result.totalWatchMinutes).toBe(462);
    expect(result.totalWatched).toBe(2);
    expect(result.watchedSplit).toEqual({ movies: 1, tvShows: 1, tvEpisodes: 1 });
    // Added-to-lists stats are movies / TV only.
    expect(result.totalAddedToLists).toBe(1);
    expect(result.monthlyStats[0]).toEqual(
      expect.objectContaining({ totalWatchMinutes: 462, watched: 2 })
    );

    const [, items] = mockBackfillRuntimes.mock.calls[0];
    expect(items).toEqual([
      expect.objectContaining({
        itemKey: 'season-800-0',
        mediaType: 'season',
        mediaId: 800,
        seasonNumber: 0,
      }),
    ]);
  });

  it('gives the month detail the same totals', async () => {
    const detail = await historyService.fetchMonthDetail('2026-03', {});

    expect(detail?.stats.totalWatchMinutes).toBe(462);
    expect(detail?.stats.watched).toBe(2);
    expect(detail?.stats.watchedSplit).toEqual({ movies: 1, tvShows: 1, tvEpisodes: 1 });
    const [, items] = mockBackfillRuntimes.mock.calls[0];
    expect(items.map((item: { itemKey: string }) => item.itemKey)).toEqual(['season-800-0']);
  });
});
