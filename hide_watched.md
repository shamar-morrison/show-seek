# Feature Specification: Hide Watched Content (Premium)

## Objective
Implement a Premium-only user preference to globally hide watched movies and TV shows throughout the application. When enabled, any content marked as watched or present in the "Already Watched" list should be filtered out from Search results, Discover feeds, Recommendations, and Similar media lists.

## 1. Data Model & Types

**File:** `src/types/preferences.ts`

- Update `UserPreferences` interface.
- Update `DEFAULT_PREFERENCES`.

```typescript
export interface UserPreferences {
  // ... existing properties
  hideWatchedContent: boolean;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  // ... existing defaults
  hideWatchedContent: false, // Default to false (show everything)
};
```

## 2. Service Layer Updates

**File:** `src/services/PreferencesService.ts`

- Ensure `subscribeToPreferences` maps the new `hideWatchedContent` field.

## 3. Filtering Logic Implementation

The filtering logic needs to be robust and efficient. Since `tmdbApi` returns raw results, we need a hook or utility to filter these results against the user's watched history.

**File:** `src/hooks/useContentFilter.ts` (Create this file)

- **Purpose:** A reusable hook that takes a list of media items and returns a filtered list based on the user's preferences and watched status.
- **Dependencies:**
    - `usePreferences` (to check `hideWatchedContent`)
    - `useLists` (to check "Already Watched" list membership)
    - `useWatchedMovies` (to check specific watched movies)
    - `useHistory` (to check Trakt/local history if applicable, though "Already Watched" list is the primary source of truth for lists).
- **Logic:**
    ```typescript
    if (!preferences.hideWatchedContent) return originalList;
    return originalList.filter(item => !isWatched(item.id));
    ```

## 4. UI Implementation & Integration

### A. Profile Settings
**File:** `app/(tabs)/profile/index.tsx`

- Add a toggle switch in the "Preferences" section.
- Label: "Hide Watched Content"
- Subtitle: "Remove watched movies and TV shows from search and discovery."
- **Premium Check:**
    - Use `usePremium()` hook.
    - If `!isPremium`:
        - Style the row with reduced opacity (locked state).
        - Display a `<PremiumBadge />` next to the label.
        - Disable the switch interaction.
        - On press of the entire row, navigate to `/premium`.
    - If `isPremium`:
        - Enable the switch.
        - Toggle updates the preference in Firestore.

### B. Applying the Filter

You must wrap the data in the following components/screens with the new `useContentFilter` hook (or similar logic) before rendering.

1.  **Search Screen:** `app/(tabs)/search/index.tsx`
2.  **Discover Screen:** `app/(tabs)/discover/index.tsx`
3.  **Home Screen:** `app/(tabs)/home/index.tsx` (Specifically for "Trending", "Popular", "Recommendations" sections. *Do not* filter user's own lists like "Watching" or "Watchlist").
4.  **Media Details:** `src/screens/MovieDetailScreen.tsx` (For "Similar Movies" and "Recommendations").

**Example Integration:**
```typescript
const { data: movies } = useQuery(...);
const { filteredContent } = useContentFilter(movies?.results);

// Render filteredContent instead of movies.results
```

## 5. Performance Considerations

- **Client-side Filtering:** Since TMDB API doesn't support filtering by user's specific watched ID list, this filtering *must* happen on the client side after fetching a page of results.
- **Pagination Issue:** Be aware that aggressive filtering might leave a page with very few or no items.
    - *Mitigation:* For V1, accepting that some rows might be shorter is acceptable. Infinite scroll components should simply request the next page if the current filtered page is empty, though this logic can be complex. For a "ShowSeek" MVP, simply filtering the current view is sufficient.

## 6. Acceptance Criteria

1.  **Persistence:** The "Hide Watched Content" toggle persists in Firestore for premium users.
2.  **Premium Gate:** Non-premium users see the option but cannot enable it; tapping it directs them to the Premium upgrade screen.
3.  **Search:** Searching for a movie that is in the "Already Watched" list returns 0 results (or excludes it from results) when the setting is enabled.
4.  **Discover:** Watched items do not appear in Discover feeds.
5.  **Toggle:** Disabling the setting immediately restores the hidden content (requires query invalidation or reactivity).