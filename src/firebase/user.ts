/**
 * User document management for Firestore
 */

import { db } from '@/src/firebase/config';
import { User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

export interface UserDocument {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  createdAt: any; // Firebase Timestamp
}

/**
 * Create or update a user document in Firestore
 * Idempotent - safe to call on every sign-in
 *
 * @param user - Firebase Auth User object
 */
export async function createUserDocument(user: User): Promise<void> {
  if (!user || user.isAnonymous) {
    return; // Don't create documents for anonymous users
  }

  const userRef = doc(db, 'users', user.uid);

  try {
    // Check if document already exists
    const existingDoc = await getDoc(userRef);

    if (existingDoc.exists()) {
      // Update only fields that might have changed (e.g., photoURL from Google)
      const existingData = existingDoc.data() as UserDocument;
      const updates: Partial<UserDocument> = {};

      // Update photoURL if it changed (e.g., user updated their Google profile pic)
      if (user.photoURL && user.photoURL !== existingData.photoURL) {
        updates.photoURL = user.photoURL;
      }

      // Update displayName if it changed and we have a new one
      if (user.displayName && user.displayName !== existingData.displayName) {
        updates.displayName = user.displayName;
      }

      // Only write if there are updates
      if (Object.keys(updates).length > 0) {
        await setDoc(userRef, updates, { merge: true });
      }
    } else {
      // Create new document
      const userData: UserDocument = {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        createdAt: serverTimestamp(),
      };

      await setDoc(userRef, userData);
    }
  } catch (error) {
    console.warn('Failed to create/update user document:', error);
    // Non-critical - don't throw, user is still authenticated
  }
}
