/**
 * Region storage utility.
 * Stores region preference in AsyncStorage for all users.
 * Used for watch providers, release dates, and certifications.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

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
