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

function normalizeEmail(email: string | null): string {
  return email ?? '';
}

function normalizeDisplayName(displayName: string | null, email: string): string {
  const trimmedDisplayName = displayName?.trim() ?? '';
  if (trimmedDisplayName) {
    return trimmedDisplayName;
  }

  const emailPrefix = email.split('@')[0]?.trim() ?? '';
  if (emailPrefix) {
    return emailPrefix;
  }

  return 'User';
}

function normalizePhotoURL(photoURL: string | null): string | null {
  return photoURL ?? null;
}

/**
 * Create or update a user document in Firestore
 * Idempotent - safe to call on every sign-in
 *
 * @param user - Firebase Auth User object
 */
export async function createUserDocument(user: User): Promise<void> {
  if (!user) {
    return;
  }

  const userRef = doc(db, 'users', user.uid);
  const normalizedEmail = normalizeEmail(user.email);
  const normalizedDisplayName = normalizeDisplayName(user.displayName, normalizedEmail);
  const normalizedPhotoURL = normalizePhotoURL(user.photoURL);

  try {
    const existingDoc = await getDoc(userRef);

    if (existingDoc.exists()) {
      // Update only fields that might have changed (e.g., photoURL from Google)
      const existingData = existingDoc.data() as Partial<UserDocument>;
      const updates: Partial<UserDocument> = {};

      // Update photoURL if it changed (e.g., user updated their Google profile pic)
      if (normalizedPhotoURL !== (existingData.photoURL ?? null)) {
        updates.photoURL = normalizedPhotoURL;
      }

      // Update displayName if it changed (or if it was missing)
      if (normalizedDisplayName !== existingData.displayName) {
        updates.displayName = normalizedDisplayName;
      }

      // Only write if there are updates
      if (Object.keys(updates).length > 0) {
        await setDoc(userRef, updates, { merge: true });
      }
    } else {
      // Create new document
      const userData: UserDocument = {
        uid: user.uid,
        displayName: normalizedDisplayName,
        email: normalizedEmail,
        photoURL: normalizedPhotoURL,
        createdAt: serverTimestamp(),
      };

      await setDoc(userRef, userData);
    }
  } catch (error) {
    console.warn('Failed to create/update user document:', error);
    // Non-critical - don't throw, user is still authenticated
  }
}
