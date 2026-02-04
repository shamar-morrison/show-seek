/**
 * Accent color storage utility.
 * Stores accent color preference in AsyncStorage for all users.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_ACCENT_COLOR, isAccentColor } from '@/src/constants/accentColors';

const ACCENT_COLOR_KEY = 'showseek_accent_color';

/**
 * Get the stored accent color from AsyncStorage.
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
