# Profile Screen Implementation

## Overview

Build a user profile screen for this React Native/Expo app that displays user information, activity stats, and account management options.

## Tech Stack

- **Framework**: React Native with Expo
- **Navigation**: Expo Router
- **Backend**: Firebase (Authentication + Firestore)

## Pre-Implementation Steps

Before writing any code:

1. **Scan the codebase** for existing:
   - Color scheme / theme configuration
   - Reusable components (buttons, cards, containers, etc.)
   - Style patterns and conventions
   - Firebase/Firestore utility functions or hooks
   - Auth context or hooks

2. **Follow the existing design paradigm** - match the look and feel of other screens in the app

---

## Screen Requirements

### 1. User Info Section (Top)

- **Avatar**: Display user's initials in a circular badge (extract from displayName, fallback to email)
- **Display Name**: Show the user's display name prominently
- **Email**: Show the user's email below the display name (slightly muted styling)

### 2. Stats Section

Display activity counts in a clean, non-cluttered layout (e.g., horizontal row of stat cards or a simple list):

- Number of **movies rated**
- Number of **TV shows rated**
- Number of **favorite people** (cast/crew)
- Number of **movies liked**
- Number of **TV shows liked**

**Notes:**

- These stats are **purely informational** - no navigation on tap
- Query the `ratings` and `lists` subcollections to compute counts
- If displaying all stats creates visual clutter, prioritize the most important ones or group them logically
- Show loading states while fetching counts

### 3. Action Buttons

#### Donate Button

- Label: "Support Development" or "Buy Me a Coffee" (or similar)
- Action: Open external link to Ko-fi
- Link: `https://ko-fi.com/yourusername` (placeholder - replace later)
- Use `Linking.openURL()` from React Native

#### Logout Button

- Label: "Log Out" or "Sign Out"
- Action: Sign out from Firebase Auth
- Should redirect user to login/auth screen after logout
- Consider showing a brief confirmation or toast

#### Delete Account Button

- Label: "Delete Account"
- **Styling**: Destructive/danger style (red or warning color)
- **Action flow**:
  1. Show confirmation alert/modal warning this action is permanent
  2. If confirmed:
     - Delete all documents, collections, subcollections and everything that belongs to the user.
     - Delete the Firebase Auth account (`user.delete()`)
     - Redirect to login/onboarding screen
  3. Handle errors gracefully (show error message if deletion fails)

---

## UI/UX Guidelines

- **Follow existing app design** - scan other screens for patterns
- **Dark/Light mode**: Match whatever the app currently uses
- **Loading states**: Show skeletons or spinners while fetching user data and stats
- **Error handling**: Gracefully handle cases where data fetch fails

---

## Implementation Notes

1. **Get current user** from Firebase Auth context/hook
2. **Initials extraction**: Take first letter of first name + first letter of last name, or first two letters of email if no display name
3. **Batch delete**: When deleting account, delete subcollection documents first (Firestore doesn't automatically delete subcollections)
4. **Re-authentication**: Firebase may require recent authentication to delete account - handle `auth/requires-recent-login` error by prompting user to re-authenticate
5. **Use existing patterns**: If the app has existing hooks for Firestore queries, Firebase auth, or navigation patterns - use them

---

## Acceptance Criteria

- [ ] Profile displays user's initials, display name, and email
- [ ] Stats section shows counts from Firestore (with loading state)
- [ ] Donate button opens Ko-fi link in browser
- [ ] Logout signs out and redirects to auth screen
- [ ] Delete account shows confirmation, deletes all user data + auth account, then redirects
- [ ] Screen matches the existing app design language
- [ ] Proper error handling throughout
