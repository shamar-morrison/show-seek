import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { google } from 'googleapis';

admin.initializeApp();

export const validatePurchase = onCall(async (request) => {
  // Verify user is authenticated
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { purchaseToken, productId } = request.data;
  const userId = request.auth.uid;

  if (!purchaseToken || !productId) {
    throw new HttpsError('invalid-argument', 'Missing purchaseToken or productId');
  }

  try {
    // Initialize Google Play Developer API
    // Note: This requires a service account key file to be present in the functions directory
    // or configured via Google Application Credentials environment variable.
    const auth = new google.auth.GoogleAuth({
      keyFile: './service-account-key.json', // Ensure this file is added by the user
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });

    const androidPublisher = google.androidpublisher({
      version: 'v3',
      auth: auth,
    });

    // Validate the purchase with Google
    const response = await androidPublisher.purchases.products.get({
      packageName: 'app.horizon.showseek', // Replace with actual package name if different
      productId: productId,
      token: purchaseToken,
    });

    // Check if purchase is valid
    // purchaseState: 0=Purchased, 1=Canceled, 2=Pending
    if (response.data.purchaseState === 0) {
      // Update user's premium status in Firestore
      await admin.firestore().collection('users').doc(userId).update({
        'premium.isPremium': true,
        'premium.purchaseDate': admin.firestore.FieldValue.serverTimestamp(),
        'premium.purchaseToken': purchaseToken,
        'premium.productId': productId,
        'premium.orderId': response.data.orderId,
      });

      return { success: true, isPremium: true };
    } else {
      throw new HttpsError(
        'invalid-argument',
        'Invalid purchase state: ' + response.data.purchaseState
      );
    }
  } catch (error) {
    console.error('Purchase validation error:', error);
    throw new HttpsError('internal', 'Failed to validate purchase');
  }
});
