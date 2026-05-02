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
});
