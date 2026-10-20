import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { createHash, randomBytes } from 'node:crypto';
import {
  STREMIO_TOKEN_CACHE_MAX_SIZE,
  STREMIO_TOKEN_CACHE_TTL_MS,
  STREMIO_TOKEN_COLLECTION,
  STREMIO_TOKEN_CREATE_COOLDOWN_MS,
} from './constants';

const tokenCache = new Map<string, { uid: string; expiresAt: number }>();

export const hashAddonToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export const clearStremioTokenCache = (): void => tokenCache.clear();

export const evictStremioToken = (hash: string): void => {
  tokenCache.delete(hash);
};

export const hasActiveAddonToken = (
  userData: FirebaseFirestore.DocumentData | undefined,
  hash: string
): boolean => userData?.stremioAddon?.activeTokenHash === hash;

export async function lookupAddonUid(hash: string, useCache = true): Promise<string | null> {
  const now = Date.now();
  const cached = tokenCache.get(hash);
  if (useCache && cached && cached.expiresAt > now) return cached.uid;
  tokenCache.delete(hash);

  const snapshot = await admin.firestore().collection(STREMIO_TOKEN_COLLECTION).doc(hash).get();
  const data = snapshot.data();
  if (!snapshot.exists || !data || 'revokedAt' in data || typeof data.uid !== 'string' || !data.uid) {
    return null;
  }

  if (useCache) {
    for (const [key, entry] of tokenCache) {
      if (entry.expiresAt <= now) tokenCache.delete(key);
    }
    if (tokenCache.size >= STREMIO_TOKEN_CACHE_MAX_SIZE) {
      const oldest = tokenCache.keys().next().value;
      if (oldest !== undefined) tokenCache.delete(oldest);
    }
    tokenCache.set(hash, { uid: data.uid, expiresAt: now + STREMIO_TOKEN_CACHE_TTL_MS });
  }
  return data.uid;
}

export async function issueAddonToken(uid: string, projectId: string): Promise<{ installUrl: string }> {
  if (!/^[a-z][a-z0-9-]*$/.test(projectId)) {
    throw new HttpsError('failed-precondition', 'The Functions project ID is not configured.');
  }
  const token = randomBytes(32).toString('hex');
  const hash = hashAddonToken(token);
  const db = admin.firestore();
  const userRef = db.collection('users').doc(uid);
  const nowMs = Date.now();
  const now = Timestamp.fromMillis(nowMs);

  const oldHash = await db.runTransaction(async (transaction) => {
    const user = await transaction.get(userRef);
    if (!user.exists) throw new HttpsError('failed-precondition', 'A ShowSeek account is required.');
    const state = user.data()?.stremioAddon;
    if (state?.nextCreateAllowedAt instanceof Timestamp && state.nextCreateAllowedAt.toMillis() > nowMs) {
      throw new HttpsError('resource-exhausted', 'Please wait before creating another addon token.', {
        nextAllowedAt: state.nextCreateAllowedAt.toDate().toISOString(),
      });
    }
    const previousHash = typeof state?.activeTokenHash === 'string' ? state.activeTokenHash : null;
    const previousRef = previousHash ? db.collection(STREMIO_TOKEN_COLLECTION).doc(previousHash) : null;
    const previous = previousRef ? await transaction.get(previousRef) : null;

    if (previousRef && previous?.exists) transaction.update(previousRef, { revokedAt: now });
    transaction.create(db.collection(STREMIO_TOKEN_COLLECTION).doc(hash), { uid, createdAt: now });
    transaction.set(userRef, {
      stremioAddon: {
        activeTokenHash: hash,
        nextCreateAllowedAt: Timestamp.fromMillis(nowMs + STREMIO_TOKEN_CREATE_COOLDOWN_MS),
      },
    }, { merge: true });
    return previousHash;
  });

  if (oldHash) evictStremioToken(oldHash);
  // Raw tokens are returned once, never persisted or included in application logs.
  return { installUrl: `https://us-central1-${projectId}.cloudfunctions.net/stremioAddon/${token}/manifest.json` };
}

export async function revokeAddonToken(uid: string): Promise<{ success: true }> {
  const db = admin.firestore();
  const userRef = db.collection('users').doc(uid);
  const oldHash = await db.runTransaction(async (transaction) => {
    const user = await transaction.get(userRef);
    if (!user.exists) throw new HttpsError('failed-precondition', 'A ShowSeek account is required.');
    const hash = user.data()?.stremioAddon?.activeTokenHash;
    if (typeof hash !== 'string') return null;
    const tokenRef = db.collection(STREMIO_TOKEN_COLLECTION).doc(hash);
    const token = await transaction.get(tokenRef);
    if (token.exists && !('revokedAt' in (token.data() ?? {}))) {
      transaction.update(tokenRef, { revokedAt: Timestamp.now() });
    }
    transaction.set(userRef, { stremioAddon: { activeTokenHash: null } }, { merge: true });
    return hash;
  });
  if (oldHash) evictStremioToken(oldHash);
  return { success: true };
}
