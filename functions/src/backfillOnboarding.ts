import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

/**
 * Backfill legacy users with hasCompletedPersonalOnboarding = true
 * so they skip the new personalized onboarding flow.
 *
 * This is an admin-only function. Call it once after deploying
 * the new onboarding flow.
 */
export const backfillLegacyUsersOnboarding = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  // Simple admin check: only the app owner can run this
  const callerUid = request.auth.uid;
  const callerDoc = await admin.firestore().collection('users').doc(callerUid).get();
  const isAdmin = callerDoc.data()?.isAdmin === true;

  if (!isAdmin) {
    throw new HttpsError('permission-denied', 'Only admins can run this function');
  }

  const BATCH_SIZE = 500;
  const usersRef = admin.firestore().collection('users');
  let totalUpdated = 0;
  let lastDocSnapshot: admin.firestore.QueryDocumentSnapshot | null = null;

  while (true) {
    let query = usersRef.orderBy('__name__').limit(BATCH_SIZE);

    if (lastDocSnapshot) {
      query = query.startAfter(lastDocSnapshot);
    }

    const snapshot = await query.get();

    if (snapshot.empty) {
      break;
    }

    const batch = admin.firestore().batch();
    let batchCount = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();

      // Only update users who don't already have the field set
      if (data.hasCompletedPersonalOnboarding !== true) {
        batch.update(doc.ref, { hasCompletedPersonalOnboarding: true });
        batchCount++;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
      totalUpdated += batchCount;
    }

    lastDocSnapshot = snapshot.docs[snapshot.docs.length - 1];

    // If we got fewer docs than the batch size, we've reached the end
    if (snapshot.docs.length < BATCH_SIZE) {
      break;
    }
  }

  console.log(`[backfillLegacyUsersOnboarding] Updated ${totalUpdated} users`);

  return {
    success: true,
    totalUpdated,
  };
});
