# Feature: Mark Movies as Watched (Multiple Times)

## Overview

Implement a feature that allows users to mark movies as watched multiple times, with each watch instance storing the date/time it was watched. This feature should only appear on movie detail screens, NOT on TV show detail screens.

## UI Components

### Mark as Watched Button

**Location**: Add above the "Watch Trailer" button on the movie detail screen

**Default State (never watched)**:

- Style: Button outline style (use existing outline button component)
- Text: "Mark as Watched"
- Icon: Use an appropriate watch/eye icon from your icon library

**Watched State (count > 0)**:

- Style: Outline button with green styling
- Outline color: Green
- Text color: Green
- Text: "Marked as Watched"
- Icon: Checkmark icon in green
- Counter badge: Display count in a fully rounded green circle positioned on/near the button
  - Background: Green
  - Text: White
  - Display format: Just the number (e.g., "3", "12")

### Bottom Sheet Modal

**Trigger**: Taps on "Mark as Watched" button (unless user has enabled "skip modal" setting)

**Header**: "When did you watch this?"

**Options**:

1. "Right now" - Uses current date and time
2. "Release Date" - Uses the movie's release date from TMDB API data
3. "Choose a date" - Opens native date picker from the device
4. "Clear all watch history" - Only show this option if the user has marked the movie as watched at least once (count > 0). This should remove all watch entries for this movie.

**Behavior**:

- After user selects an option (except "Clear all"), save the watch instance to Firestore and dismiss the modal
- If user selects "Clear all", show a confirmation alert, then clear all entries and dismiss modal
- Use existing bottom sheet modal component with your app's standard styling

## Data Structure

### Firestore Schema

Store watch instances in a subcollection under the user's document:

```
users/{userId}/watched_movies/{movieId}/watches/{watchId}
```

**Document fields**:

- `watchedAt`: Timestamp - when the movie was watched
- `movieId`: String - TMDB movie ID (for easier querying if needed)

**Why this structure**:

- Allows tracking individual watch instances with dates
- Easy to count total watches
- Easy to clear all by deleting the subcollection
- Minimal data storage per watch

### Cache/Local State

- Cache the watch count and most recent watch date in component state to avoid excessive Firestore reads
- Update local state immediately when user marks as watched for responsive UI

## Settings/Preferences

### New User Preference

**Location**: Profile screen → Preferences section

**Setting**:

- Label: "Quick Mark as Watched"
- Description: "Skip the date selection and use current time"
- Type: Toggle/Switch
- Default: Off (false)

**Behavior**:

- When enabled: Tapping "Mark as Watched" immediately saves current date/time without showing the modal
- When disabled: Shows the bottom sheet modal as normal
- Store this preference in the user's Firestore document under a preferences map/object

## Functionality Requirements

1. **Marking as Watched**:
   - Increment the counter each time user marks the movie as watched
   - Store each watch instance with its timestamp
   - Update button appearance to "watched state" after first watch
   - Update counter badge with new total

2. **Loading State**:
   - On movie detail screen load, fetch the watch count from Firestore
   - Show appropriate button state based on count

3. **Clear All Functionality**:
   - Only available in bottom sheet modal when count > 0
   - Show confirmation: "Clear all watch history for this movie? This cannot be undone."
   - On confirm: Delete all watch instances and reset button to default state

4. **Release Date Handling**:
   - Pull release date from the TMDB movie data already fetched for the detail screen
   - If release date is not available, disable/hide this option in the modal

5. **Date Picker**:
   - Use the device's native date picker
   - Allow selecting past dates only (no future dates)
   - Default to current date

## Technical Implementation Notes

- Use existing UI components and color scheme throughout
- Follow existing Firebase/Firestore patterns in the codebase
- Use TypeScript with proper type definitions for watch instances
- Implement proper error handling for Firestore operations
- Consider using a Firebase callable function or batch writes if needed for clearing all entries
- Add loading states for async operations (saving, clearing, loading count)
- This feature should ONLY appear on movie detail screens, not TV show detail screens

## Edge Cases to Handle

1. Offline mode: Queue writes to sync when back online (Firestore should handle this)
2. Multiple rapid taps: Debounce or disable button while saving
3. Missing release date: Handle gracefully by hiding that option
4. Empty state: Handle when user has never watched the movie
5. Large watch counts: Ensure UI handles double/triple digit numbers in the counter badge

Let me know if you need any clarification on the implementation details!
