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

export const POLAR_CANCELLED_STATE = 'CANCELLED';
export const POLAR_SUBSCRIPTION_ACTIVE_REASON = 'POLAR_SUBSCRIPTION_ACTIVE';

export interface PremiumForDeletionCheck {
  isPremium?: boolean | null;
  provider?: string | null;
  subscriptionState?: string | null;
}

export function isPolarDeleteBlocked(
  premium?: PremiumForDeletionCheck | null
): boolean {
  if (!premium) {
    return false;
  }
  if (premium.provider !== 'polar') {
    return false;
  }
  if (premium.isPremium !== true) {
    return false;
  }
  return premium.subscriptionState !== POLAR_CANCELLED_STATE;
}

const QUERY_DELETE_BATCH_SIZE = 250;

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

async function deleteTraktOAuthStatesForUser(userId: string): Promise<void> {
  const db = admin.firestore();

  while (true) {
    const snapshot = await db
      .collection('traktOAuthStates')
      .where('userId', '==', userId)
      .limit(QUERY_DELETE_BATCH_SIZE)
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
}

async function deleteFirestoreUserTree(userId: string): Promise<void> {
  const db = admin.firestore();
  const userRef = db.collection('users').doc(userId);
  await db.recursiveDelete(userRef);
  await deleteRevenueCatWebhookEventsForUser(userId);
  await deleteTraktOAuthStatesForUser(userId);
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

  const userSnap = await admin.firestore().collection('users').doc(userId).get();
  const premium = (userSnap.data()?.premium ?? null) as PremiumForDeletionCheck | null;
  if (isPolarDeleteBlocked(premium)) {
    throw new HttpsError(
      'failed-precondition',
      'Active Polar subscription must be cancelled before account deletion',
      { reason: POLAR_SUBSCRIPTION_ACTIVE_REASON }
    );
  }

  // Accepted race (tree delete -> Auth delete): short and bounded by the callable timeout; a late
  // Polar event can re-create an orphan users/{uid} stub. A pre-written durable marker (can outlive a
  // failed deletion and block premium writes for a live user) and Auth-first ordering (breaks retry on
  // tree-delete failure) were both rejected.
  await deleteFirestoreUserTree(userId);
  await deleteAuthUserIfPresent(userId);

  return { success: true };
}
