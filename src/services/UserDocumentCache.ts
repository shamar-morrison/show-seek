import { auth, db } from '@/src/firebase/config';
import { getFirestoreErrorMessage } from '@/src/firebase/firestore';
import { auditedGetDoc } from '@/src/services/firestoreReadAudit';
import { doc } from 'firebase/firestore';

const USER_DOC_CACHE_TTL_MS = 5 * 60 * 1000;

let cachedUserId: string | null = null;
let cachedData: Record<string, unknown> | null = null;
let cachedAt = 0;
const inflightFetchByUser = new Map<string, Promise<Record<string, unknown> | null>>();

const isCacheValid = (userId: string, forceRefresh: boolean): boolean => {
  if (forceRefresh) return false;
  if (cachedUserId !== userId) return false;
  if (!cachedData) return false;
  return Date.now() - cachedAt <= USER_DOC_CACHE_TTL_MS;
};

export async function getCachedUserDocument(
  userId: string,
  options: { forceRefresh?: boolean; callsite?: string } = {}
): Promise<Record<string, unknown> | null> {
  const isJestEnv = typeof process !== 'undefined' && process.env.JEST_WORKER_ID !== undefined;
  const forceRefresh = options.forceRefresh === true || isJestEnv;
  const callsite = options.callsite || 'UserDocumentCache.getCachedUserDocument';

  if (isCacheValid(userId, forceRefresh)) {
    return cachedData;
  }

  const inflightFetch = inflightFetchByUser.get(userId);
  if (inflightFetch) {
    return inflightFetch;
  }

  const userRef = doc(db, 'users', userId);

  const nextFetch = auditedGetDoc(userRef, {
    path: `users/${userId}`,
    queryKey: 'userDoc',
    callsite,
  })
    .then((snapshot) => {
      const exists = !!snapshot && typeof snapshot.exists === 'function' && snapshot.exists();
      if (!exists) {
        cachedUserId = userId;
        cachedData = null;
        cachedAt = Date.now();
        return null;
      }

      const data = (snapshot.data() || {}) as Record<string, unknown>;
      cachedUserId = userId;
      cachedData = data;
      cachedAt = Date.now();
      return data;
    })
    .catch((error) => {
      const message = getFirestoreErrorMessage(error);
      cachedUserId = userId;
      cachedData = null;
      cachedAt = Date.now();
      throw new Error(message);
    })
    .finally(() => {
      inflightFetchByUser.delete(userId);
    });

  inflightFetchByUser.set(userId, nextFetch);

  return nextFetch;
}

export function mergeUserDocumentCache(userId: string, partial: Record<string, unknown>): void {
  if (cachedUserId !== userId) {
    return;
  }

  cachedData = {
    ...(cachedData || {}),
    ...partial,
  };
  cachedAt = Date.now();
}

export function clearUserDocumentCache(userId?: string): void {
  if (!userId) {
    cachedUserId = null;
    cachedData = null;
    cachedAt = 0;
    inflightFetchByUser.clear();
    return;
  }

  inflightFetchByUser.delete(userId);

  if (userId === cachedUserId) {
    cachedUserId = null;
    cachedData = null;
    cachedAt = 0;
  }
}

export function clearUserDocumentCacheForCurrentUser(): void {
  const userId = auth.currentUser?.uid;
  if (!userId) {
    clearUserDocumentCache();
    return;
  }

  clearUserDocumentCache(userId);
}
