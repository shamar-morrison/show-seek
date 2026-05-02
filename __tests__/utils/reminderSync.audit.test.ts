const mockAuditedGetDocs = jest.fn();
const mockCancelReminder = jest.fn();
const mockGetMovieDetails = jest.fn();
const mockGetTVShowDetails = jest.fn();
const mockUpdateReminder = jest.fn();
let mockCurrentUser: { uid: string } | null = { uid: 'test-user-id' };
let mockEnableStartupReminderSync = true;

jest.mock('@/src/config/readOptimization', () => ({
  READ_OPTIMIZATION_FLAGS: {
    get enableStartupReminderSync() {
      return mockEnableStartupReminderSync;
    },
  },
}));

jest.mock('@/src/firebase/config', () => ({
  auth: {
    get currentUser() {
      return mockCurrentUser;
    },
  },
  db: {},
}));

jest.mock('@/src/services/firestoreReadAudit', () => ({
  auditedGetDocs: (...args: unknown[]) => mockAuditedGetDocs(...args),
}));

jest.mock('@/src/api/tmdb', () => ({
  tmdbApi: {
    getMovieDetails: (...args: unknown[]) => mockGetMovieDetails(...args),
    getTVShowDetails: (...args: unknown[]) => mockGetTVShowDetails(...args),
  },
}));

jest.mock('@/src/services/ReminderService', () => ({
  reminderService: {
    updateReminder: (...args: unknown[]) => mockUpdateReminder(...args),
    cancelReminder: (...args: unknown[]) => mockCancelReminder(...args),
  },
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  where: jest.fn(() => ({})),
  doc: jest.fn((_db, ...segments) => ({ path: segments.join('/') })),
  setDoc: jest.fn(() => Promise.resolve()),
}));

describe('reminderSync audited scenarios', () => {
  const loadAsyncStorage = () =>
    require('@react-native-async-storage/async-storage') as {
      getItem: jest.Mock;
      setItem: jest.Mock;
    };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockCurrentUser = { uid: 'test-user-id' };
    mockEnableStartupReminderSync = true;
    const asyncStorage = loadAsyncStorage();
    (asyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (asyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    mockAuditedGetDocs.mockResolvedValue({ docs: [] });
    mockUpdateReminder.mockResolvedValue(undefined);
    mockCancelReminder.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const loadModule = () => require('@/src/utils/reminderSync') as typeof import('@/src/utils/reminderSync');
  const loadFirestore = () => require('firebase/firestore') as typeof import('firebase/firestore');

  const createSnapshotDoc = (id: string, data: Record<string, unknown>) => ({
    id,
    data: () => data,
  });

  // Verifies every-episode TV reminders are rescheduled against the next episode details when TMDB exposes a future episode.
  it('updates a TV every-episode reminder when the next episode exists', async () => {
    const { syncReminders } = loadModule();
    const { setDoc } = loadFirestore();
    mockAuditedGetDocs.mockResolvedValueOnce({
      docs: [
        createSnapshotDoc('tv-44', {
          id: 'tv-44',
          mediaType: 'tv',
          mediaId: 44,
          title: 'Future Show',
          releaseDate: '2026-05-01',
          reminderTiming: '1_day_before',
          localNotificationId: 'notif-44',
          status: 'active',
          tvFrequency: 'every_episode',
          nextEpisode: {
            seasonNumber: 1,
            episodeNumber: 1,
            episodeName: 'Pilot',
            airDate: '2026-05-01',
          },
        }),
      ],
    });
    mockGetTVShowDetails.mockResolvedValueOnce({
      next_episode_to_air: {
        season_number: 1,
        episode_number: 2,
        name: 'Episode 2',
        air_date: '2026-06-01',
      },
    });

    await syncReminders();

    expect(setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'users/test-user-id/reminders/tv-44' }),
      expect.objectContaining({
        releaseDate: '2026-06-01',
        nextEpisode: {
          seasonNumber: 1,
          episodeNumber: 2,
          episodeName: 'Episode 2',
          airDate: '2026-06-01',
        },
        updatedAt: expect.any(Number),
      }),
      { merge: true }
    );
    expect(mockUpdateReminder).toHaveBeenCalledWith(
      'tv-44',
      '1_day_before',
      expect.objectContaining({
        releaseDate: '2026-06-01',
        nextEpisode: {
          seasonNumber: 1,
          episodeNumber: 2,
          episodeName: 'Episode 2',
          airDate: '2026-06-01',
        },
      })
    );
  });

  // Verifies stale every-episode reminders are cancelled when TMDB no longer reports an upcoming episode.
  it('cancels a TV every-episode reminder when no next episode exists', async () => {
    const { syncReminders } = loadModule();
    mockAuditedGetDocs.mockResolvedValueOnce({
      docs: [
        createSnapshotDoc('tv-55', {
          id: 'tv-55',
          mediaType: 'tv',
          mediaId: 55,
          title: 'Ended Show',
          releaseDate: '2026-05-01',
          reminderTiming: 'on_release_day',
          localNotificationId: 'notif-55',
          status: 'active',
          tvFrequency: 'every_episode',
        }),
      ],
    });
    mockGetTVShowDetails.mockResolvedValueOnce({
      next_episode_to_air: null,
    });

    await syncReminders();

    expect(mockCancelReminder).toHaveBeenCalledWith('tv-55', {
      localNotificationId: 'notif-55',
    });
    expect(mockUpdateReminder).not.toHaveBeenCalled();
  });

  // Verifies season-premiere reminders are cancelled when there is no next season left to watch for.
  it('cancels a TV season-premiere reminder when no next season exists', async () => {
    const { syncReminders } = loadModule();
    mockAuditedGetDocs.mockResolvedValueOnce({
      docs: [
        createSnapshotDoc('tv-66', {
          id: 'tv-66',
          mediaType: 'tv',
          mediaId: 66,
          title: 'Finished Show',
          releaseDate: '2026-05-01',
          reminderTiming: '1_week_before',
          localNotificationId: 'notif-66',
          status: 'active',
          tvFrequency: 'season_premiere',
        }),
      ],
    });
    mockGetTVShowDetails.mockResolvedValueOnce({
      seasons: [
        {
          season_number: 1,
          air_date: '2025-01-01',
        },
      ],
    });

    await syncReminders();

    expect(mockCancelReminder).toHaveBeenCalledWith('tv-66', {
      localNotificationId: 'notif-66',
    });
  });

  // Verifies one reminder failure is isolated so the rest of the reminder sync still completes.
  it('continues syncing later reminders when one reminder update fails', async () => {
    const { syncReminders } = loadModule();
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockAuditedGetDocs.mockResolvedValueOnce({
      docs: [
        createSnapshotDoc('movie-1', {
          id: 'movie-1',
          mediaType: 'movie',
          mediaId: 1,
          title: 'Broken Movie',
          releaseDate: '2026-01-01',
          reminderTiming: 'on_release_day',
          status: 'active',
        }),
        createSnapshotDoc('movie-2', {
          id: 'movie-2',
          mediaType: 'movie',
          mediaId: 2,
          title: 'Healthy Movie',
          releaseDate: '2026-02-01',
          reminderTiming: 'on_release_day',
          status: 'active',
        }),
      ],
    });
    mockGetMovieDetails
      .mockRejectedValueOnce(new Error('tmdb unavailable'))
      .mockResolvedValueOnce({ release_date: '2026-02-01' });

    await syncReminders();

    expect(mockUpdateReminder).toHaveBeenCalledTimes(1);
    expect(mockUpdateReminder).toHaveBeenCalledWith(
      'movie-2',
      'on_release_day',
      expect.objectContaining({
        id: 'movie-2',
        releaseDate: '2026-02-01',
      })
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      '[reminderSync] Error syncing reminder movie-1:',
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  // Verifies startup sync is skipped during the cooldown window so reminder refreshes do not run too often.
  it('does not schedule startup sync when the cooldown window has not expired', async () => {
    const asyncStorage = loadAsyncStorage();
    (asyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) =>
      key === 'lastReminderSyncTimestamp' ? Date.now().toString() : null
    );
    const { initializeReminderSync } = loadModule();
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    await initializeReminderSync();

    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });

  // Verifies duplicate initialization attempts only schedule one background sync while the first startup sync is pending.
  it('prevents duplicate startup sync scheduling while one is already queued', async () => {
    const { initializeReminderSync } = loadModule();
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    await initializeReminderSync();
    await initializeReminderSync();

    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
  });
});
