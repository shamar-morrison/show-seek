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
import { Platform } from 'react-native';
import { auth, db } from '../firebase/config';
import {
  CreateReminderInput,
  NextEpisodeInfo,
  Reminder,
  ReminderMediaType,
  ReminderTiming,
  TVReminderFrequency,
} from '../types/reminder';
import { parseTmdbDate } from '../utils/dateUtils';
import { calculateNotificationTime as calculateProductionNotificationTime } from '../utils/reminderHelpers';

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

    // PRODUCTION MODE: Use shared helper to keep UI and scheduling in sync
    return calculateProductionNotificationTime(releaseDate, timing);
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
          // Android-specific: use our custom high-importance channel
          ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
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

    const release = parseTmdbDate(releaseDate);
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
  async cancelReminder(
    reminderId: string,
    opts?: { localNotificationId?: string | null }
  ): Promise<void> {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Please sign in to continue');

      const reminderRef = this.getReminderRef(user.uid, reminderId);

      let localNotificationId = opts?.localNotificationId;

      // Fallback to fetching the reminder only when caller didn't provide local notification context.
      if (localNotificationId === undefined) {
        const getDocTimeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Request timed out')), 10000);
        });

        const reminderSnap = await Promise.race([getDoc(reminderRef), getDocTimeoutPromise]);
        if (reminderSnap.exists()) {
          const reminder = reminderSnap.data() as Reminder;
          localNotificationId = reminder.localNotificationId;
        }
      }

      if (localNotificationId) {
        await Notifications.cancelScheduledNotificationAsync(localNotificationId);
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
  async updateReminder(
    reminderId: string,
    timing: ReminderTiming,
    sourceReminder?: Reminder
  ): Promise<void> {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Please sign in to continue');

      const reminderRef = this.getReminderRef(user.uid, reminderId);
      let currentReminder = sourceReminder;

      if (!currentReminder) {
        const getDocTimeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Request timed out')), 10000);
        });

        const reminderSnap = await Promise.race([getDoc(reminderRef), getDocTimeoutPromise]);

        if (!reminderSnap.exists()) {
          throw new Error('Reminder not found');
        }

        currentReminder = reminderSnap.data() as Reminder;
      }

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
   * Update arbitrary reminder details (for auto-updates)
   * carefully restricts to fields allowed by firestore rules
   */
  async updateReminderDetails(reminderId: string, updates: Partial<Reminder>): Promise<void> {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Please sign in to continue');

      const reminderRef = this.getReminderRef(user.uid, reminderId);

      // Ensure we only touch allowed fields
      const allowedUpdates: Partial<Reminder> = {};
      const allowedKeys: (keyof Reminder)[] = [
        'reminderTiming',
        'localNotificationId',
        'notificationScheduledFor',
        'status',
        'updatedAt',
        'nextEpisode',
        'releaseDate',
        'noNextEpisodeFound',
      ];

      Object.keys(updates).forEach((key) => {
        if (allowedKeys.includes(key as keyof Reminder)) {
          // @ts-ignore
          allowedUpdates[key] = updates[key];
        }
      });
      if (allowedUpdates.releaseDate || allowedUpdates.reminderTiming) {
        const getDocTimeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Request timed out')), 10000);
        });

        const reminderSnap = await Promise.race([getDoc(reminderRef), getDocTimeoutPromise]);
        if (reminderSnap.exists()) {
          const current = reminderSnap.data() as Reminder;
          const timing = allowedUpdates.reminderTiming || current.reminderTiming;
          const rDate = allowedUpdates.releaseDate || current.releaseDate;

          const newTime = this.calculateNotificationTime(rDate, timing);
          allowedUpdates.notificationScheduledFor = newTime;

          if (current.localNotificationId) {
            await Notifications.cancelScheduledNotificationAsync(current.localNotificationId);
          }
          const newLocalId = await this.scheduleNotification({
            ...current,
            ...allowedUpdates,
            reminderTiming: timing,
            releaseDate: rDate,
          });
          allowedUpdates.localNotificationId = newLocalId;
        }
      }

      // Always update timestamp
      allowedUpdates.updatedAt = Date.now();

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 10000);
      });

      await Promise.race([setDoc(reminderRef, allowedUpdates, { merge: true }), timeoutPromise]);
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[ReminderService] updateReminderDetails error:', error);
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
