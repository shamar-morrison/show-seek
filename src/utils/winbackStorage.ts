import { db } from '@/src/firebase/config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

export const getWinbackStorageKey = (userId: string): string =>
  `hasSeenPaywallWinback:${userId}`;

/** Tier 1: In-memory session cache to avoid repeated asynchronous reads */
const winbackSeenSessionCache = new Map<string, boolean>();

/** Reset session cache (useful in tests and on user switch) */
export const clearWinbackStorageCacheForTesting = (): void => {
  winbackSeenSessionCache.clear();
};

/**
 * Reads whether the user has already seen the paywall win-back offer.
 * Follows a 3-tier hierarchy:
 * 1. In-memory session cache (instant)
 * 2. AsyncStorage local cache
 * 3. Firestore user document (reconciliation on fresh install)
 */
export const readHasSeenPaywallWinback = async (
  userId?: string | null
): Promise<boolean> => {
  if (!userId) {
    return false;
  }

  // Tier 1: In-memory session cache
  if (winbackSeenSessionCache.has(userId)) {
    return winbackSeenSessionCache.get(userId) === true;
  }

  // Tier 2: AsyncStorage cache
  try {
    const cachedValue = await AsyncStorage.getItem(getWinbackStorageKey(userId));
    if (cachedValue === 'true') {
      winbackSeenSessionCache.set(userId, true);
      return true;
    }
  } catch (error) {
    console.warn('[WinbackStorage] Failed to read AsyncStorage cache:', error);
  }

  // Tier 3: Firestore user document reconciliation
  try {
    const userDocRef = doc(db, 'users', userId);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap && typeof userDocSnap.exists === 'function' && userDocSnap.exists()) {
      const data = userDocSnap.data() as Record<string, unknown> | undefined;
      const hasSeen = data?.hasSeenPaywallWinback === true;

      if (hasSeen) {
        winbackSeenSessionCache.set(userId, true);
        try {
          await AsyncStorage.setItem(getWinbackStorageKey(userId), 'true');
        } catch (storageError) {
          console.warn(
            '[WinbackStorage] Failed to persist Firestore state to AsyncStorage:',
            storageError
          );
        }
        return true;
      }
    }
  } catch (error) {
    console.warn('[WinbackStorage] Failed to fetch Firestore user doc:', error);
  }

  winbackSeenSessionCache.set(userId, false);
  return false;
};

/**
 * Marks the win-back offer as seen for the specified user.
 * 1. Updates in-memory session cache immediately.
 * 2. Writes to AsyncStorage synchronously before any exit action.
 * 3. Dispatches fire-and-forget sync to Firestore user document with merge.
 */
export const markHasSeenPaywallWinback = async (
  userId?: string | null
): Promise<void> => {
  if (!userId) {
    return;
  }

  // 1. Tier 1: In-memory cache
  winbackSeenSessionCache.set(userId, true);

  // 2. Tier 2: AsyncStorage
  try {
    await AsyncStorage.setItem(getWinbackStorageKey(userId), 'true');
  } catch (error) {
    console.warn('[WinbackStorage] Failed to write AsyncStorage flag:', error);
  }

  // 3. Tier 3: Fire-and-forget Firestore update
  try {
    void setDoc(
      doc(db, 'users', userId),
      {
        hasSeenPaywallWinback: true,
        paywallWinbackSeenAt: serverTimestamp(),
      },
      { merge: true }
    ).catch((err) => {
      console.warn('[WinbackStorage] Failed to sync hasSeenPaywallWinback to Firestore:', err);
    });
  } catch (err) {
    console.warn('[WinbackStorage] Fire-and-forget Firestore dispatch error:', err);
  }
};
