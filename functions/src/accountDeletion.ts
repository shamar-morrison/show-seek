import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';

export interface DeleteAccountResponse {
  success: true;
}

interface CallableAuth {
  uid: string;
}

interface DeleteAccountRequest {
  auth?: CallableAuth | null;
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

  await deleteFirestoreUserTree(userId);
  await deleteAuthUserIfPresent(userId);

  return { success: true };
}
