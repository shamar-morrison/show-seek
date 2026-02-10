/**
 * Accent color storage utility.
 * Uses AsyncStorage as a fast local cache and Firebase Firestore for
 * cross-device persistence. Reads are always from AsyncStorage (instant).
 * Writes go to both AsyncStorage and Firebase (fire-and-forget).
 */
import { DEFAULT_ACCENT_COLOR, isAccentColor } from '@/src/constants/accentColors';
import { auth, db } from '@/src/firebase/config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const ACCENT_COLOR_KEY = 'showseek_accent_color';

/**
 * Get the stored accent color from AsyncStorage (instant, ~1ms).
 * Returns default accent color if no preference is stored.
 */
export async function getStoredAccentColor(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(ACCENT_COLOR_KEY);
    if (stored && isAccentColor(stored)) return stored;
    return DEFAULT_ACCENT_COLOR;
  } catch (error) {
    console.error('[accentColorStorage] Error reading accent color:', error);
    return DEFAULT_ACCENT_COLOR;
  }
}

/**
 * Store the accent color preference in AsyncStorage.
 */
export async function setStoredAccentColor(color: string): Promise<void> {
  try {
    await AsyncStorage.setItem(ACCENT_COLOR_KEY, color);
  } catch (error) {
    console.error('[accentColorStorage] Error saving accent color:', error);
    throw error;
  }
}

/**
 * Sync accent color to Firebase Firestore (fire-and-forget).
 * Writes to `users/{uid}.accentColor` using merge so other fields are preserved.
 * Silently fails for guest/anonymous or unauthenticated users.
 */
export async function syncAccentColorToFirebase(color: string): Promise<void> {
  try {
    const user = auth.currentUser;
    if (!user || user.isAnonymous) return;

    const userRef = doc(db, 'users', user.uid);
    await setDoc(userRef, { accentColor: color }, { merge: true });
  } catch (error) {
    // Non-critical — local cache is the source of truth for speed
    console.error('[accentColorStorage] Firebase sync error:', error);
  }
}

/**
 * Fetch accent color from Firebase Firestore for cross-device sync.
 * Returns null if user is not authenticated, anonymous, or no color is stored.
 */
export async function fetchAccentColorFromFirebase(): Promise<string | null> {
  try {
    const user = auth.currentUser;
    if (!user || user.isAnonymous) return null;

    const userRef = doc(db, 'users', user.uid);
    const snapshot = await getDoc(userRef);

    if (snapshot.exists()) {
      const color = snapshot.data()?.accentColor;
      if (color && isAccentColor(color)) return color;
    }
    return null;
  } catch (error) {
    console.error('[accentColorStorage] Firebase fetch error:', error);
    return null;
  }
}
