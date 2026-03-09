import { auditedGetDocs } from '@/src/services/firestoreReadAudit';
import { getSignedInUser } from '@/src/services/serviceSupport';
import { collection, DocumentData, QuerySnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { getFirestoreErrorMessage } from '../firebase/firestore';
import { raceWithTimeout } from '../utils/timeout';

/**
 * Options for fetchCollectionWithTimeout
 */
interface FetchCollectionOptions {
  /** Timeout in milliseconds (default: 10000) */
  timeoutMs?: number;
  /** Context for error messages (default: 'Firestore request') */
  errorContext?: string;
}

/**
 * Fetch a Firestore user subcollection with timeout and standard error handling.
 *
 * @param subcollectionPath - Path segments under `users/{uid}/...`
 * @param mapFn - Function to transform the snapshot into typed results
 * @param options - Optional configuration for timeout and error context
 * @returns The mapped results, empty array on error, or null if user not authenticated
 *
 * @example
 * ```ts
 * const ratings = await fetchUserCollection(
 *   ['ratings'],
 *   (snapshot) => snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
 *   { errorContext: 'Ratings fetch' }
 * );
 * ```
 */
export async function fetchUserCollection<T>(
  subcollectionPath: string[],
  mapFn: (snapshot: QuerySnapshot<DocumentData>) => T[],
  options?: FetchCollectionOptions
): Promise<T[] | null> {
  const user = getSignedInUser();
  if (!user) return null;

  const { timeoutMs = 10000, errorContext = 'Firestore request' } = options ?? {};

  try {
    const ref = collection(db, 'users', user.uid, ...subcollectionPath);
    const snapshot = await raceWithTimeout(
      auditedGetDocs(ref, {
        path: `users/${user.uid}/${subcollectionPath.join('/')}`,
        queryKey: subcollectionPath.join(':') || 'root',
        callsite: 'firestoreHelpers.fetchUserCollection',
      }),
      { ms: timeoutMs, message: `${errorContext} timed out` }
    );
    return mapFn(snapshot);
  } catch (error) {
    const message = getFirestoreErrorMessage(error);
    console.error(`[${errorContext}] Error:`, message);
    return [];
  }
}
