import { getFirestoreErrorMessage } from '@/src/firebase/firestore';
import {
  buildPosterOverrideKey,
  POSTER_OVERRIDE_MAX_ENTRIES,
  type PosterOverrideMediaType,
} from '@/src/utils/posterOverrides';
import { createTimeoutWithCleanup } from '@/src/utils/timeout';
import { deleteField, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/src/firebase/config';

class PosterOverrideService {
  private getUserDocRef(userId: string) {
    return doc(db, 'users', userId);
  }

  async setPosterOverride(
    mediaType: PosterOverrideMediaType,
    mediaId: number,
    posterPath: string
  ): Promise<void> {
    const timeout = createTimeoutWithCleanup(10000);

    try {
      const user = auth.currentUser;
      if (!user || user.isAnonymous) {
        throw new Error('Please sign in to continue');
      }

      const key = buildPosterOverrideKey(mediaType, mediaId);
      const userDocRef = this.getUserDocRef(user.uid);
      const snapshot = await Promise.race([getDoc(userDocRef), timeout.promise]);
      const rawOverrides = snapshot.data()?.preferences?.posterOverrides;
      const overrides =
        rawOverrides && typeof rawOverrides === 'object' && !Array.isArray(rawOverrides)
          ? (rawOverrides as Record<string, unknown>)
          : {};
      const overrideCount = Object.keys(overrides).length;
      const isExistingOverride = Object.prototype.hasOwnProperty.call(overrides, key);

      if (!isExistingOverride && overrideCount >= POSTER_OVERRIDE_MAX_ENTRIES) {
        throw new Error(`You can save up to ${POSTER_OVERRIDE_MAX_ENTRIES} poster overrides`);
      }

      await Promise.race([
        setDoc(
          userDocRef,
          {
            preferences: {
              posterOverrides: {
                [key]: posterPath,
              },
            },
          },
          { merge: true }
        ),
        timeout.promise,
      ]);
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[PosterOverrideService] setPosterOverride error:', error);
      throw new Error(message);
    } finally {
      timeout.cancel();
    }
  }

  async clearPosterOverride(mediaType: PosterOverrideMediaType, mediaId: number): Promise<void> {
    const timeout = createTimeoutWithCleanup(10000);

    try {
      const user = auth.currentUser;
      if (!user || user.isAnonymous) {
        throw new Error('Please sign in to continue');
      }

      const key = buildPosterOverrideKey(mediaType, mediaId);
      const userDocRef = this.getUserDocRef(user.uid);

      await Promise.race([
        updateDoc(userDocRef, {
          [`preferences.posterOverrides.${key}`]: deleteField(),
        }),
        timeout.promise,
      ]);
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[PosterOverrideService] clearPosterOverride error:', error);
      throw new Error(message);
    } finally {
      timeout.cancel();
    }
  }
}

export const posterOverrideService = new PosterOverrideService();
