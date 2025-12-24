/**
 * Google Authentication helpers for Firebase integration
 * Uses react-native-google-auth for OAuth flow
 */

import { auth } from '@/src/firebase/config';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { GoogleAuth, GoogleAuthScopes } from 'react-native-google-auth';

// Track if GoogleAuth has been configured
let isConfigured = false;

/**
 * Configure GoogleAuth - must be called before signIn
 * Uses Web Client ID for Android Credential Manager API
 */
export async function configureGoogleAuth(): Promise<void> {
  if (isConfigured) return;

  try {
    await GoogleAuth.configure({
      androidClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      scopes: [GoogleAuthScopes.EMAIL, GoogleAuthScopes.PROFILE],
    });
    isConfigured = true;
    console.log('Google Auth configured successfully');
  } catch (error) {
    console.error('Google Auth configuration failed:', error);
    throw error;
  }
}

/**
 * Sign in with Google and authenticate with Firebase
 * Returns the Firebase User on success
 */
export async function signInWithGoogle(): Promise<
  | {
      success: true;
      user: import('firebase/auth').User;
    }
  | {
      success: false;
      cancelled?: boolean;
      error?: string;
    }
> {
  try {
    // Ensure GoogleAuth is configured
    await configureGoogleAuth();

    // Perform Google sign-in
    const response = await GoogleAuth.signIn();

    if (response.type === 'cancelled') {
      return { success: false, cancelled: true };
    }

    if (response.type !== 'success' || !response.data.idToken) {
      return { success: false, error: 'Google sign-in failed. Please try again.' };
    }

    // Create Firebase credential from Google ID token
    const credential = GoogleAuthProvider.credential(response.data.idToken);

    // Sign in to Firebase with the Google credential
    const userCredential = await signInWithCredential(auth, credential);

    return { success: true, user: userCredential.user };
  } catch (error: any) {
    console.error('Google sign-in error:', error);
    return { success: false, error: getGoogleAuthErrorMessage(error) };
  }
}

/**
 * Sign out of Google (in addition to Firebase sign out)
 */
export async function signOutGoogle(): Promise<void> {
  try {
    await GoogleAuth.signOut();
  } catch (error) {
    console.warn('Google sign out error:', error);
  }
}

/**
 * Get user-friendly error message for Google auth errors
 */
export function getGoogleAuthErrorMessage(error: any): string {
  const code = error?.code;

  switch (code) {
    // Account linking errors
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email. Please sign in with email/password first.';
    case 'auth/credential-already-in-use':
      return 'This Google account is already linked to another account.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in with email/password.';
    case 'auth/provider-already-linked':
      return 'This Google account is already linked to your account.';
    case 'auth/invalid-credential':
      return 'Google sign-in failed. Please try again.';

    // Google sign-in errors
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return ''; // User cancelled - no error message needed

    // Network errors
    case 'auth/network-request-failed':
      return 'Network error. Please check your internet connection.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.';

    // Configuration errors
    case 'auth/operation-not-allowed':
      return 'Google sign-in is not enabled. Please contact support.';

    default:
      return error?.message || 'Unable to sign in with Google. Please try again.';
  }
}
