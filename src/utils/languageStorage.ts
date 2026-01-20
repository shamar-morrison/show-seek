/**
 * Language storage utility for guest users.
 * Guest users don't have Firestore access, so we store their language preference in AsyncStorage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const LANGUAGE_KEY = 'showseek_language';

/**
 * Get the stored language preference from AsyncStorage.
 * Returns null if no language is stored.
 */
export async function getStoredLanguage(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LANGUAGE_KEY);
  } catch (error) {
    console.error('[languageStorage] Error reading language:', error);
    return null;
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
 * Remove the stored language preference from AsyncStorage.
 */
export async function clearStoredLanguage(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LANGUAGE_KEY);
  } catch (error) {
    console.error('[languageStorage] Error clearing language:', error);
  }
}
