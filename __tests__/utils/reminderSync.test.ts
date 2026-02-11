import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDocs, setDoc } from 'firebase/firestore';

const mockGetMovieDetails = jest.fn();
const mockUpdateReminder = jest.fn();
const mockCancelReminder = jest.fn();

jest.mock('@/src/firebase/config', () => ({
  auth: {
    currentUser: { uid: 'test-user-id' },
  },
  db: {},
}));

jest.mock('@/src/api/tmdb', () => ({
  tmdbApi: {
    getMovieDetails: (...args: any[]) => mockGetMovieDetails(...args),
    getTVShowDetails: jest.fn(),
  },
}));

jest.mock('@/src/services/ReminderService', () => ({
  reminderService: {
    updateReminder: (...args: any[]) => mockUpdateReminder(...args),
    cancelReminder: (...args: any[]) => mockCancelReminder(...args),
  },
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  where: jest.fn(() => ({})),
  getDocs: jest.fn(),
  doc: jest.fn((_db, ...segments) => ({ path: segments.join('/') })),
  setDoc: jest.fn(() => Promise.resolve()),
}));

import { syncReminders } from '@/src/utils/reminderSync';

describe('reminderSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    mockUpdateReminder.mockResolvedValue(undefined);
    mockCancelReminder.mockResolvedValue(undefined);
  });

  it('passes merged reminder data to updateReminder when release date changes', async () => {
    (getDocs as jest.Mock).mockResolvedValue({
      docs: [
        {
          id: 'movie-123',
          data: () => ({
            id: 'movie-123',
            mediaType: 'movie',
            mediaId: 123,
            title: 'Test Movie',
            releaseDate: '2026-05-01',
            reminderTiming: '1_day_before',
            localNotificationId: 'local-123',
            status: 'active',
          }),
        },
      ],
    });
    mockGetMovieDetails.mockResolvedValue({ release_date: '2026-07-15' });

    await syncReminders();

    expect(setDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        releaseDate: '2026-07-15',
        updatedAt: expect.any(Number),
      }),
      { merge: true }
    );
    expect(mockUpdateReminder).toHaveBeenCalledWith(
      'movie-123',
      '1_day_before',
      expect.objectContaining({
        id: 'movie-123',
        releaseDate: '2026-07-15',
      })
    );
  });

  it('still reschedules unchanged reminders using the existing reminder snapshot', async () => {
    (getDocs as jest.Mock).mockResolvedValue({
      docs: [
        {
          id: 'movie-123',
          data: () => ({
            id: 'movie-123',
            mediaType: 'movie',
            mediaId: 123,
            title: 'Test Movie',
            releaseDate: '2026-05-01',
            reminderTiming: 'on_release_day',
            localNotificationId: 'local-123',
            status: 'active',
          }),
        },
      ],
    });
    mockGetMovieDetails.mockResolvedValue({ release_date: '2026-05-01' });

    await syncReminders();

    expect(setDoc).not.toHaveBeenCalled();
    expect(mockUpdateReminder).toHaveBeenCalledWith(
      'movie-123',
      'on_release_day',
      expect.objectContaining({
        id: 'movie-123',
        releaseDate: '2026-05-01',
      })
    );
  });
});
