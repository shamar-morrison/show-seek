I need to implement a user rating feature for my React Native/Expo movie tracking app. Here are the detailed requirements:

## Feature Overview

Add a rating system that allows users to rate movies and TV shows on a scale of 1-10 stars, with ratings stored in Firestore and displayed on detail screens.

## UI Components Needed

### 1. Rating Trigger Button

- Location: Movie/TV show detail screen, positioned next to the poster image
- Design: Star icon button matching the style of the existing "add to list" button
- Icon: Use a star icon (outline when no rating, filled when rated)
- Action: Opens rating modal on press

### 2. Rating Modal

- Contains 10 interactive star icons in a row
- Stars should be tappable/selectable
- Visual feedback: Stars up to selected position should be filled, rest should be outline
- Allow users to change selection before confirming
- Display selected rating as "X/10" below the stars
- Include a "Confirm Rating" button at the bottom
- Include a "Cancel" or close button to dismiss without saving
- Modal should have a dark theme consistent with the app design

### 3. Rating Display

- Location: Next to the movie/TV show card on the detail screen
- Show user's rating with descriptive text based on score:
  - 1-2: "Terrible"
  - 3-4: "Not Good"
  - 5: "Average"
  - 6-7: "Pretty Good"
  - 8-9: "Great"
  - 10: "Masterpiece"
- Format: Display as "Your Rating: 7/10 - Pretty Good"
- Style: Should be visually distinct but complement the existing UI

## Technical Requirements

1. **State Management**
   - Track modal visibility state
   - Track selected rating (1-10)
   - Track if user has already rated this item
   - Load existing rating on component mount

2. **Functions Needed**
   - `getRatingText(rating: number): string` - Convert number to descriptive text
   - `handleRatingSelect(starIndex: number)` - Handle star selection
   - `saveRating()` - Save/update rating in Firestore
   - `loadUserRating()` - Fetch existing rating on mount
   - `deleteRating()` (optional) - Allow users to remove their rating

3. **Error Handling**
   - Handle case when user is not authenticated
   - Show error message if Firestore operation fails
   - Loading states while fetching/saving data

## Implementation Notes

- Use existing Firebase/Firestore setup
- Follow existing component structure and styling patterns
- Ensure the feature works for both movie and TV show detail screens
- The rating should persist across app sessions
- Add appropriate loading indicators during async operations

## Files to Create/Modify

1. Create `components/RatingModal.tsx` - The rating modal component
2. Create `components/RatingButton.tsx` - The trigger button component
3. Create `components/UserRating.tsx` - Display component for showing user's rating
4. Modify movie detail screen to integrate rating components
5. Modify TV show detail screen to integrate rating components
6. Create `utils/ratingHelpers.ts` - Helper functions for rating logic
7. Create `services/ratingService.ts` - Firestore operations for ratings

## Example Usage in Detail Screen

```typescript
<View style={styles.ratingContainer}>
  <RatingButton
    mediaId={movie.id}
    mediaType="movie"
    onRatingChange={() => loadUserRating()}
  />
  {userRating && (
    <UserRating rating={userRating} />
  )}
</View>
```

Please implement this feature following best practices for React Native, TypeScript, and Firebase. Ensure the UI is responsive and matches the existing app design shown in the screenshot.
