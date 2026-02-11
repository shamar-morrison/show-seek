import * as Notifications from 'expo-notifications';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';

let mockUserId: string | null = 'test-user-id';

jest.mock('@/src/firebase/config', () => ({
  auth: {
    get currentUser() {
      return mockUserId ? { uid: mockUserId } : null;
    },
  },
  db: {},
}));

jest.mock('@/src/firebase/firestore', () => ({
  getFirestoreErrorMessage: jest.fn((error) => error.message || 'Unknown error'),
}));

import { reminderService } from '@/src/services/ReminderService';

describe('ReminderService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = 'test-user-id';
  });

  it('rejects creating a reminder with missing release date', async () => {
    await expect(
      reminderService.createReminder({
        mediaType: 'movie',
        mediaId: 123,
        title: 'Test Movie',
        posterPath: null,
        releaseDate: '' as any,
        reminderTiming: 'on_release_day',
      })
    ).rejects.toThrow('release date');

    expect(setDoc).not.toHaveBeenCalled();
  });

  it('rejects creating a reminder for past release dates', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-05T12:00:00Z'));

    await expect(
      reminderService.createReminder({
        mediaType: 'movie',
        mediaId: 123,
        title: 'Old Movie',
        posterPath: null,
        releaseDate: '2020-01-01',
        reminderTiming: 'on_release_day',
      })
    ).rejects.toThrow('already been released');

    expect(setDoc).not.toHaveBeenCalled();

    jest.useRealTimers();
  });

  it('rejects TV reminders without frequency', async () => {
    await expect(
      reminderService.createReminder({
        mediaType: 'tv',
        mediaId: 555,
        title: 'Test Show',
        posterPath: null,
        releaseDate: '2026-05-01',
        reminderTiming: '1_day_before',
      } as any)
    ).rejects.toThrow('Reminder frequency is required');

    expect(setDoc).not.toHaveBeenCalled();
  });

  it('cancels scheduled notifications when deleting reminders', async () => {
    const mockRef = { path: 'users/test-user-id/reminders/movie-123' };
    (doc as jest.Mock).mockReturnValue(mockRef);
    (getDoc as jest.Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({ localNotificationId: 'local-id' }),
    });
    (deleteDoc as jest.Mock).mockResolvedValue(undefined);

    await reminderService.cancelReminder('movie-123');

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('local-id');
    expect(deleteDoc).toHaveBeenCalledWith(mockRef);
  });

  it('skips getDoc when cancelReminder receives localNotificationId context', async () => {
    const mockRef = { path: 'users/test-user-id/reminders/movie-123' };
    (doc as jest.Mock).mockReturnValue(mockRef);
    (deleteDoc as jest.Mock).mockResolvedValue(undefined);

    await reminderService.cancelReminder('movie-123', { localNotificationId: 'preloaded-id' });

    expect(getDoc).not.toHaveBeenCalled();
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('preloaded-id');
    expect(deleteDoc).toHaveBeenCalledWith(mockRef);
  });

  it('skips getDoc when updateReminder receives a source reminder', async () => {
    const mockRef = { path: 'users/test-user-id/reminders/movie-123' };
    (doc as jest.Mock).mockReturnValue(mockRef);
    (setDoc as jest.Mock).mockResolvedValue(undefined);

    const sourceReminder = {
      id: 'movie-123',
      userId: 'test-user-id',
      mediaType: 'movie' as const,
      mediaId: 123,
      title: 'Test Movie',
      posterPath: null,
      releaseDate: '2026-05-01',
      reminderTiming: 'on_release_day' as const,
      notificationScheduledFor: Date.now() + 100000,
      localNotificationId: 'old-notification-id',
      status: 'active' as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await reminderService.updateReminder('movie-123', '1_day_before', sourceReminder as any);

    expect(getDoc).not.toHaveBeenCalled();
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('old-notification-id');
    expect(setDoc).toHaveBeenCalledWith(
      mockRef,
      expect.objectContaining({
        reminderTiming: '1_day_before',
        localNotificationId: 'notification-id',
        notificationScheduledFor: expect.any(Number),
        updatedAt: expect.any(Number),
      }),
      { merge: true }
    );
  });
});
