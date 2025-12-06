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

class ProfileService {
  /**
   * Delete all documents in a user's subcollection
   */
  private async deleteSubcollection(userId: string, subcollectionName: string): Promise<number> {
    const collectionRef = collection(db, 'users', userId, subcollectionName);
    const snapshot = await getDocs(collectionRef);

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

      await batch.commit();
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
      await deleteDoc(userDocRef);
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

      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 30000);
      });

      // Delete all Firestore data first
      await Promise.race([this.deleteAllUserData(userId), timeoutPromise]);

      // Delete the Firebase Auth account
      await Promise.race([deleteUser(user), timeoutPromise]);

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
      const message = getFirestoreErrorMessage(error);
      console.error('[ProfileService] deleteAccountWithReauth error:', error);
      throw new Error(message);
    }
  }
}

export const profileService = new ProfileService();
