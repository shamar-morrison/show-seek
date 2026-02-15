import { tmdbApi } from '@/src/api/tmdb';
import { READ_OPTIMIZATION_FLAGS } from '@/src/config/readOptimization';
import { auth, db } from '@/src/firebase/config';
import { reminderService } from '@/src/services/ReminderService';
import { auditedGetDocs } from '@/src/services/firestoreReadAudit';
import { Reminder } from '@/src/types/reminder';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  doc,
  DocumentReference,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { getNextUpcomingSeason } from './seasonHelpers';

/**
 * Wrapper around setDoc with timeout protection to prevent network hangs.
 */
async function setDocWithTimeout(
  docRef: DocumentReference,
  data: Record<string, unknown>,
  timeoutMs = 10000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error('Firestore write timed out')), timeoutMs);
    setDoc(docRef, data, { merge: true })
      .then(() => resolve())
      .catch(reject)
      .finally(() => clearTimeout(timeoutId));
  });
}

const SYNC_COOLDOWN_KEY = 'lastReminderSyncTimestamp';
const SYNC_COOLDOWN_HOURS = 24;

/**
 * Check if sync is needed (24+ hours since last sync)
 */
export async function shouldSync(): Promise<boolean> {
  try {
    const lastSync = await AsyncStorage.getItem(SYNC_COOLDOWN_KEY);
    if (!lastSync) return true;

    const lastSyncTime = parseInt(lastSync, 10);
    if (Number.isNaN(lastSyncTime)) {
      return true;
    }
    const hoursSinceSync = (Date.now() - lastSyncTime) / (1000 * 60 * 60);

    return hoursSinceSync >= SYNC_COOLDOWN_HOURS;
  } catch (error) {
    console.error('[reminderSync] Error checking sync cooldown:', error);
    return true; // Sync on error to be safe
  }
}

/**
 * Sync all active reminders
 * - Fetches updated release dates from TMDB
 * - Updates Firestore with new data
 * - Reschedules notifications per reminder (via ReminderService.updateReminder)
 *
 * Note: We do NOT cancel all notifications upfront. Instead, updateReminder
 * cancels and reschedules each reminder's notification individually. This
 * ensures that if sync fails partway through, users don't lose all their
 * notifications—only successfully synced reminders are rescheduled.
 */
export async function syncReminders(): Promise<void> {
  try {
    const user = auth.currentUser;
    if (!user) return;

    console.log('[reminderSync] Starting sync...');

    const remindersRef = collection(db, 'users', user.uid, 'reminders');
    const q = query(remindersRef, where('status', '==', 'active'));
    const snapshot = await auditedGetDocs(q, {
      path: `users/${user.uid}/reminders`,
      queryKey: 'activeReminders',
      callsite: 'reminderSync.syncReminders',
    });

    const reminders: Reminder[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Reminder[];

    console.log(`[reminderSync] Found ${reminders.length} active reminders`);

    // Sync each reminder
    for (const reminder of reminders) {
      try {
        if (reminder.mediaType === 'movie') {
          const movieDetails = await tmdbApi.getMovieDetails(reminder.mediaId);

          // Case (a): No release date - cancel reminder and delete from Firestore
          if (!movieDetails.release_date) {
            console.log(`[reminderSync] No release date for movie ${reminder.mediaId}, cancelling`);
            await reminderService.cancelReminder(reminder.id, {
              localNotificationId: reminder.localNotificationId,
            });
            continue;
          }

          // Case (b): Release date changed - update Firestore, then reschedule
          if (movieDetails.release_date !== reminder.releaseDate) {
            console.log(
              `[reminderSync] Release date changed for ${reminder.title}: ${reminder.releaseDate} -> ${movieDetails.release_date}`
            );

            // Update Firestore with new release date before rescheduling
            const reminderRef = doc(db, 'users', user.uid, 'reminders', reminder.id);
            await setDocWithTimeout(reminderRef, {
              releaseDate: movieDetails.release_date,
              updatedAt: Date.now(),
            });

            // Reschedule notification with updated release date
            await reminderService.updateReminder(reminder.id, reminder.reminderTiming, {
              ...reminder,
              releaseDate: movieDetails.release_date,
            });
          }
          // Case (c): No change - reschedule to ensure notification is in sync
          else {
            await reminderService.updateReminder(reminder.id, reminder.reminderTiming, reminder);
          }
        } else if (reminder.mediaType === 'tv') {
          const tvDetails = await tmdbApi.getTVShowDetails(reminder.mediaId);

          if (reminder.tvFrequency === 'every_episode') {
            // Episode reminder: check for next episode
            const nextEpisode = tvDetails.next_episode_to_air;

            if (!nextEpisode?.air_date) {
              // No upcoming episode - cancel reminder
              console.log(`[reminderSync] No next episode for TV ${reminder.mediaId}, cancelling`);
              await reminderService.cancelReminder(reminder.id, {
                localNotificationId: reminder.localNotificationId,
              });
              continue;
            }

            // Update if episode info changed
            const currentEpisode = reminder.nextEpisode;
            if (
              !currentEpisode ||
              nextEpisode.air_date !== currentEpisode.airDate ||
              nextEpisode.episode_number !== currentEpisode.episodeNumber ||
              nextEpisode.season_number !== currentEpisode.seasonNumber
            ) {
              console.log(
                `[reminderSync] Episode changed for ${reminder.title}: S${nextEpisode.season_number}E${nextEpisode.episode_number}`
              );

              const reminderRef = doc(db, 'users', user.uid, 'reminders', reminder.id);
              await setDocWithTimeout(reminderRef, {
                releaseDate: nextEpisode.air_date,
                nextEpisode: {
                  seasonNumber: nextEpisode.season_number,
                  episodeNumber: nextEpisode.episode_number,
                  episodeName: nextEpisode.name || 'TBA',
                  airDate: nextEpisode.air_date,
                },
                updatedAt: Date.now(),
              });

              await reminderService.updateReminder(reminder.id, reminder.reminderTiming, {
                ...reminder,
                releaseDate: nextEpisode.air_date,
                nextEpisode: {
                  seasonNumber: nextEpisode.season_number,
                  episodeNumber: nextEpisode.episode_number,
                  episodeName: nextEpisode.name || 'TBA',
                  airDate: nextEpisode.air_date,
                },
              });
            } else {
              await reminderService.updateReminder(reminder.id, reminder.reminderTiming, reminder);
            }
          } else if (reminder.tvFrequency === 'season_premiere') {
            // Season premiere reminder: check seasons for next premiere
            const { nextSeasonAirDate: upcomingSeasonAirDate } = getNextUpcomingSeason(
              tvDetails.seasons
            );

            if (!upcomingSeasonAirDate) {
              // No upcoming season - cancel reminder
              console.log(
                `[reminderSync] No upcoming season for TV ${reminder.mediaId}, cancelling`
              );
              await reminderService.cancelReminder(reminder.id, {
                localNotificationId: reminder.localNotificationId,
              });
              continue;
            }

            if (upcomingSeasonAirDate !== reminder.releaseDate) {
              console.log(
                `[reminderSync] Season premiere changed for ${reminder.title}: ${reminder.releaseDate} -> ${upcomingSeasonAirDate}`
              );

              const reminderRef = doc(db, 'users', user.uid, 'reminders', reminder.id);
              await setDocWithTimeout(reminderRef, {
                releaseDate: upcomingSeasonAirDate,
                updatedAt: Date.now(),
              });

              await reminderService.updateReminder(reminder.id, reminder.reminderTiming, {
                ...reminder,
                releaseDate: upcomingSeasonAirDate,
              });
            } else {
              await reminderService.updateReminder(reminder.id, reminder.reminderTiming, reminder);
            }
          } else {
            // Unknown/missing tvFrequency - skip or log warning
            console.warn(`[reminderSync] Unknown tvFrequency for TV reminder ${reminder.id}`);
            continue;
          }
        }
      } catch (error) {
        console.error(`[reminderSync] Error syncing reminder ${reminder.id}:`, error);
        // Continue with other reminders
      }
    }

    // Update last sync timestamp
    await AsyncStorage.setItem(SYNC_COOLDOWN_KEY, Date.now().toString());
    console.log('[reminderSync] Sync complete');
  } catch (error) {
    console.error('[reminderSync] Error during sync:', error);
  }
}

/**
 * Initialize reminder sync on app launch
 * Call this from app/_layout.tsx
 */
export async function initializeReminderSync(): Promise<void> {
  if (!READ_OPTIMIZATION_FLAGS.enableStartupReminderSync) {
    console.log('[reminderSync] Startup sync disabled by read optimization flag');
    return;
  }

  const needsSync = await shouldSync();

  if (needsSync) {
    console.log('[reminderSync] Starting background sync...');
    // Use setTimeout to avoid blocking app startup
    setTimeout(() => {
      syncReminders();
    }, 2000);
  } else {
    console.log('[reminderSync] Sync not needed (within cooldown period)');
  }
}
