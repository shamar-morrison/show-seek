# Task: Implement Google Sign-In for Show Seek App

## Context

You are working on a React Native/Expo app called "Show Seek" that currently uses Firebase Authentication with email/password and anonymous (guest) sign-in. The existing authentication system is fully documented in the `authentication-overview.md` file uploaded to this conversation.

## Objective

Implement Google Sign-In using the `react-native-google-auth` package (https://github.com/sbaiahmed1/react-native-google-auth) with the following requirements:

### Product Requirements

1. **Sign-In Screen Changes**
   - Add a "Sign in with Google" button alongside the existing email/password sign-in
   - Keep email/password sign-in functional for legacy users
   - Maintain the "Continue as Guest" option

2. **Sign-Up Screen Changes** ⚠️ CRITICAL
   - **REMOVE** the email/password sign-up form entirely
   - **ONLY** show "Sign in with Google" button
   - Add messaging like "Create your account with Google for a seamless experience"
   - Legacy users can still sign in with email/password on the sign-in screen

3. **Account Linking Logic**
   - If a user signs in with Google using an email that matches an existing email/password account:
     - Attempt to automatically link the accounts using Firebase's account linking
     - If linking succeeds: merge the accounts seamlessly
     - If linking fails: show a clear error message explaining the issue and suggesting they sign in with email/password instead

4. **User Profile Data**
   - Automatically use the Google account's display name (from `user.displayName`)
   - Store/sync the Google profile photo URL in Firestore (`photoURL` field)
   - Create the same Firestore user document structure as documented

5. **Guest Users**
   - Guest users (anonymous accounts) will NOT be able to upgrade to Google accounts
   - This is intentional - keep existing guest/anonymous behavior unchanged

## Technical Requirements

### 1. Firebase Configuration Setup

Before implementation, ensure Google Sign-In is properly configured in Firebase:

**If Firebase MCP is available**, attempt to enable Google Sign-In provider programmatically. Otherwise, provide manual instructions:

#### Manual Setup Instructions (if MCP unavailable):

```
1. Go to Firebase Console → Authentication → Sign-in method
2. Enable "Google" provider
3. Note the Web Client ID (you'll need this for the app)

4. Go to Google Cloud Console → APIs & Services → Credentials
5. Ensure you have an OAuth 2.0 Client ID for:
   - Web application (for Firebase)
   - Android (with your app's SHA-1 fingerprint)
   - iOS (with your app's bundle ID)
```

Add the Web Client ID to `.env`:

```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
```

### 2. Package Installation

Install the required package:

```bash
npx expo install react-native-google-auth
```

Update `app.json` with the necessary configuration (refer to the package documentation for expo plugin setup).

### 3. Implementation Details

#### File Changes Required:

1. **`src/firebase/auth.ts`** (create if doesn't exist)
   - Add `signInWithGoogle()` function
   - Add `linkGoogleAccount()` helper function
   - Handle Google OAuth flow using `react-native-google-auth`
   - Use Firebase's `signInWithCredential()` with Google credential
   - Implement account linking logic with proper error handling

2. **`app/(auth)/sign-in.tsx`**
   - Add "Sign in with Google" button (styled consistently with existing buttons)
   - Add handler that calls `signInWithGoogle()` from firebase/auth.ts
   - Handle Google sign-in errors gracefully
   - Keep existing email/password and guest sign-in functionality

3. **`app/(auth)/sign-up.tsx`**
   - **REMOVE** all email/password form fields (email, password, confirm password, display name)
   - **REMOVE** the create account button
   - Show **ONLY** "Sign in with Google" button
   - Add helpful text explaining users should create accounts via Google
   - Add small link/text at bottom: "Already have an account? Sign in" (links to sign-in screen)

4. **`src/firebase/firestore.ts`**
   - Ensure `createUserDocument()` works with Google user objects
   - Handle `photoURL` from Google profile
   - Ensure it's idempotent (safe to call multiple times)

5. **`authentication-overview.md`**
   - Update documentation to reflect Google Sign-In
   - Document the account linking flow
   - Update the mermaid diagram to include Google auth path
   - Note the deprecation of email/password sign-up

### 4. Error Handling

Implement comprehensive error handling for:

```typescript
// Account linking errors
'auth/credential-already-in-use'          → "This Google account is already linked to another account"
'auth/email-already-in-use'               → "An account with this email already exists. Try signing in with email/password."
'auth/provider-already-linked'            → "This Google account is already linked"
'auth/invalid-credential'                 → "Google sign-in failed. Please try again."

// Google sign-in errors
'auth/popup-closed-by-user'               → Silent fail (user cancelled)
'auth/network-request-failed'             → "Network error. Please check your connection."
'auth/too-many-requests'                  → "Too many attempts. Please try again later."

// General errors
'auth/operation-not-allowed'              → "Google sign-in is not enabled. Please contact support."
```

### 5. Account Linking Flow

```typescript
// Pseudocode for the linking logic
async function signInWithGoogle() {
  try {
    // 1. Get Google credential
    const googleCredential = await getGoogleCredential();

    // 2. Try to sign in with Google
    const result = await signInWithCredential(auth, googleCredential);

    // 3. Create/update Firestore user document
    await createUserDocument(result.user);

    return result.user;
  } catch (error) {
    if (error.code === 'auth/account-exists-with-different-credential') {
      // Email exists with different provider (email/password)
      try {
        // Attempt to link accounts
        const email = error.customData.email;
        const methods = await fetchSignInMethodsForEmail(auth, email);

        if (methods.includes('password')) {
          // Show message: "An account exists with this email. We'll link your accounts."
          // For now, throw error - linking requires user to sign in first
          throw new Error(
            'Please sign in with your email and password first, then link your Google account from settings.'
          );
        }
      } catch (linkError) {
        throw linkError;
      }
    }
    throw error;
  }
}
```

### 6. UI/UX Guidelines

- Use a recognizable Google button (blue with Google logo)
- Follow Google's branding guidelines for the sign-in button
- Ensure button styling is consistent with the existing UI
- Add loading states during Google authentication
- Show appropriate error messages using existing error handling patterns

### 7. Testing Checklist

After implementation, verify:

- [ ] New users can create accounts via Google
- [ ] Existing email/password users can still sign in
- [ ] Guest/anonymous sign-in still works
- [ ] Google users have correct display name and photo
- [ ] Firestore documents are created correctly
- [ ] Account linking shows appropriate error messages
- [ ] Email/password sign-up screen is removed
- [ ] Sign-in screen shows all three options (Google, email/password, guest)
- [ ] Session persistence works correctly
- [ ] Sign out works for Google accounts

## Success Criteria

✅ Users can create new accounts using only Google Sign-In
✅ Legacy users can sign in with email/password (but cannot create new accounts this way)
✅ Guest sign-in remains functional
✅ Account linking attempts automatically when emails match
✅ Clear error messages when linking fails
✅ Google profile picture and name are synced
✅ All existing auth functionality remains working
✅ Documentation is updated

## Important Notes

- Do NOT break existing authentication functionality
- Maintain compatibility with the existing `useAuth()` hook
- Keep the `useAuthGuard` hook working as-is
- Ensure Firestore document structure remains consistent
- The app should work seamlessly for users regardless of which auth method they used
- Test thoroughly with both new Google accounts and existing email/password accounts

## Files to Reference

- Current auth implementation: `authentication-overview.md` (uploaded)
- Package docs: https://github.com/sbaiahmed1/react-native-google-auth
- Firebase Auth linking: https://firebase.google.com/docs/auth/web/account-linking

## Questions?

If you encounter any ambiguities or need clarification, ask before proceeding with implementation.
