# Implement One-Time Purchase Monetization for Custom Lists Feature

## Project Context

I'm building a movie/TV show tracking app in React Native/Expo with Firebase backend (Android only). The app has reminders, custom lists, and other features already working. I need to monetize the custom lists feature using a **one-time purchase** model.

## Monetization Requirements

### Free Tier Limitations

1. **Default Lists** (5 built-in lists):
   - Watching
   - Already Watched
   - Dropped
   - Favorites
   - Should Watch
   - **Limit**: Maximum 20 media items (movies/TV shows) per list

2. **Custom Lists**:
   - **Limit**: Maximum 5 custom lists
   - **Limit**: Maximum 20 media items per custom list

### Premium Tier (One-Time Purchase)

- **Price**: $5 USD (one-time payment)
- **Benefits**:
  - Unlimited custom lists
  - Unlimited media items in all lists (both default and custom)
- **Platform**: Android only (Google Play Billing)

## Implementation Tasks

### 1. Set Up react-native-iap Library for Android

- Install and configure `react-native-iap` (https://www.npmjs.com/package/react-native-iap)
- Configure for Android only (Google Play Billing Library v5+)
- Set up a **managed product** (one-time purchase) in Google Play Console:
  - Product ID: `premium_unlock` or similar
  - Product Type: Managed product (not subscription)
  - Price: $5 USD
- Implement proper initialization and connection handling
- Handle Google Play Billing connection states

### 2. Update Firebase User Schema

Add the following fields to the user document:

```typescript
{
  premium: {
    isPremium: boolean, // or another related field because we plan to add other monetization features in the future (or subscription based)
    purchaseDate: timestamp | null,
    purchaseToken: string | null, // Google Play purchase token for validation
    productId: string | null,
    orderId: string | null, // Google Play order ID
  }
}
```

### 3. Implement Server-Side Receipt Validation (CRITICAL)

**This is a must-have requirement for security.**

Create a Firebase Cloud Function to validate Google Play purchases:

```typescript
// functions/src/index.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { google } from 'googleapis';

export const validatePurchase = functions.https.onCall(async (data, context) => {
  // Verify user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { purchaseToken, productId } = data;
  const userId = context.auth.uid;

  try {
    // Initialize Google Play Developer API
    const auth = new google.auth.GoogleAuth({
      keyFile: './service-account-key.json', // Your service account key
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });

    const androidPublisher = google.androidpublisher({
      version: 'v3',
      auth: auth,
    });

    // Validate the purchase with Google
    const response = await androidPublisher.purchases.products.get({
      packageName: 'your.app.package.name', // app.horizon.showseek
      productId: productId,
      token: purchaseToken,
    });

    // Check if purchase is valid
    if (response.data.purchaseState === 0) {
      // 0 = purchased
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
      throw new functions.https.HttpsError('invalid-argument', 'Invalid purchase');
    }
  } catch (error) {
    console.error('Purchase validation error:', error);
    throw new functions.https.HttpsError('internal', 'Failed to validate purchase');
  }
});
```

**Setup Steps for Cloud Functions:**

1. Enable Cloud Functions for Firebase in your project
2. Create a service account in Google Cloud Console with "Android Publisher" API access
3. Download the service account JSON key
4. Enable the Google Play Android Developer API in Google Cloud Console
5. Link your Google Play Developer account to the Google Cloud project
6. Deploy the Cloud Function
7. Secure the function with proper authentication checks

### 4. Create Premium/Purchase Service/Context

- Create a `PremiumContext` or service to manage premium status globally
- Implement methods:
  - `checkPremiumStatus()` - Check if user has purchased premium
  - `purchasePremium()` - Initiate one-time purchase
  - `restorePurchases()` - Restore previous purchase (important for device transfers)
  - `isFeatureAvailable(feature: string)` - Check if user can access premium features
  - `validatePurchaseWithServer(purchaseToken, productId)` - Call Cloud Function for validation

### 5. Implement Purchase Flow

- Create a premium/paywall screen with:
  - Feature comparison (Free vs Premium)
  - Clear pricing information ($5 USD one-time purchase)
  - "Unlock Premium" button
  - "Restore Purchase" button (for users who already purchased)
  - Terms of service and privacy policy links
- Handle purchase states: loading, success, error, cancelled
- **After successful purchase from Google Play:**
  1. Get the purchase token from the purchase response
  2. Call your Cloud Function to validate the purchase server-side
  3. Wait for Cloud Function to update Firestore
  4. Update local state to reflect premium status
- Show appropriate feedback to user during purchase process

### 6. Implement List Restrictions Logic

Since lists are stored in a separate `lists` collection (not as a subcollection), you'll need to:

**Query Structure:**

- Lists collection should have a `userId` or `ownerId` field to identify the owner, if not just check what is currently being used and go from there.
- When checking restrictions, query: `lists` where `userId == currentUser.uid`

**Validation Functions:**

```typescript
// Check if user can add media to a specific list
async canAddToList(listId: string, userId: string): Promise<boolean> {
  const user = await getUserPremiumStatus(userId);

  if (user.premium.isPremium) {
    return true; // Premium users have no limits
  }

  // Get the list and count current items
  const list = await getList(listId);
  const currentItemCount = list.items?.length || 0;

  return currentItemCount < 20; // Free users limited to 20 items per list
}

// Check if user can create a new custom list
async canCreateCustomList(userId: string): Promise<boolean> {
  const user = await getUserPremiumStatus(userId);

  if (user.premium.isPremium) {
    return true; // Premium users have unlimited lists
  }

  // Count user's custom lists (exclude the 5 default lists)
  const defaultListNames = ['watching', 'already-watched', 'dropped', 'favorites', 'should-watch'];
  const customListsSnapshot = await firestore
    .collection('lists')
    .where('userId', '==', userId)
    .where('isDefault', '==', false) // Or use a different way to identify custom lists
    .get();

  const customListCount = customListsSnapshot.size;

  return customListCount < 5; // Free users limited to 5 custom lists
}

// Get user's current list counts for UI display
async getListStats(userId: string): Promise<{customListCount: number, customListLimit: number, isPremium: boolean}> {
  const user = await getUserPremiumStatus(userId);
  const isPremium = user.premium.isPremium;

  const customListsSnapshot = await firestore
    .collection('lists')
    .where('userId', '==', userId)
    .where('isDefault', '==', false)
    .get();

  return {
    customListCount: customListsSnapshot.size,
    customListLimit: isPremium ? -1 : 5, // -1 represents unlimited
    isPremium,
  };
}
```

**Important:** You need to ensure your lists documents have some implementation of the following:

- A `userId` or `ownerId` field
- An `isDefault` boolean field (or similar) to distinguish default lists from custom lists
- An `items` array or subcollection to track media items in the list

### 7. Update UI Components

- Show premium badges/locks on restricted features
- Display item count limits (e.g., "18/20 items" for free users)
- Display custom list count (e.g., "3/5 custom lists" for free users)
- Show upgrade prompts when limits are reached:
  - "Unlock unlimited lists for just $5"
  - Clear call-to-action buttons
- Add a "Premium Status" section in user settings/profile:
  - Show "Free" or "Premium" status
  - For premium users: Show purchase date
  - For free users: Show "Upgrade to Premium" button
  - "Restore Purchase" button for all users

### 8. Handle Edge Cases

- **Purchase Restoration**: Critical for one-time purchases!
  - Users who switch devices or reinstall the app should be able to restore their purchase
  - Implement a "Restore Purchase" flow that queries Google Play for previous purchases
  - When restored, validate with server and update Firestore
- **Receipt Validation**: Server-side validation is mandatory (already covered in step 3)
- **Offline Mode**:
  - Cache premium status locally for offline access
  - On app launch, check Firestore for premium status
  - Periodically re-validate with server when online
- **Failed Purchases**:
  - Handle cases where Google Play billing succeeds but server validation fails
  - Show appropriate error messages
  - Provide retry mechanism
- **Refunds**:
  - Implement webhook/Cloud Function to listen for refund notifications from Google Play
  - Revoke premium status if purchase is refunded
  - Google Play Real-time Developer Notifications (RTDN) for this
- **Network Failures**: Handle gracefully during purchase validation
- **Duplicate Purchases**: Google Play prevents duplicate purchases of managed products automatically

### 9. Testing Checklist

## Firebase Security Rules (Critical)

Backend validation is essential to prevent users from bypassing restrictions by manipulating the app. Implement these security rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper function to check if user is premium
    function isPremiumUser(userId) {
      return get(/databases/$(database)/documents/users/$(userId)).data.premium.isPremium == true;
    }

    // Helper function to count user's custom lists
    function getCustomListCount(userId) {
      return exists(/databases/$(database)/documents/listCounts/$(userId)) ?
        get(/databases/$(database)/documents/listCounts/$(userId)).data.customCount : 0;
    }

    // Lists collection rules
    match /lists/{listId} {
      // Allow read if user owns the list
      allow read: if request.auth != null &&
                     resource.data.userId == request.auth.uid;

      // Allow create only if:
      // - User is authenticated
      // - List belongs to the user
      // - User is premium OR hasn't exceeded custom list limit (5)
      allow create: if request.auth != null &&
                       request.resource.data.userId == request.auth.uid &&
                       (isPremiumUser(request.auth.uid) ||
                        (request.resource.data.isDefault == true ||
                         getCustomListCount(request.auth.uid) < 5));

      // Allow update only if:
      // - User owns the list
      // - User is premium OR list items count <= 20
      allow update: if request.auth != null &&
                       resource.data.userId == request.auth.uid &&
                       (isPremiumUser(request.auth.uid) ||
                        request.resource.data.items.size() <= 20);

      // Allow delete if user owns the list
      allow delete: if request.auth != null &&
                       resource.data.userId == request.auth.uid;
    }

    // Users collection - allow users to read/write their own document
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && request.auth.uid == userId;
    }

    // Optional: List counts cache collection (for performance)
    match /listCounts/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      // Only allow Cloud Functions to write to this
      allow write: if false;
    }
  }
}
```

**Note**: The security rules above assume you're storing list items in an array called `items`. If you're using a subcollection or different structure, adjust accordingly.

**Consider creating a Cloud Function** to maintain a `listCounts` collection for better performance:

```typescript
// Trigger when a list is created or deleted
export const updateListCount = functions.firestore
  .document('lists/{listId}')
  .onWrite(async (change, context) => {
    const listData = change.after.exists ? change.after.data() : change.before.data();
    const userId = listData.userId;

    // Count user's custom lists
    const customListsSnapshot = await admin
      .firestore()
      .collection('lists')
      .where('userId', '==', userId)
      .where('isDefault', '==', false)
      .get();

    // Update count cache
    await admin.firestore().collection('listCounts').doc(userId).set(
      {
        customCount: customListsSnapshot.size,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
```

### 10. Testing Checklist

- Test purchase flow on Android with test account (Google Play Console test users)
- Test with real purchase in internal testing track before production
- Test purchase restoration on the same device
- Test purchase restoration on a different device after reinstalling the app
- Test all restriction scenarios:
  - Adding 21st item to a list as free user (should block)
  - Creating 6th custom list as free user (should block)
  - Same actions as premium user (should succeed)
- Test offline scenarios:
  - Premium status loads from cache when offline
  - Purchase validation fails gracefully when offline
- Verify Firebase updates correctly after purchase via Cloud Function
- Test error cases (cancelled purchases, network failures, etc.)
- Verify Firebase Security Rules prevent free users from bypassing restrictions
- Test refund flow (if webhook is implemented)

## Technical Requirements

- Use TypeScript for type safety
- Implement proper error handling and user feedback
- Add loading states for all async operations
- Ensure Firebase security rules prevent free users from bypassing restrictions
- Follow platform-specific IAP guidelines (Apple and Google)

## Important Security Notes

1. **Server-side validation is mandatory** - This is a must-have requirement. Never trust client-side purchase status alone.
2. **Secure the Cloud Function** - Ensure only authenticated users can call the validation function
3. **Store purchase tokens securely** - Keep them in Firestore for future verification
4. **Implement Firebase Security Rules** to enforce limits on the backend:
   ```javascript
   // Example Firestore rules
   match /lists/{listId} {
     allow create: if request.auth != null &&
       (get(/databases/$(database)/documents/users/$(request.auth.uid)).data.premium.isPremium == true ||
        // Check custom list count and item count limits for free users
       );
   }
   ```
5. **Handle refunds** - Implement Google Play Developer Notifications webhook to detect refunds and revoke access
6. **Protect against replay attacks** - Store purchase tokens and verify they haven't been used before
7. **Rate limit validation requests** - Prevent abuse of the validation Cloud Function

## Confirmed Requirements

1. **Lists Storage**: Lists are stored in a separate `lists` collection (not a subcollection under users)
   - Each list document should have a `userId` or `ownerId` field
   - Need to add/verify `isDefault` boolean field to distinguish default vs custom lists
2. **Monetization Model**: One-time purchase ($5 USD) instead of subscription
3. **Platform**: Android only (Google Play Billing)
4. **Validation**: Server-side receipt validation is mandatory (Cloud Functions required)

## Additional Implementation Details Needed

Before starting implementation, verify or add these fields to your `lists` collection documents:

```typescript
{
  listId: string,
  userId: string, // or ownerId - must exist!
  name: string,
  isDefault: boolean, // true for the 5 default lists, false for custom lists
  items: [] // or subcollection - array of media items
  createdAt: timestamp,
  // ... other fields
}
```

## Deliverables

1. **Google Play Console Setup**:
   - Managed product configured ($5 USD one-time purchase)
   - Testing tracks set up (internal testing, closed testing)

2. **Firebase Cloud Functions**:
   - Purchase validation function deployed
   - Google Play Developer API configured
   - Service account with proper permissions
   - (Optional) Refund webhook handler

3. **App Implementation**:
   - react-native-iap configured for Android
   - Premium/Purchase context with state management
   - Purchase flow UI (paywall/premium screen)
   - Restore purchase functionality

4. **Restrictions Logic**:
   - Validation functions for list creation and item addition
   - Queries to count custom lists per user
   - UI showing count limits (e.g., "3/5 lists")

5. **Firebase Updates**:
   - User schema with premium fields
   - Lists collection verified to have userId and isDefault fields
   - Security rules enforcing restrictions

6. **UI Updates**:
   - Premium badges/locks on restricted features
   - Upgrade prompts when limits reached
   - Settings screen showing premium status
   - Clear CTAs for premium upgrade

7. **Testing & Polish**:
   - Error handling and user feedback
   - Loading states for all async operations
   - Offline support with cached premium status
   - Test purchase and restore flows verified

## Additional Considerations

- **Analytics**: Track conversion rates and purchase completion rates
- **A/B Testing**: Consider testing different price points ($3.99 vs $4.99 vs $5.99)
- **Promotional Pricing**: Google Play allows temporary sales/discounts
- **Future Premium Features**: Plan what additional features could be added to premium tier
- **Refund Policy**: Clearly communicate your refund policy in the app
- **Customer Support**: Have a process for handling purchase issues and refund requests
- **Google Play Developer Notifications**: Implement webhook to receive real-time updates about purchases and refunds

## Google Play Developer API Setup Guide

1. **Enable the API**:
   - Go to Google Cloud Console
   - Enable "Google Play Android Developer API"
   - Create a service account
   - Grant "Service Account User" role
   - Download JSON key file

2. **Link to Play Console**:
   - Go to Google Play Console
   - Settings → API access
   - Link the service account
   - Grant "View financial data" and "Manage orders" permissions

3. **Deploy Cloud Function**:
   - Add the service account JSON to your Firebase Functions project
   - Deploy the validation function
   - Test with a sandbox purchase

## Implementation Order (Recommended)

1. Update lists collection schema (add userId, isDefault fields if missing)
2. Set up Google Play Console (create product, configure)
3. Implement Firebase Cloud Function for validation
4. Install and configure react-native-iap in the app
5. Create Premium context/service
6. Build purchase UI flow
7. Implement restriction logic
8. Update UI with premium badges and limits
9. Test thoroughly with sandbox account
10. Launch internal testing, then production

Please implement this feature step by step, ensuring each component works before moving to the next. Test the Cloud Function validation separately before integrating with the app. Let me know if you need clarification on any requirements.
