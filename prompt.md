# Feature: User Preferences System with Auto-Add to Watching List

## Overview

Implement a user preferences system in the Profile screen that persists to Firebase Firestore. The first preference allows users to automatically add TV shows to their "Watching" list when marking an episode as watched (for returning series only).

## Firestore Schema Update

Add a `preferences` map field to each user document in the `users` collection:

```typescript
// users/{uid}
{
  // ...existing fields (displayName, email, photoURL, uid, createdAt)
  preferences: {
    autoAddToWatching: boolean; // default: true
  }
}
```

## Requirements

### 1. Preferences Data Layer

- Create a `preferences` service/hook to read and update user preferences in Firestore
- Preferences should merge on update (not overwrite the entire object) to support future preferences
- Handle the case where `preferences` field doesn't exist yet (treat as defaults)
- Default value for `autoAddToWatching` should be `true`
- **Error Handling:**
  - Handle firestore operations the same way as the rest of the codebase
  - Handle network failures gracefully
  - Handle permission denied errors (invalid auth state)
  - Log errors for debugging without exposing to UI unnecessarily
  - Return default preferences if read fails
  - For write failures, rollback optimistic updates if applicable

### 2. Profile Screen UI

- Scan the existing Profile screen and add a "Preferences" section
- Follow the existing design patterns/components used elsewhere in the app
- Add a toggle/switch for "Auto-add to Watching list" with a subtitle explaining: "Automatically add returning series to your Watching list when you mark an episode as watched"
- The toggle should reflect the current Firestore value and update optimistically
- **Error Handling:**
  - Show loading state while preferences are being fetched
  - Display error message if preferences fail to load (with retry option)
  - Disable toggle during update operations to prevent race conditions
  - Show error toast/inline-error if preference update fails
  - Revert toggle state to previous value if update fails
  - Handle cases where user document doesn't exist
  - Provide user-friendly error messages (avoid technical jargon)

### 3. Episode Watch Logic Integration

- Find the existing function/logic that handles marking an episode as watched
- Before or after the existing logic, check:
  1. Is `preferences.autoAddToWatching` enabled? (default to `true` if preferences don't exist)
  2. Is the show's status `"Returning Series"`?
  3. Is the show NOT already in the Watching list?
- If all conditions are true, add the show to the Watching list
- Scan the codebase to find how shows are currently added to lists and reuse that pattern
- **Error Handling:**
  - Don't let auto-add failures block the primary episode watch action
  - If auto-add fails, mark the episode as watched anyway (primary action takes precedence)
  - Log auto-add failures but don't show intrusive error messages
  - Handle race conditions (e.g., show added to list by another device)
  - Gracefully handle missing show data (status field might be undefined)
  - Handle malformed or unexpected show status values
  - If preferences fetch fails, fall back to default behavior (auto-add enabled)
  - Prevent duplicate entries if auto-add is triggered multiple times
  - Consider transaction or atomic operations to ensure data consistency

### 4. Type Definitions

- Add TypeScript types for the preferences object
- Make it extensible for future preferences:

```typescript
interface UserPreferences {
  autoAddToWatching: boolean;
  // future preferences will be added here
}

// Error types for better error handling
type PreferencesError = 'PERMISSION_DENIED' | 'NETWORK_ERROR' | 'USER_NOT_FOUND' | 'UNKNOWN_ERROR';

interface PreferencesResult<T> {
  data?: T;
  error?: {
    type: PreferencesError;
    message: string;
  };
}
```

### 5. Error Handling Strategy

#### Critical Errors (Block functionality, show to user)

- User not authenticated when accessing preferences
- Firestore permission denied errors
- Complete network failure when loading preferences for the first time

#### Non-Critical Errors (Log but use fallbacks)

- Network timeout when updating preferences (use optimistic updates)
- Failed auto-add to Watching list (episode still marked as watched)
- Missing or malformed preference data (use defaults)

#### Error Recovery Patterns

- **Retry Logic:** Scan the codebase for existing patterns
- **Offline Support:** Cache preferences locally; sync when online
- **Fallback Defaults:** Always have default values when reads fail
- **Graceful Degradation:** Core features (marking episodes watched) work even if preferences fail
- **User Feedback:** Clear, actionable error messages with retry options

#### Logging Requirements

- Log all errors with context (user ID, operation, timestamp)
- Include error type and original error message
- Log successful recoveries from errors
- Don't log sensitive user data

## Implementation Steps

1. **Scan the codebase** to understand:
   - Existing Firestore service patterns (how other data is read/written)
   - Existing error handling patterns and utilities
   - How user data is currently managed (context, hooks, etc.)
   - Profile screen structure and component patterns
   - How the "Watching" list works and how items are added to it
   - Where episode marking logic lives
   - Existing error notification components (toast, alert, etc.)
   - Existing retry/loading state patterns

2. **Implement in this order:**
   - Types/interfaces first (including error types)
   - Firestore preferences service/hook with comprehensive error handling
   - Error handling utilities (retry logic, error mappers, etc.)
   - Profile screen UI section with error states
   - Integration with episode watched logic (with fallback behavior)
   - Error logging/monitoring integration

3. **Test error scenarios:**
   - Simulate network failure (offline mode)
   - Test with unauthenticated user
   - Test with missing user document
   - Test with missing preferences field
   - Test concurrent updates
   - Test partial failures in auto-add logic

## Acceptance Criteria

- [ ] New users get default preferences (`autoAddToWatching: true`)
- [ ] Existing users without preferences field work correctly (defaults applied)
- [ ] Toggle in Profile screen updates Firestore immediately
- [ ] Toggle reflects correct state on Profile screen load
- [ ] Marking an episode watched for a "Returning Series" adds it to Watching list (when enabled)
- [ ] Shows already in Watching list are not duplicated
- [ ] Shows with status other than "Returning Series" are not auto-added
- [ ] Feature does nothing when preference is disabled
- [ ] No TypeScript errors
- [ ] Follows existing code patterns and style conventions in the codebase
- [ ] **Error Handling Criteria:**
  - [ ] All Firestore operations handled as they are in other places of the codebase
  - [ ] Network failures show user-friendly error messages
  - [ ] Failed preference updates revert optimistic changes
  - [ ] Episode marking still works even if auto-add fails
  - [ ] Missing or malformed data doesn't crash the app
  - [ ] Loading states displayed during async operations
  - [ ] Errors are logged with sufficient context for debugging
  - [ ] Retry mechanism available for recoverable errors
  - [ ] Offline mode handled gracefully
  - [ ] Race conditions prevented with proper state management
  - [ ] Permission errors handled with appropriate messaging
  - [ ] No silent failures - all errors either logged or shown to user
  - [ ] Optimistic UI updates rollback on failure

## Notes

- The show status from TMDB uses the exact string `"Returning Series"` for ongoing shows
- Keep the preferences architecture extensible — more toggles will be added later
- Scan for existing toggle/switch components before creating new ones
- **Error Handling Philosophy:** Fail gracefully, preserve core functionality, provide clear feedback
- Scan for existing error handling utilities and patterns to maintain consistency
