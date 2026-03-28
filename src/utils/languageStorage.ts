/**
 * Language storage utility.
 * Uses AsyncStorage as a fast local cache and Firebase Firestore for
 * cross-device persistence. Reads are always from AsyncStorage (instant).
 * Writes go to both AsyncStorage and Firebase when requested.
 */
import {
  DEFAULT_LANGUAGE,
  isSupportedLanguageCode,
  type SupportedLanguageCode,
} from '@/src/constants/supportedLanguages';
import { db } from '@/src/firebase/config';
import { getCachedUserDocument, mergeUserDocumentCache } from '@/src/services/UserDocumentCache';
import { getSignedInUser } from '@/src/services/serviceSupport';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc } from 'firebase/firestore';

const LANGUAGE_KEY = 'showseek_language';

export interface SyncLanguageToFirebaseOptions {
  throwOnError?: boolean;
}

/**
 * Get the stored language preference from AsyncStorage.
 * Returns default language if no preference is stored.
 */
export async function getStoredLanguage(): Promise<string> {
  try {
    const language = await AsyncStorage.getItem(LANGUAGE_KEY);
    return language ?? DEFAULT_LANGUAGE;
  } catch (error) {
    console.error('[languageStorage] Error reading language:', error);
    return DEFAULT_LANGUAGE;
  }
}

/**
 * Store the language preference in AsyncStorage.
 */
export async function setStoredLanguage(language: string): Promise<void> {
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, language);
  } catch (error) {
    console.error('[languageStorage] Error saving language:', error);
    throw error;
  }
}

/**
 * Sync language to Firebase Firestore (fire-and-forget).
 * Writes to `users/{uid}.language` using merge so other fields are preserved.
 * Silently fails for unauthenticated users.
 */
export async function syncLanguageToFirebase(
  language: string,
  options: SyncLanguageToFirebaseOptions = {}
): Promise<void> {
  const { throwOnError = false } = options;

  try {
    const user = getSignedInUser();
    if (!user) return;
    if (!isSupportedLanguageCode(language)) return;

    const userRef = doc(db, 'users', user.uid);
    await setDoc(userRef, { language }, { merge: true });
    mergeUserDocumentCache(user.uid, { language });
  } catch (error) {
    console.error('[languageStorage] Firebase sync error:', error);
    if (throwOnError) {
      throw error;
    }
  }
}

/**
 * Fetch language from Firebase Firestore for cross-device sync.
 * Returns null if user is not authenticated, missing, or unsupported.
 */
export async function fetchLanguageFromFirebase(): Promise<SupportedLanguageCode | null> {
  try {
    const user = getSignedInUser();
    if (!user) return null;

    const userData = await getCachedUserDocument(user.uid, {
      callsite: 'languageStorage.fetchLanguageFromFirebase',
    });

    if (userData) {
      const language = userData.language;
      if (typeof language === 'string' && isSupportedLanguageCode(language)) {
        return language;
      }
    }

    return null;
  } catch (error) {
    console.error('[languageStorage] Firebase fetch error:', error);
    return null;
  }
}
