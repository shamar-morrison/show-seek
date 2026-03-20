import * as admin from 'firebase-admin';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError } from 'firebase-functions/v2/https';

export const TRAKT_BACKEND_URL = defineSecret('TRAKT_BACKEND_URL');
export const TRAKT_INTERNAL_DELETE_AUTH = defineSecret('TRAKT_INTERNAL_DELETE_AUTH');

export interface DeleteAccountResponse {
  success: true;
}

interface CallableAuth {
  uid: string;
}

interface DeleteAccountRequest {
  auth?: CallableAuth | null;
}

const TRAKT_DELETE_USER_PATH = '/api/trakt/delete-user';

const trimSecret = (secretValue: string, secretName: string): string => {
  const trimmedValue = secretValue.trim();
  if (!trimmedValue) {
    throw new HttpsError('failed-precondition', `${secretName} is not configured.`);
  }
  return trimmedValue;
};

const buildTraktDeleteUrl = (baseUrl: string): string => {
  return `${baseUrl.replace(/\/+$/, '')}${TRAKT_DELETE_USER_PATH}`;
};

async function deleteTraktAccountData(userId: string): Promise<void> {
  const backendUrl = trimSecret(TRAKT_BACKEND_URL.value(), 'TRAKT_BACKEND_URL');
  const authToken = trimSecret(TRAKT_INTERNAL_DELETE_AUTH.value(), 'TRAKT_INTERNAL_DELETE_AUTH');
  const endpoint = buildTraktDeleteUrl(backendUrl);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userId }),
  });

  if (response.ok) {
    return;
  }

  let responseBody = '';
  try {
    responseBody = await response.text();
  } catch {
    responseBody = '';
  }

  throw new HttpsError(
    'internal',
    `Trakt account cleanup failed with status ${response.status}.`,
    {
      endpoint,
      responseBody: responseBody.slice(0, 500),
      status: response.status,
    }
  );
}

async function deleteRevenueCatWebhookEventsForUser(userId: string): Promise<void> {
  const db = admin.firestore();
  const snapshot = await db
    .collection('revenuecatWebhookEvents')
    .where('appUserId', '==', userId)
    .get();

  if (snapshot.empty) {
    return;
  }

  const bulkWriter = db.bulkWriter();

  snapshot.docs.forEach((documentSnapshot) => {
    bulkWriter.delete(documentSnapshot.ref);
  });

  await bulkWriter.close();
}

async function deleteFirestoreUserTree(userId: string): Promise<void> {
  const db = admin.firestore();
  const userRef = db.collection('users').doc(userId);
  await db.recursiveDelete(userRef);
  await deleteRevenueCatWebhookEventsForUser(userId);
}

async function deleteAuthUserIfPresent(userId: string): Promise<void> {
  try {
    await admin.auth().deleteUser(userId);
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === 'auth/user-not-found') {
      return;
    }
    throw error;
  }
}

export async function deleteAccountHandler(
  request: DeleteAccountRequest
): Promise<DeleteAccountResponse> {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = request.auth.uid;

  await deleteTraktAccountData(userId);
  await deleteFirestoreUserTree(userId);
  await deleteAuthUserIfPresent(userId);

  return { success: true };
}
