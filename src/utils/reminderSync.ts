import { tmdbApi } from '@/src/api/tmdb';
import { auth, db } from '@/src/firebase/config';
import { reminderService } from '@/src/services/ReminderService';
import { Reminder } from '@/src/types/reminder';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, getDocs, query, where } from 'firebase/firestore';

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
    const snapshot = await getDocs(q);

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

          if (!movieDetails.release_date) {
            console.log(`[reminderSync] No release date for movie ${reminder.mediaId}, cancelling`);
            await reminderService.cancelReminder(reminder.id);
            continue;
          }

          if (movieDetails.release_date !== reminder.releaseDate) {
            console.log(`[reminderSync] Release date changed for ${reminder.title}`);
          }
          await reminderService.updateReminder(reminder.id, reminder.reminderTiming);
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
