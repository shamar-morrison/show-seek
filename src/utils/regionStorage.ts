/**
 * Region storage utility.
 * Uses AsyncStorage as a fast local cache and Firebase Firestore for
 * cross-device persistence. Reads are always from AsyncStorage (instant).
 * Writes go to both AsyncStorage and Firebase (fire-and-forget).
 * Used for watch providers, release dates, and certifications.
 */
import { auth, db } from '@/src/firebase/config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const REGION_KEY = 'showseek_region';
const DEFAULT_REGION = 'US';

/**
 * Get the stored region preference from AsyncStorage.
 * Returns default region if no preference is stored.
 */
export async function getStoredRegion(): Promise<string> {
  try {
    const region = await AsyncStorage.getItem(REGION_KEY);
    return region ?? DEFAULT_REGION;
  } catch (error) {
    console.error('[regionStorage] Error reading region:', error);
    return DEFAULT_REGION;
  }
}

/**
 * Store the region preference in AsyncStorage.
 */
export async function setStoredRegion(region: string): Promise<void> {
  try {
    await AsyncStorage.setItem(REGION_KEY, region);
  } catch (error) {
    console.error('[regionStorage] Error saving region:', error);
    throw error;
  }
}

/**
 * Sync region to Firebase Firestore (fire-and-forget).
 * Writes to `users/{uid}.region` using merge so other fields are preserved.
 * Silently fails for guest/anonymous or unauthenticated users.
 */
export async function syncRegionToFirebase(region: string): Promise<void> {
  try {
    const user = auth.currentUser;
    if (!user || user.isAnonymous) return;

    const userRef = doc(db, 'users', user.uid);
    await setDoc(userRef, { region }, { merge: true });
  } catch (error) {
    // Non-critical — local cache is the source of truth for speed.
    console.error('[regionStorage] Firebase sync error:', error);
  }
}

/**
 * Fetch region from Firebase Firestore for cross-device sync.
 * Returns null if user is not authenticated, anonymous, or no region is stored.
 */
export async function fetchRegionFromFirebase(): Promise<string | null> {
  try {
    const user = auth.currentUser;
    if (!user || user.isAnonymous) return null;

    const userRef = doc(db, 'users', user.uid);
    const snapshot = await getDoc(userRef);

    if (snapshot.exists()) {
      const region = snapshot.data()?.region;
      if (typeof region === 'string') return region;
    }
    return null;
  } catch (error) {
    console.error('[regionStorage] Firebase fetch error:', error);
    return null;
  }
}
