/**
 * Language storage utility.
 * Stores language preference in AsyncStorage for all users (guests and logged-in).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const LANGUAGE_KEY = 'showseek_language';
const DEFAULT_LANGUAGE = 'en-US';

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
