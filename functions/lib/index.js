"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePurchase = void 0;
const admin = require("firebase-admin");
const https_1 = require("firebase-functions/v2/https");
const googleapis_1 = require("googleapis");
admin.initializeApp();
exports.validatePurchase = (0, https_1.onCall)(async (request) => {
    // Verify user is authenticated
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { purchaseToken, productId } = request.data;
    const userId = request.auth.uid;
    if (!purchaseToken || !productId) {
        throw new https_1.HttpsError('invalid-argument', 'Missing purchaseToken or productId');
    }
    try {
        // Initialize Google Play Developer API
        // Note: This requires a service account key file to be present in the functions directory
        // or configured via Google Application Credentials environment variable.
        const auth = new googleapis_1.google.auth.GoogleAuth({
            keyFile: './service-account-key.json',
            scopes: ['https://www.googleapis.com/auth/androidpublisher'],
        });
        const androidPublisher = googleapis_1.google.androidpublisher({
            version: 'v3',
            auth: auth,
        });
        // Validate the purchase with Google
        const response = await androidPublisher.purchases.products.get({
            packageName: 'app.horizon.showseek',
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
        }
        else {
            throw new https_1.HttpsError('invalid-argument', 'Invalid purchase state: ' + response.data.purchaseState);
        }
    }
    catch (error) {
        console.error('Purchase validation error:', error);
        throw new https_1.HttpsError('internal', 'Failed to validate purchase');
    }
});
//# sourceMappingURL=index.js.map