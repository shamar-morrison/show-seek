import { historyService } from '@/src/services/HistoryService';

const mockFetchUserCollection = jest.fn();

jest.mock('@/src/services/firestoreHelpers', () => ({
  fetchUserCollection: (...args: any[]) => mockFetchUserCollection(...args),
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
});
