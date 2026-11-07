import { db, storage } from '@/src/firebase/config';
import { mergeUserDocumentCache } from '@/src/services/UserDocumentCache';
import { createTimeoutWithCleanup } from '@/src/utils/timeout';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { updateProfile, User } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, listAll, ref, uploadBytesResumable } from 'firebase/storage';

/** Matches the name limit used during onboarding. */
export const DISPLAY_NAME_MAX_LENGTH = 50;

const PROFILE_PHOTO_SIZE = 512;
const PROFILE_PHOTO_QUALITY = 0.8;

export type ProfilePhotoChange =
  | { type: 'keep' }
  | { type: 'remove' }
  | { type: 'replace'; uri: string };

const profilePhotoFolder = (userId: string) => `users/${userId}/profile`;

async function uploadProfilePhoto(userId: string, uri: string) {
  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: PROFILE_PHOTO_SIZE });
  const image = await context.renderAsync();
  const resized = await image.saveAsync({
    format: SaveFormat.JPEG,
    compress: PROFILE_PHOTO_QUALITY,
  });

  const response = await fetch(resized.uri);
  const blob = await response.blob();

  // A new name each time keeps the current photo working if the rest of the save fails.
  const path = `${profilePhotoFolder(userId)}/${Date.now()}.jpg`;
  const photoRef = ref(storage, path);
  await uploadBytesResumable(photoRef, blob, { contentType: 'image/jpeg' });

  return { path, url: await getDownloadURL(photoRef) };
}

/** Old photos only waste storage, so failing to delete them must not fail the save. */
async function deleteOtherProfilePhotos(userId: string, keepPath: string | null) {
  try {
    const { items } = await listAll(ref(storage, profilePhotoFolder(userId)));
    await Promise.all(
      items.filter((item) => item.fullPath !== keepPath).map((item) => deleteObject(item))
    );
  } catch (error) {
    console.warn('[ProfileService] Failed to clean up old profile photos:', error);
  }
}

/**
 * Updates the signed-in user's name and photo. Firebase Auth is the source of truth, and the
 * user document follows it, so a failed document write is corrected by the next sign-in sync.
 */
export async function updateUserProfile(
  user: User,
  { displayName, photo }: { displayName: string; photo: ProfilePhotoChange }
): Promise<void> {
  if (user.isAnonymous) {
    throw new Error('Guests cannot edit a profile');
  }

  const uploaded = photo.type === 'replace' ? await uploadProfilePhoto(user.uid, photo.uri) : null;
  const photoURL = uploaded ? uploaded.url : photo.type === 'remove' ? null : user.photoURL;

  await updateProfile(user, { displayName, photoURL });

  const updates = { displayName, photoURL: photoURL ?? null };
  // Firestore holds this promise open while offline, and the Auth profile has already changed.
  const timeout = createTimeoutWithCleanup();
  try {
    await Promise.race([
      setDoc(doc(db, 'users', user.uid), updates, { merge: true }),
      timeout.promise,
    ]);
    mergeUserDocumentCache(user.uid, updates);
  } catch (error) {
    console.warn('[ProfileService] Failed to update the user document:', error);
  } finally {
    timeout.cancel();
  }

  if (photo.type !== 'keep') {
    await deleteOtherProfilePhotos(user.uid, uploaded?.path ?? null);
  }
}
