import { auditedGetDoc, auditedGetDocs } from '@/src/services/firestoreReadAudit';
import { trackCreateReminder } from '@/src/services/analytics';
import {
  getSignedInUser,
  requireMatchingUser,
  requireSignedInUser,
  rethrowFirestoreError,
  toFirestoreError,
} from '@/src/services/serviceSupport';
import { raceWithTimeout } from '@/src/utils/timeout';
import * as Notifications from 'expo-notifications';
import { collection, deleteDoc, doc, query, setDoc, where } from 'firebase/firestore';
import { Platform } from 'react-native';
import { db } from '../firebase/config';
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

  async getActiveReminders(userId: string): Promise<Reminder[]> {
    try {
      requireMatchingUser(userId);

      const remindersRef = this.getRemindersCollection(userId);
      const q = query(remindersRef, where('status', '==', 'active'));
      const snapshot = await raceWithTimeout(
        auditedGetDocs(q, {
          path: `users/${userId}/reminders`,
          queryKey: 'activeReminders',
          callsite: 'ReminderService.getActiveReminders',
        })
      );

      return snapshot.docs.map((reminderDoc) => ({
        id: reminderDoc.id,
        ...reminderDoc.data(),
      })) as Reminder[];
    } catch (error) {
      throw toFirestoreError(error);
    }
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
   * Resolve the best notification time to use for scheduling and persistence.
   * If the preferred reminder window has already passed but the release is still
   * current, schedule a short fallback rather than silently leaving a stale reminder.
   */
  private getEffectiveNotificationTime(
    releaseDate: string,
    timing: ReminderTiming,
    referenceNow: number = Date.now()
  ): number | null {
    const notificationTime = this.calculateNotificationTime(releaseDate, timing);

    if (notificationTime >= referenceNow) {
      return notificationTime;
    }

    if (__DEV__) {
      return notificationTime;
    }

    const release = parseTmdbDate(releaseDate);
    const releaseWindowEnd = new Date(release);
    releaseWindowEnd.setHours(23, 59, 59, 999);

    if (releaseWindowEnd.getTime() >= referenceNow) {
      return referenceNow + 60 * 1000;
    }

    return null;
  }

  private getEffectiveNotificationTiming(
    releaseDate: string,
    timing: ReminderTiming,
    referenceNow: number = Date.now()
  ): ReminderTiming | null {
    const preferredNotificationTime = this.calculateNotificationTime(releaseDate, timing);

    if (preferredNotificationTime >= referenceNow || __DEV__) {
      return timing;
    }

    const release = parseTmdbDate(releaseDate);
    const releaseWindowEnd = new Date(release);
    releaseWindowEnd.setHours(23, 59, 59, 999);

    if (releaseWindowEnd.getTime() >= referenceNow) {
      return 'on_release_day';
    }

    return null;
  }

  /**
   * Schedule a local notification
   * Returns the Expo notification identifier
   */
  private async scheduleNotification(
    reminder: CreateReminderInput | Reminder,
    notificationTimeOverride?: number | null,
    effectiveTimingOverride?: ReminderTiming | null
  ): Promise<string | null> {
    try {
      const referenceNow = Date.now();
      const notificationTime =
        notificationTimeOverride ??
        this.getEffectiveNotificationTime(
          reminder.releaseDate,
          reminder.reminderTiming,
          referenceNow
        );
      const effectiveTiming =
        effectiveTimingOverride ??
        this.getEffectiveNotificationTiming(
          reminder.releaseDate,
          reminder.reminderTiming,
          referenceNow
        );

      // Don't schedule past notifications
      if (notificationTime === null || notificationTime < referenceNow || effectiveTiming === null) {
        console.log('[ReminderService] Notification time is in the past, skipping');
        return null;
      }

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: this.getNotificationTitle(
            reminder.mediaType,
            effectiveTiming,
            'tvFrequency' in reminder ? reminder.tvFrequency : undefined
          ),
          body: this.getNotificationBody(
            reminder.title,
            reminder.mediaType,
            effectiveTiming,
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
    const today = new Date(Date.now());
    today.setHours(0, 0, 0, 0);

    return release < today;
  }

  /**
   * Create a new reminder
   */
  async createReminder(input: CreateReminderInput): Promise<void> {
    try {
      const user = requireSignedInUser();

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
      const referenceNow = Date.now();
      const notificationTime = this.getEffectiveNotificationTime(
        input.releaseDate,
        input.reminderTiming,
        referenceNow
      );
      const effectiveTiming = this.getEffectiveNotificationTiming(
        input.releaseDate,
        input.reminderTiming,
        referenceNow
      );

      // Schedule notification
      const localNotificationId = await this.scheduleNotification(
        input,
        notificationTime,
        effectiveTiming
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
        notificationScheduledFor:
          notificationTime ?? this.calculateNotificationTime(input.releaseDate, input.reminderTiming),
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

      await raceWithTimeout(setDoc(reminderRef, reminderData));
      void trackCreateReminder({
        mediaType: input.mediaType,
        reminderTiming: input.reminderTiming,
        ...(input.mediaType === 'tv' && input.tvFrequency
          ? { tvFrequency: input.tvFrequency }
          : {}),
      });
    } catch (error) {
      rethrowFirestoreError('ReminderService.createReminder', error);
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
      const user = requireSignedInUser();

      const reminderRef = this.getReminderRef(user.uid, reminderId);

      let localNotificationId = opts?.localNotificationId;

      // Fallback to fetching the reminder only when caller didn't provide local notification context.
      if (localNotificationId === undefined) {
        const reminderSnap = await raceWithTimeout(
          auditedGetDoc(reminderRef, {
            path: `users/${user.uid}/reminders/${reminderId}`,
            queryKey: 'reminderById',
            callsite: 'ReminderService.cancelReminder',
          })
        );
        if (reminderSnap.exists()) {
          const reminder = reminderSnap.data() as Reminder;
          localNotificationId = reminder.localNotificationId;
        }
      }

      if (localNotificationId) {
        await Notifications.cancelScheduledNotificationAsync(localNotificationId);
      }

      await raceWithTimeout(deleteDoc(reminderRef));
    } catch (error) {
      rethrowFirestoreError('ReminderService.cancelReminder', error);
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
      const user = requireSignedInUser();

      const reminderRef = this.getReminderRef(user.uid, reminderId);
      let currentReminder = sourceReminder;

      if (!currentReminder) {
        const reminderSnap = await raceWithTimeout(
          auditedGetDoc(reminderRef, {
            path: `users/${user.uid}/reminders/${reminderId}`,
            queryKey: 'reminderById',
            callsite: 'ReminderService.updateReminder',
          })
        );

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
      const referenceNow = Date.now();
      const notificationTime = this.getEffectiveNotificationTime(
        currentReminder.releaseDate,
        timing,
        referenceNow
      );
      const effectiveTiming = this.getEffectiveNotificationTiming(
        currentReminder.releaseDate,
        timing,
        referenceNow
      );
      const localNotificationId = await this.scheduleNotification(
        {
          ...currentReminder,
          reminderTiming: timing,
        },
        notificationTime,
        effectiveTiming
      );

      const updatedData: Partial<Reminder> = {
        reminderTiming: timing,
        notificationScheduledFor:
          notificationTime ??
          this.calculateNotificationTime(currentReminder.releaseDate, timing),
        localNotificationId,
        updatedAt: Date.now(),
      };

      await raceWithTimeout(setDoc(reminderRef, updatedData, { merge: true }));
    } catch (error) {
      rethrowFirestoreError('ReminderService.updateReminder', error);
    }
  }

  /**
   * Update arbitrary reminder details (for auto-updates)
   * carefully restricts to fields allowed by firestore rules
   */
  async updateReminderDetails(
    reminderId: string,
    updates: Partial<Reminder>
  ): Promise<Partial<Reminder>> {
    try {
      const user = requireSignedInUser();

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
        const reminderSnap = await raceWithTimeout(
          auditedGetDoc(reminderRef, {
            path: `users/${user.uid}/reminders/${reminderId}`,
            queryKey: 'reminderById',
            callsite: 'ReminderService.updateReminderDetails',
          })
        );
        if (reminderSnap.exists()) {
          const current = reminderSnap.data() as Reminder;
          const timing = allowedUpdates.reminderTiming || current.reminderTiming;
          const rDate = allowedUpdates.releaseDate || current.releaseDate;
          const referenceNow = Date.now();
          const newTime = this.getEffectiveNotificationTime(rDate, timing, referenceNow);
          const effectiveTiming = this.getEffectiveNotificationTiming(
            rDate,
            timing,
            referenceNow
          );
          allowedUpdates.notificationScheduledFor =
            newTime ?? this.calculateNotificationTime(rDate, timing);

          if (current.localNotificationId) {
            await Notifications.cancelScheduledNotificationAsync(current.localNotificationId);
          }
          const newLocalId = await this.scheduleNotification(
            {
              ...current,
              ...allowedUpdates,
              reminderTiming: timing,
              releaseDate: rDate,
            },
            newTime,
            effectiveTiming
          );
          allowedUpdates.localNotificationId = newLocalId;
        }
      }

      // Always update timestamp
      allowedUpdates.updatedAt = Date.now();

      await raceWithTimeout(setDoc(reminderRef, allowedUpdates, { merge: true }));
      return { ...allowedUpdates };
    } catch (error) {
      return rethrowFirestoreError('ReminderService.updateReminderDetails', error);
    }
  }

  /**
   * Get reminder for specific media
   */
  async getReminder(mediaType: ReminderMediaType, mediaId: number): Promise<Reminder | null> {
    try {
      const user = getSignedInUser();
      if (!user) return null;

      const reminderId = this.getReminderId(mediaType, mediaId);
      const reminderRef = this.getReminderRef(user.uid, reminderId);

      const docSnap = await raceWithTimeout(
        auditedGetDoc(reminderRef, {
          path: `users/${user.uid}/reminders/${reminderId}`,
          queryKey: 'reminderById',
          callsite: 'ReminderService.getReminder',
        })
      );

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
