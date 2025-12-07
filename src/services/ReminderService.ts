import { getFirestoreErrorMessage } from '@/src/firebase/firestore';
import * as Notifications from 'expo-notifications';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import {
  CreateReminderInput,
  NextEpisodeInfo,
  Reminder,
  ReminderMediaType,
  ReminderTiming,
  TVReminderFrequency,
} from '../types/reminder';

class ReminderService {
  /**
   * Get reference to a specific reminder document
   */
  private getReminderRef(userId: string, reminderId: string) {
    return doc(db, 'users', userId, 'reminders', reminderId);
  }

  /**
   * Get reference to user's reminders collection
   */
  private getRemindersCollection(userId: string) {
    return collection(db, 'users', userId, 'reminders');
  }

  /**
   * Generate reminder document ID
   * Format: "movie-{movieId}" or "tv-{tvId}"
   * This ensures one reminder per media item (natural deduplication)
   */
  private getReminderId(mediaType: ReminderMediaType, mediaId: number): string {
    return `${mediaType}-${mediaId}`;
  }

  /**
   * Subscribe to all active reminders for current user
   */
  subscribeToUserReminders(
    callback: (reminders: Reminder[]) => void,
    onError?: (error: Error) => void
  ) {
    const user = auth.currentUser;
    if (!user) return () => {};

    const remindersRef = this.getRemindersCollection(user.uid);
    const q = query(remindersRef, where('status', '==', 'active'));

    return onSnapshot(
      q,
      (snapshot) => {
        const reminders: Reminder[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Reminder[];

        callback(reminders);
      },
      (error) => {
        console.error('[ReminderService] Subscription error:', error);
        const message = getFirestoreErrorMessage(error);
        if (onError) {
          onError(new Error(message));
        }
        callback([]);
      }
    );
  }

  /**
   * Calculate notification timestamp based on release date and user preference
   * All notifications scheduled for 9 AM EST (14:00 UTC)
   * In DEV mode: schedules for 10-30 seconds from now for testing
   */
  private calculateNotificationTime(releaseDate: string, timing: ReminderTiming): number {
    // DEV MODE: Schedule notifications for immediate testing
    if (__DEV__) {
      const now = Date.now();
      switch (timing) {
        case 'on_release_day':
          return now + 10000; // 10 seconds
        case '1_day_before':
          return now + 20000; // 20 seconds
        case '1_week_before':
          return now + 30000; // 30 seconds
      }
    }

    // PRODUCTION MODE: Normal scheduling
    const release = new Date(releaseDate);
    const notificationDate = new Date(release);

    // Apply offset based on timing preference
    if (timing === '1_day_before') {
      notificationDate.setDate(notificationDate.getDate() - 1);
    } else if (timing === '1_week_before') {
      notificationDate.setDate(notificationDate.getDate() - 7);
    }
    // 'on_release_day' uses release date as-is

    // Set to 9 AM EST (14:00 UTC)
    notificationDate.setUTCHours(14, 0, 0, 0);

    return notificationDate.getTime();
  }

  /**
   * Schedule a local notification
   * Returns the Expo notification identifier
   */
  private async scheduleNotification(
    reminder: CreateReminderInput | Reminder
  ): Promise<string | null> {
    try {
      const notificationTime = this.calculateNotificationTime(
        reminder.releaseDate,
        reminder.reminderTiming
      );

      // Don't schedule past notifications
      if (notificationTime < Date.now()) {
        console.log('[ReminderService] Notification time is in the past, skipping');
        return null;
      }

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: this.getNotificationTitle(
            reminder.mediaType,
            reminder.reminderTiming,
            'tvFrequency' in reminder ? reminder.tvFrequency : undefined
          ),
          body: this.getNotificationBody(
            reminder.title,
            reminder.mediaType,
            reminder.reminderTiming,
            'tvFrequency' in reminder ? reminder.tvFrequency : undefined,
            'nextEpisode' in reminder ? reminder.nextEpisode : undefined
          ),
          data: {
            mediaType: reminder.mediaType,
            mediaId: reminder.mediaId,
            type: 'reminder',
          },
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(notificationTime),
        },
      });

      return notificationId;
    } catch (error) {
      console.error('[ReminderService] Error scheduling notification:', error);
      return null;
    }
  }

  /**
   * Get notification title based on media type and timing
   */
  private getNotificationTitle(
    mediaType: ReminderMediaType,
    timing: ReminderTiming,
    tvFrequency?: TVReminderFrequency
  ): string {
    if (mediaType === 'tv') {
      const isEpisode = tvFrequency === 'every_episode';
      switch (timing) {
        case 'on_release_day':
          return isEpisode ? '📺 New Episode Today!' : '📺 Season Premiere Today!';
        case '1_day_before':
          return isEpisode ? '📺 New Episode Tomorrow!' : '📺 Season Premiere Tomorrow!';
        case '1_week_before':
          return isEpisode ? '📺 New Episode Next Week!' : '📺 Season Premiere Next Week!';
      }
    }
    // Movie
    switch (timing) {
      case 'on_release_day':
        return '🎬 New Release Today!';
      case '1_day_before':
        return '🎬 New Release Tomorrow!';
      case '1_week_before':
        return '🎬 New Release Next Week!';
    }
  }

  /**
   * Get notification body based on media type
   */
  private getNotificationBody(
    title: string,
    mediaType: ReminderMediaType,
    timing: ReminderTiming,
    tvFrequency?: TVReminderFrequency,
    nextEpisode?: NextEpisodeInfo
  ): string {
    if (mediaType === 'tv') {
      const isEpisode = tvFrequency === 'every_episode';
      if (isEpisode && nextEpisode) {
        const episodeInfo = `S${nextEpisode.seasonNumber}E${nextEpisode.episodeNumber}`;
        switch (timing) {
          case 'on_release_day':
            return `${title} ${episodeInfo} - "${nextEpisode.episodeName}" airs today!`;
          case '1_day_before':
            return `${title} ${episodeInfo} - "${nextEpisode.episodeName}" airs tomorrow!`;
          default:
            return `${title} ${episodeInfo} airs soon!`;
        }
      }
      // Season premiere
      switch (timing) {
        case 'on_release_day':
          return `${title} new season premieres today!`;
        case '1_day_before':
          return `${title} new season premieres tomorrow!`;
        case '1_week_before':
          return `${title} new season premieres in one week!`;
      }
    }
    // Movie
    switch (timing) {
      case 'on_release_day':
        return `${title} releases today!`;
      case '1_day_before':
        return `${title} releases tomorrow!`;
      case '1_week_before':
        return `${title} releases in one week!`;
    }
  }

  /**
   * Check if a release date is in the past
   */
  private isReleaseDateInPast(releaseDate: string): boolean {
    // In DEV mode, allow past dates for testing
    if (__DEV__) {
      return false;
    }

    const release = new Date(releaseDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return release < today;
  }

  /**
   * Create a new reminder
   */
  async createReminder(input: CreateReminderInput): Promise<void> {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Please sign in to continue');

      // Validate release date
      if (!input.releaseDate) {
        const mediaLabel = input.mediaType === 'tv' ? 'show' : 'movie';
        throw new Error(`This ${mediaLabel} does not have a release date`);
      }

      // Check if release date is in the past
      if (this.isReleaseDateInPast(input.releaseDate)) {
        const mediaLabel = input.mediaType === 'tv' ? 'show' : 'movie';
        throw new Error(`Cannot set reminder for a ${mediaLabel} that has already been released`);
      }

      // Validate tvFrequency for TV reminders
      if (input.mediaType === 'tv' && !input.tvFrequency) {
        throw new Error('Reminder frequency is required for TV shows');
      }

      const reminderId = this.getReminderId(input.mediaType, input.mediaId);
      const reminderRef = this.getReminderRef(user.uid, reminderId);

      // Schedule notification
      const localNotificationId = await this.scheduleNotification(input);

      const notificationTime = this.calculateNotificationTime(
        input.releaseDate,
        input.reminderTiming
      );

      const reminderData: Reminder = {
        id: reminderId,
        userId: user.uid,
        mediaType: input.mediaType,
        mediaId: input.mediaId,
        title: input.title,
        posterPath: input.posterPath,
        releaseDate: input.releaseDate,
        reminderTiming: input.reminderTiming,
        notificationScheduledFor: notificationTime,
        localNotificationId,
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        // TV-specific fields
        ...(input.mediaType === 'tv' && {
          tvFrequency: input.tvFrequency,
          nextEpisode: input.nextEpisode,
        }),
      };

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 10000);
      });

      await Promise.race([setDoc(reminderRef, reminderData), timeoutPromise]);
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[ReminderService] createReminder error:', error);
      throw new Error(message);
    }
  }

  /**
   * Cancel/delete a reminder
   */
  async cancelReminder(reminderId: string): Promise<void> {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Please sign in to continue');

      const reminderRef = this.getReminderRef(user.uid, reminderId);

      // Get reminder to cancel notification
      const getDocTimeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 10000);
      });

      const reminderSnap = await Promise.race([getDoc(reminderRef), getDocTimeoutPromise]);
      if (reminderSnap.exists()) {
        const reminder = reminderSnap.data() as Reminder;
        if (reminder.localNotificationId) {
          await Notifications.cancelScheduledNotificationAsync(reminder.localNotificationId);
        }
      }

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 10000);
      });

      await Promise.race([deleteDoc(reminderRef), timeoutPromise]);
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[ReminderService] cancelReminder error:', error);
      throw new Error(message);
    }
  }

  /**
   * Update reminder timing
   */
  async updateReminder(reminderId: string, timing: ReminderTiming): Promise<void> {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Please sign in to continue');

      const reminderRef = this.getReminderRef(user.uid, reminderId);

      const getDocTimeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 10000);
      });

      const reminderSnap = await Promise.race([getDoc(reminderRef), getDocTimeoutPromise]);

      if (!reminderSnap.exists()) {
        throw new Error('Reminder not found');
      }

      const currentReminder = reminderSnap.data() as Reminder;

      // Cancel old notification
      if (currentReminder.localNotificationId) {
        await Notifications.cancelScheduledNotificationAsync(currentReminder.localNotificationId);
      }

      // Schedule new notification
      const localNotificationId = await this.scheduleNotification({
        ...currentReminder,
        reminderTiming: timing,
      });

      const notificationTime = this.calculateNotificationTime(currentReminder.releaseDate, timing);

      const updatedData: Partial<Reminder> = {
        reminderTiming: timing,
        notificationScheduledFor: notificationTime,
        localNotificationId,
        updatedAt: Date.now(),
      };

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 10000);
      });

      await Promise.race([setDoc(reminderRef, updatedData, { merge: true }), timeoutPromise]);
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[ReminderService] updateReminder error:', error);
      throw new Error(message);
    }
  }

  /**
   * Get reminder for specific media
   */
  async getReminder(mediaType: ReminderMediaType, mediaId: number): Promise<Reminder | null> {
    try {
      const user = auth.currentUser;
      if (!user) return null;

      const reminderId = this.getReminderId(mediaType, mediaId);
      const reminderRef = this.getReminderRef(user.uid, reminderId);

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 10000);
      });

      const docSnap = await Promise.race([getDoc(reminderRef), timeoutPromise]);

      if (docSnap.exists()) {
        return {
          id: docSnap.id,
          ...docSnap.data(),
        } as Reminder;
      }

      return null;
    } catch (error) {
      console.error('[ReminderService] getReminder error:', error);
      return null;
    }
  }
}

export const reminderService = new ReminderService();
