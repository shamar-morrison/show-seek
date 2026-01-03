import { NativeModules, Platform } from 'react-native';

const PREFS_NAME = 'showseek_widgets';

interface SharedPreferencesModule {
  setString: (prefsName: string, key: string, value: string) => Promise<void>;
  getString: (prefsName: string, key: string) => Promise<string | null>;
}

// Native module for SharedPreferences - will be available after native code is added
const SharedPreferencesNative: SharedPreferencesModule | undefined =
  NativeModules.SharedPreferences;

/**
 * Write data to SharedPreferences for native widgets to read
 * Falls back to console.log if native module is not available
 */
export async function writeToSharedPreferences(key: string, value: any): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  const jsonValue = JSON.stringify(value);

  if (SharedPreferencesNative) {
    try {
      await SharedPreferencesNative.setString(PREFS_NAME, key, jsonValue);
    } catch (error) {
      console.warn('Failed to write to SharedPreferences:', error);
    }
  } else {
    // Log for debugging - native module not yet available
    console.log(`[Widget Data] Would write to SharedPreferences key: ${key}`);
  }
}

/**
 * Read data from SharedPreferences
 */
export async function readFromSharedPreferences<T>(key: string): Promise<T | null> {
  if (Platform.OS !== 'android') {
    return null;
  }

  if (SharedPreferencesNative) {
    try {
      const value = await SharedPreferencesNative.getString(PREFS_NAME, key);
      if (value) {
        return JSON.parse(value) as T;
      }
    } catch (error) {
      console.warn('Failed to read from SharedPreferences:', error);
    }
  }

  return null;
}
