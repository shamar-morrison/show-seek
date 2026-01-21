# Critical Test Coverage Analysis

This document outlines the missing critical tests for ShowSeek, ranked by priority. The current test suite focuses heavily on utility functions and hook consumption but lacks depth in core business logic and critical user flows.

## 🚨 Critical Priority (Must Implement)

These areas represent the core functionality of the app. Failure here renders the app unusable.

1.  **Authentication Logic (`src/context/auth.ts`)**
    *   **Status:** Partially Covered (Consumer only).
    *   **Missing:** Unit tests for the *provider logic* itself. The current `auth.test.tsx` mocks the context, skipping the actual state management and Firebase interactions.
    *   **Needed:** Tests for `signIn`, `signUp`, `signOut`, and `onAuthStateChanged` using a mocked Firebase Auth instance to verify state transitions.

2.  **Service Layer Integration (Firestore)**
    *   **Status:** Missing.
    *   **Missing:** `ListService`, `RatingService`, `HistoryService`, `TraktService`.
    *   **Needed:** Tests that mock the Firestore SDK to ensure data is correctly structured before saving and correctly parsed when reading.
        *   *Scenario:* "Add to Watchlist" -> Verify Firestore `setDoc` is called with correct user ID and media data.
        *   *Scenario:* "Sync from Trakt" -> Verify batch writes to Firestore.

3.  **Search & Discovery Logic**
    *   **Status:** Missing.
    *   **Missing:** `useHeaderSearch` and `src/screens/search/index.tsx`.
    *   **Needed:**
        *   Test the search hook with debouncing (mocking timers).
        *   Test that search results render correctly and handle empty states.
        *   Verify tapping a search result navigates to the detail screen.

## ⚠️ High Priority (Stability & UX)

These tests ensure the user experience is stable and features work as expected.

4.  **Detail Screen & Interactions (`MovieDetailScreen` / `TVDetailScreen`)**
    *   **Status:** Missing.
    *   **Missing:** Rendering of dynamic data, "Add to List" button interaction, "Rate" button interaction.
    *   **Needed:** Integration test rendering the full screen with mocked data. Verify:
        *   Title, overview, and cast render.
        *   "Add to List" opens the modal.
        *   Trailer button opens the video player.

5.  **Navigation Flows**
    *   **Status:** Missing.
    *   **Missing:** Tab navigation, deep linking, auth redirection.
    *   **Needed:**
        *   Verify unauthorized users are redirected to Onboarding/Auth.
        *   Verify tapping a "Movie Card" pushes to `MovieDetailScreen`.

6.  **Trakt Context & Sync**
    *   **Status:** Missing.
    *   **Missing:** `TraktContext.tsx`.
    *   **Needed:** Test the OAuth flow (mocking `AuthSession`) and the `sync` function triggering the service layer.

## ℹ️ Medium Priority (Edge Cases)

7.  **Language & Region Providers**
    *   **Status:** Missing.
    *   **Needed:** Verify changing language updates the API client headers and persists to storage.

8.  **Error Handling**
    *   **Status:** Missing.
    *   **Needed:** Global error boundary tests. Verify app doesn't crash on API failures.

## Existing Coverage Summary
*   ✅ **Utilities:** Strong coverage for helpers (`date`, `user`, `rating`).
*   ✅ **Simple Components:** `RatingButton`, `SeasonCard`.
*   ✅ **Hook Consumption:** `useRatings` (mocked service), `useReminders`.
