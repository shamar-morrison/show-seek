let mockCreateTimeoutWithCleanup = jest.fn();
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

jest.mock('@/src/services/episodeTrackingNormalization', () => ({
  normalizeEpisodeTrackingDoc: jest.fn(),
}));

jest.mock('@/src/utils/timeout', () => ({
  createTimeoutWithCleanup: (...args: unknown[]) => mockCreateTimeoutWithCleanup(...args),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn((_db, ...segments) => ({ path: segments.join('/') })),
  setDoc: jest.fn(() => Promise.resolve()),
}));

describe('EpisodeTrackingService write operations', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockUserId = 'test-user-id';
    mockIsAnonymous = false;
    mockCreateTimeoutWithCleanup.mockImplementation(() => ({
      promise: new Promise<never>(() => {}),
      cancel: jest.fn(),
    }));
    jest.useFakeTimers().setSystemTime(new Date('2026-05-01T10:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const loadService = () =>
    require('@/src/services/EpisodeTrackingService') as typeof import('@/src/services/EpisodeTrackingService');
  const loadFirestore = () =>
    require('firebase/firestore') as typeof import('firebase/firestore');

  // Verifies markEpisodeWatched writes the exact episode key and metadata payload expected by Firestore.
  it('writes the correct Firestore payload for markEpisodeWatched', async () => {
    const { episodeTrackingService } = loadService();
    const { setDoc } = loadFirestore();

    await episodeTrackingService.markEpisodeWatched(
      321,
      2,
      5,
      {
        episodeId: 5005,
        episodeName: 'The Long Night',
        episodeAirDate: '2026-04-30',
      },
      {
        tvShowName: 'Tracked Show',
        posterPath: '/show.jpg',
      }
    );

    expect(setDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'users/test-user-id/episode_tracking/321',
      }),
      {
        episodes: {
          '2_5': {
            episodeId: 5005,
            tvShowId: 321,
            seasonNumber: 2,
            episodeNumber: 5,
            watchedAt: new Date('2026-05-01T10:00:00.000Z').getTime(),
            episodeName: 'The Long Night',
            episodeAirDate: '2026-04-30',
          },
        },
        metadata: {
          tvShowName: 'Tracked Show',
          posterPath: '/show.jpg',
          lastUpdated: new Date('2026-05-01T10:00:00.000Z').getTime(),
        },
      },
      { merge: true }
    );
  });

  // Verifies markEpisodeWatched uses a merge write with only the targeted episode key so unrelated episode data is preserved.
  it('uses merge behavior without overwriting unrelated episode entries', async () => {
    const { episodeTrackingService } = loadService();
    const { setDoc } = loadFirestore();

    await episodeTrackingService.markEpisodeWatched(
      400,
      1,
      2,
      {
        episodeId: 102,
        episodeName: 'Episode 2',
        episodeAirDate: '2026-05-01',
      },
      {
        tvShowName: 'Merge Show',
        posterPath: null,
      }
    );

    const payload = (setDoc as jest.Mock).mock.calls[0][1];

    expect(payload.episodes).toEqual({
      '1_2': expect.objectContaining({
        episodeId: 102,
        episodeNumber: 2,
      }),
    });
    expect((setDoc as jest.Mock).mock.calls[0][2]).toEqual({ merge: true });
  });

  // Verifies markEpisodeWatched surfaces write failures cleanly and does not perform any follow-up writes.
  it('surfaces markEpisodeWatched failures without partial state', async () => {
    const { episodeTrackingService } = loadService();
    const { setDoc } = loadFirestore();
    (setDoc as jest.Mock).mockRejectedValueOnce(new Error('write failed'));

    await expect(
      episodeTrackingService.markEpisodeWatched(
        200,
        1,
        1,
        {
          episodeId: 1001,
          episodeName: 'Pilot',
          episodeAirDate: '2026-05-01',
        },
        {
          tvShowName: 'Broken Show',
          posterPath: null,
        }
      )
    ).rejects.toThrow('write failed');
    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  // Verifies markAllEpisodesWatched writes a single merged batch payload for the full season.
  it('writes the correct batch payload for markAllEpisodesWatched', async () => {
    const { episodeTrackingService } = loadService();
    const { setDoc } = loadFirestore();

    await episodeTrackingService.markAllEpisodesWatched(
      555,
      3,
      [
        {
          id: 301,
          name: 'Episode 1',
          episode_number: 1,
          season_number: 3,
          air_date: '2026-05-01',
        } as any,
        {
          id: 302,
          name: 'Episode 2',
          episode_number: 2,
          season_number: 3,
          air_date: '2026-05-08',
        } as any,
      ],
      {
        tvShowName: 'Batch Show',
        posterPath: '/poster.jpg',
      }
    );

    expect(setDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'users/test-user-id/episode_tracking/555',
      }),
      {
        episodes: {
          '3_1': {
            episodeId: 301,
            tvShowId: 555,
            seasonNumber: 3,
            episodeNumber: 1,
            watchedAt: new Date('2026-05-01T10:00:00.000Z').getTime(),
            episodeName: 'Episode 1',
            episodeAirDate: '2026-05-01',
          },
          '3_2': {
            episodeId: 302,
            tvShowId: 555,
            seasonNumber: 3,
            episodeNumber: 2,
            watchedAt: new Date('2026-05-01T10:00:00.000Z').getTime(),
            episodeName: 'Episode 2',
            episodeAirDate: '2026-05-08',
          },
        },
        metadata: {
          tvShowName: 'Batch Show',
          posterPath: '/poster.jpg',
          lastUpdated: new Date('2026-05-01T10:00:00.000Z').getTime(),
        },
      },
      { merge: true }
    );
  });

  // Verifies batch write failures are bubbled up so callers can handle season-level save errors explicitly.
  it('surfaces markAllEpisodesWatched failures cleanly', async () => {
    const { episodeTrackingService } = loadService();
    const { setDoc } = loadFirestore();
    (setDoc as jest.Mock).mockRejectedValueOnce(new Error('batch failed'));

    await expect(
      episodeTrackingService.markAllEpisodesWatched(
        777,
        4,
        [
          {
            id: 401,
            name: 'Episode 1',
            episode_number: 1,
            season_number: 4,
            air_date: '2026-05-01',
          } as any,
        ],
        {
          tvShowName: 'Failing Batch',
          posterPath: null,
        }
      )
    ).rejects.toThrow('batch failed');
  });

  it('marks multiple episodes across seasons in batches of 10 with progress updates', async () => {
    const { episodeTrackingService } = loadService();
    const { setDoc } = loadFirestore();
    const onProgress = jest.fn();

    // Create 15 episodes across 2 seasons
    const episodesToMark = Array.from({ length: 15 }, (_, i) => ({
      seasonNumber: i < 8 ? 1 : 2,
      episode: {
        id: 1000 + i,
        name: `Episode ${i + 1}`,
        episode_number: (i % 8) + 1,
        season_number: i < 8 ? 1 : 2,
        air_date: '2026-05-01',
      } as any,
    }));

    const resultPromise = episodeTrackingService.markMultipleEpisodesWatched(
      999,
      episodesToMark,
      { tvShowName: 'Multi Show', posterPath: '/multi.jpg' },
      { batchSize: 10, delayMs: 300, onProgress }
    );

    // Fast-forward through delays
    await jest.advanceTimersByTimeAsync(400);
    const result = await resultPromise;

    expect(result).toEqual({ markedCount: 15, wasCancelled: false });
    expect(setDoc).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenCalledWith(10, 15);
    expect(onProgress).toHaveBeenCalledWith(15, 15);
  });

  it('stops processing when cancellation is requested without rolling back completed chunks', async () => {
    const { episodeTrackingService } = loadService();
    const { setDoc } = loadFirestore();
    const onProgress = jest.fn();
    let cancelled = false;

    const episodesToMark = Array.from({ length: 25 }, (_, i) => ({
      seasonNumber: 1,
      episode: {
        id: 2000 + i,
        name: `Episode ${i + 1}`,
        episode_number: i + 1,
        season_number: 1,
        air_date: '2026-05-01',
      } as any,
    }));

    const resultPromise = episodeTrackingService.markMultipleEpisodesWatched(
      999,
      episodesToMark,
      { tvShowName: 'Cancel Show', posterPath: null },
      {
        batchSize: 10,
        delayMs: 300,
        isCancelled: () => cancelled,
        onProgress: (count) => {
          onProgress(count);
          if (count === 10) {
            // Cancel after first chunk completes
            cancelled = true;
          }
        },
      }
    );

    await jest.advanceTimersByTimeAsync(400);
    const result = await resultPromise;

    expect(result).toEqual({ markedCount: 10, wasCancelled: true });
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(10);
  });

  it('safely falls back to default batchSize (10) and delayMs (300) on invalid inputs', async () => {
    const { episodeTrackingService } = loadService();
    const { setDoc } = loadFirestore();

    const episodesToMark = Array.from({ length: 12 }, (_, i) => ({
      seasonNumber: 1,
      episode: {
        id: 3000 + i,
        name: `Episode ${i + 1}`,
        episode_number: i + 1,
        season_number: 1,
        air_date: '2026-05-01',
      } as any,
    }));

    const resultPromise = episodeTrackingService.markMultipleEpisodesWatched(
      999,
      episodesToMark,
      { tvShowName: 'Fallback Show', posterPath: null },
      { batchSize: -5 as any, delayMs: -100 as any }
    );

    await jest.advanceTimersByTimeAsync(400);
    const result = await resultPromise;

    expect(result).toEqual({ markedCount: 12, wasCancelled: false });
    // 12 episodes batched in chunks of default 10 should produce 2 calls to setDoc
    expect(setDoc).toHaveBeenCalledTimes(2);
  });
});


