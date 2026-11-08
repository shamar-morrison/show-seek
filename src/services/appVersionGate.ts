import { APP_COMPATIBILITY_VERSION } from '@/src/constants/appCompatibility';
import { db } from '@/src/firebase/config';
import { auditedGetDoc } from '@/src/services/firestoreReadAudit';
import { raceWithTimeout } from '@/src/utils/timeout';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc } from 'firebase/firestore';

/** Public-read document holding `minimumCompatibilityVersion` (see appCompatibility.ts). */
const APP_CONFIG_PATH = ['config', 'app'] as const;
/** Last minimum seen, so a build known to be too old stays blocked while offline. */
const LAST_MINIMUM_STORAGE_KEY = 'appVersionGate:lastMinimumCompatibilityVersion';

const parseMinimum = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;

async function readLastMinimum(): Promise<number | null> {
  try {
    const stored = await AsyncStorage.getItem(LAST_MINIMUM_STORAGE_KEY);
    return stored === null ? null : parseMinimum(Number(stored));
  } catch {
    return null;
  }
}

/**
 * The minimum compatibility version from Firestore, or the last one seen when it can't be
 * read (offline). Null when neither is known: the app is never blocked on a failed check alone.
 */
export async function fetchMinimumCompatibilityVersion(): Promise<number | null> {
  try {
    const snapshot = await raceWithTimeout(
      auditedGetDoc(doc(db, ...APP_CONFIG_PATH), {
        path: APP_CONFIG_PATH.join('/'),
        queryKey: 'appConfig',
        callsite: 'appVersionGate.fetchMinimumCompatibilityVersion',
      }),
      { ms: 8000, message: 'App config read timed out' }
    );
    const minimum = snapshot.exists()
      ? parseMinimum(snapshot.data()?.minimumCompatibilityVersion)
      : null;

    try {
      if (minimum === null) {
        await AsyncStorage.removeItem(LAST_MINIMUM_STORAGE_KEY);
      } else {
        await AsyncStorage.setItem(LAST_MINIMUM_STORAGE_KEY, String(minimum));
      }
    } catch {
      // Remembering it is best effort.
    }
    return minimum;
  } catch (error) {
    console.warn('[appVersionGate] Could not read app config; using the last known minimum.', error);
    return readLastMinimum();
  }
}

export function isBelowMinimum(
  minimum: number | null,
  current: number = APP_COMPATIBILITY_VERSION
): boolean {
  return minimum !== null && current < minimum;
}
