2# Duplicated Code Findings

This document outlines areas of the codebase where significant code duplication was found (duplicated >3 times or large blocks >5 lines) that could be refactored.

## 1. Media Detail Screens

**Files:**

- `src/screens/MovieDetailScreen.tsx`
- `src/screens/TVDetailScreen.tsx`
- `src/screens/EpisodeDetailScreen.tsx` (Partial overlap)

**Findings:**
These files share a very large amount of structural and logic code. Code duplicated includes:

- **Hero Section UI (~40 lines)**: The layout involving `MediaImage` (backdrop), `LinearGradient`, `SafeAreaView`, `ShareButton`, and the nested poster container is nearly identical between Movie and TV screens.
- **Action Buttons Logic (~80 lines)**: The "Add to List", "Rating", "Reminder", "Notes", and "Watch Trailer" buttons share identical layout logic, styling, and very similar interaction handlers (e.g., `requireAuth` calls, loading states).
- **Section Rendering**: Calls to `CastSection`, `PhotosSection`, `VideosSection`, `RecommendationsSection`, `ReviewsSection` are repeated with almost identical props.
- **Utility Functions**: The `hasWatchProviders` function (approx 8 lines) is defined identically in both `MovieDetailScreen.tsx` and `TVDetailScreen.tsx`.

**Refactoring Recommendation:**

- Extract the Hero/Header section into a reusable `MediaDetailHeader` component.
- Create a `MediaActionButtons` component to handle the common actions (Rate, List, Note, etc.).
- Move `hasWatchProviders` to a shared utility file (e.g., `src/utils/mediaUtils.ts`).

## 2. Reminder Modals

**Files:**

- `src/components/ReminderModal.tsx`
- `src/components/TVReminderModal.tsx`

**Findings:**
These two files are highly repetitive, with `TVReminderModal` effectively being a superset of `ReminderModal`.

- **Styles (~50+ lines)**: The `StyleSheet.create` blocks are nearly identical.
- **Modal Structure (~30 lines)**: The wrapper code involving `Modal`, `KeyboardAvoidingView`, `ModalBackground`, and the Header (Title + Close button) is identical.
- **Logic Patterns**: `handleSetReminder` and `handleCancelReminder` share the exact same try/catch generic error handling pattern.

**Refactoring Recommendation:**

- Create a `BaseReminderModal` that handles the `Modal` boilerplate, styling, and common Header.
- Or, create a unified `UniversalReminderModal` that accepts a `type` ('movie' | 'tv') and renders the appropriate timing options.

## 3. Service Layer Data Fetching

**Files:**

- `src/services/HistoryService.ts`
- `src/services/ListService.ts`
- (Likely others in `src/services/*`)

**Findings:**
The method for fetching data from Firestore is duplicated across multiple methods (`fetchEpisodeTracking`, `fetchRatings`, `fetchLists` in HistoryService, and generally across services).

**Duplicated Block (~15 lines per instance):**

```typescript
const user = auth.currentUser;
if (!user) return [];

const timeout = createTimeoutWithCleanup(10000, 'Request timed out');

try {
  const ref = collection(db, ...);
  const snapshot = await Promise.race([getDocs(ref), timeout.promise]);
  // processing...
} catch (error) {
  const message = getFirestoreErrorMessage(error);
  console.error('...', message);
  return []; // or throw
} finally {
  timeout.cancel();
}
```

**Refactoring Recommendation:**

- Create a generic `FirestoreService` or utility method `fetchCollectionWithTimeout` that encapsulates the user check, timeout creation, `Promise.race`, error handling, and cleanup.

## 4. UI Components Logic

**Files:**

- `src/screens/MovieDetailScreen.tsx`
- `src/screens/TVDetailScreen.tsx`

**Findings:**
The `handleRefresh` function is nearly identical in both files, calling a `Promise.all` on a specific set of queries.

**Refactoring Recommendation:**

- While difficult to fully abstract due to specific query dependencies, a custom hook `useMediaRefresh` could accept a list of query objects and handle the refreshing state and `Promise.all` logic.
