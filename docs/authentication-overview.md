# Authentication Overview

This document describes the current authentication model used in Show Seek.

## Summary

- Authentication is centered on the main auth screen and supports Google, guest, and email/password flows.
- Primary entry is `/(auth)/sign-in`.
- Legacy email/password deep links now resolve to the main auth screen through `/(auth)/email-sign-in`.
- The `/(auth)/sign-up` route has been removed.
- User profile bootstrap normalizes required `users/{uid}` fields (`uid`, `displayName`, `email`, `photoURL`, `createdAt`) with safe fallbacks.

## Auth Routes

- `/(auth)/sign-in`
  - Primary auth screen.
  - Shows Google sign-in, guest access, and the email/password flow.
- `/(auth)/email-sign-in`
  - Compatibility alias that renders the main sign-in screen.
- `/(auth)/sign-up`
  - Removed.

## Authentication Flows

### Google Sign-In (Primary)

1. User taps **Continue with Google**.
2. App authenticates via Firebase credential sign-in.
3. On success, `createUserDocument(user)` creates/updates `users/{uid}` in Firestore using normalized values:
   - `email`: `user.email ?? ''`
   - `displayName`: trimmed `user.displayName`, else email prefix, else `'User'`
   - `photoURL`: `user.photoURL ?? null`
4. Premium bootstrap also calls `createUserDocument(user)` before `syncPremiumStatus()` so profile fields exist before premium writes.
5. Root layout redirects authenticated users into tabs.

### Email/Password Flow

1. User taps **Continue with Email** on the main auth screen.
2. App calls `fetchSignInMethodsForEmail` to check whether the email already has a password account.
3. If a password account exists, app authenticates via `signInWithEmailAndPassword`.
4. If no account exists, app shows a native confirmation alert explaining that a new account will be created and then calls `createUserWithEmailAndPassword` if the user continues.
5. If the email is already tied to another provider, app shows provider-specific guidance instead of creating a duplicate account.
6. Successful email sign-in or account creation both call `createUserDocument(user)` and `trackLogin('email')`.
7. Root layout redirects authenticated users into tabs.

### Sign-Out

1. UI calls `signOut()` from auth context.
2. Firebase session is cleared.
3. Root layout redirects to `/(auth)/sign-in` when no authenticated user exists.

## Anonymous User Handling

If Firebase reports an anonymous user session, auth context now normalizes it to signed-out:

- `user` is set to `null` in context.
- Cleanup sign-out is triggered to clear the anonymous session.
- App routing treats this as unauthenticated and redirects to sign-in.

## Routing Rules (Root Layout)

- Onboarding incomplete: redirect to `/onboarding`.
- Onboarded + no authenticated user: redirect to `/(auth)/sign-in`.
- Authenticated user in auth/onboarding routes: redirect to preferred launch screen.

## Key Files

- `app/(auth)/sign-in.tsx`
- `app/(auth)/email-sign-in.tsx`
- `app/(auth)/_layout.tsx`
- `app/_layout.tsx`
- `src/context/auth.ts`
- `src/firebase/auth.ts`
- `src/components/auth/EmailAuthSection.tsx`
- `src/firebase/user.ts`

## Operational Follow-Up

To match client behavior, keep Firebase Anonymous Authentication disabled in project settings.
