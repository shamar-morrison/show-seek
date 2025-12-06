import { getFirestoreErrorMessage } from '@/src/firebase/firestore';
import { FirebaseError } from 'firebase/app';
import { deleteUser, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { collection, deleteDoc, doc, getDocs, writeBatch } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

// Subcollections to delete when removing user account
const USER_SUBCOLLECTIONS = [
  'favorites',
  'watchlist',
  'ratings',
  'lists',
  'episode_tracking',
  'favorite_persons',
  'reminders',
] as const;

const FIRESTORE_TIMEOUT_MS = 25000;

class FirestoreTimeoutError extends Error {
  constructor(operation: string) {
    super(`Firestore operation timed out after ${FIRESTORE_TIMEOUT_MS / 1000}s: ${operation}`);
    this.name = 'FirestoreTimeoutError';
  }
}

/**
 * Wraps a Firestore operation with a timeout guard.
 * Rejects with a FirestoreTimeoutError if the operation exceeds the timeout.
 */
async function withTimeout<T>(promise: Promise<T>, operationName: string): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new FirestoreTimeoutError(operationName)), FIRESTORE_TIMEOUT_MS);
  });
  return Promise.race([promise, timeoutPromise]);
}

class ProfileService {
  /**
   * Delete all documents in a user's subcollection
   */
  private async deleteSubcollection(userId: string, subcollectionName: string): Promise<number> {
    const collectionRef = collection(db, 'users', userId, subcollectionName);
    const snapshot = await withTimeout(getDocs(collectionRef), `getDocs(${subcollectionName})`);

    if (snapshot.empty) {
      return 0;
    }

    // Use batched writes for better performance (max 500 operations per batch)
    const batchSize = 500;
    let deletedCount = 0;

    for (let i = 0; i < snapshot.docs.length; i += batchSize) {
      const batch = writeBatch(db);
      const chunk = snapshot.docs.slice(i, i + batchSize);

      chunk.forEach((docSnapshot) => {
        batch.delete(docSnapshot.ref);
      });

      await withTimeout(
        batch.commit(),
        `batch.commit(${subcollectionName}, batch ${Math.floor(i / batchSize) + 1})`
      );
      deletedCount += chunk.length;
    }

    return deletedCount;
  }

  /**
   * Delete all user data from Firestore
   */
  async deleteAllUserData(userId: string): Promise<void> {
    console.log('[ProfileService] Starting user data deletion for:', userId);

    for (const subcollection of USER_SUBCOLLECTIONS) {
      try {
        const count = await this.deleteSubcollection(userId, subcollection);
        console.log(`[ProfileService] Deleted ${count} documents from ${subcollection}`);
      } catch (error) {
        console.error(`[ProfileService] Error deleting ${subcollection}:`, error);
        // Continue with other subcollections even if one fails
      }
    }

    // Delete the user document itself if it exists
    try {
      const userDocRef = doc(db, 'users', userId);
      await withTimeout(deleteDoc(userDocRef), 'deleteUserDoc');
      console.log('[ProfileService] Deleted user document');
    } catch (error) {
      // User document may not exist, that's okay
      console.log('[ProfileService] User document deletion skipped (may not exist)');
    }
  }

  /**
   * Re-authenticate user with email/password
   * Required before sensitive operations like account deletion
   */
  async reauthenticateWithPassword(password: string): Promise<void> {
    const user = auth.currentUser;
    if (!user || !user.email) {
      throw new Error('No authenticated user found');
    }

    const credential = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, credential);
  }

  /**
   * Complete account deletion flow:
   * 1. Delete all Firestore data
   * 2. Delete the Firebase Auth account
   */
  async deleteAccount(): Promise<void> {
    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('No authenticated user found');
      }

      const userId = user.uid;

      // Delete all Firestore data first (each subcollection has its own 10s timeout)
      await withTimeout(this.deleteAllUserData(userId), 'deleteAllUserData');

      // Delete the Firebase Auth account
      await withTimeout(deleteUser(user), 'deleteUser');

      console.log('[ProfileService] Account deleted successfully');
    } catch (error) {
      if (error instanceof FirebaseError) {
        if (error.code === 'auth/requires-recent-login') {
          throw new Error('REQUIRES_REAUTH');
        }
      }

      const message = getFirestoreErrorMessage(error);
      console.error('[ProfileService] deleteAccount error:', error);
      throw new Error(message);
    }
  }

  /**
   * Delete account with re-authentication
   */
  async deleteAccountWithReauth(password: string): Promise<void> {
    try {
      await this.reauthenticateWithPassword(password);
      await this.deleteAccount();
    } catch (error) {
      // Preserve REQUIRES_REAUTH signal for caller
      if (error instanceof Error && error.message === 'REQUIRES_REAUTH') {
        throw error;
      }
      const message = getFirestoreErrorMessage(error);
      console.error('[ProfileService] deleteAccountWithReauth error:', error);
      throw new Error(message);
    }
  }
}

export const profileService = new ProfileService();
