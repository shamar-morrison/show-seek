# Season and Episode Tracking Feature Specification

## Overview

Implement a comprehensive season and episode tracking feature for TV shows that allows users to monitor their viewing progress across all seasons and episodes.

---

## Core Requirements

### Season Display (TV Show Detail Screen) Section

- Add a horizontal FlashList displaying all seasons below the show overview section
- Season cards should mimic the design style of the "Similar Shows" section cards
- Each season card should display:
  - Season poster image
  - Season title (e.g., "Season 1")
  - Number of episodes (e.g., "10 Episodes")
  - Progress bar showing watched status (e.g., "3/10")
- Tapping a season card navigates to the Episode List Screen

### Episode List Screen

- Display a vertical list of all episodes for the selected season (use a FlashList)
- Each episode card should show:
  - Episode details (number, title, air date, description, thumbnail)
  - "Mark as Watched" button
- Header should include:
  - Show title and season number
  - "Mark All Watched" button in the top-right corner
- Episode details should match the styling used on the TV Seasons Screen

### Watch Status Functionality

- Users can manually mark individual episodes as watched
- Users can mark all episodes in a season as watched via header button
- All watch status data should be persisted in Firestore

---

## Visual & Interaction Enhancements

### Progress Bar Styling

- Specify whether the progress bar should change color/style when a season is fully completed
- Consider different visual states: In Progress vs. Complete (e.g., blue vs. green)

### Watched State Indication

- Define how watched episodes should be visually distinguished in the episode list:
  - Opacity/transparency change
  - Checkmark icon or badge
  - Different background color

### Toggle Functionality

- Clarify that the "Mark as Watched" button should toggle between watched/unwatched states
- Button should reflect current state (e.g., "Mark as Watched" vs. "Mark as Unwatched")

### Season Card Visual Indicators

- Consider adding a badge or icon on season cards that are 100% complete
- Completion indicator could be a checkmark, star, or trophy icon

### Empty State Handling

- Define what displays on the TV show detail screen if a show has no seasons available yet
- Consider showing a placeholder message or hiding the seasons section entirely

---

## User Experience & Feedback

### Mark All Confirmation

- Specify whether marking all episodes as watched should:
  - Show a confirmation dialog ("Mark all 10 episodes as watched?")
  - Happen immediately without confirmation

### Undo Capability

- Consider adding an "undo" option after marking episodes/seasons as watched
- Implement via toast notification with undo button (5-second window)

### Success Feedback

- Define feedback mechanisms when marking episodes:
  - Toast notification with message
  - Subtle animation on the card
  - Haptic feedback (vibration)
  - Combination of the above

### Season Completion Celebration

- Consider a visual celebration/notification when completing a season
- Could include achievement badge, special message

### Loading States

- Specify loading indicators for:
  - Fetching season data on TV show detail screen
  - Fetching episode data when opening season
  - Saving watch status changes to Firestore

---

## Data & Functionality

### Watch History Timestamp

- Clarify if you're storing when an episode was marked as watched
- Enables potential features: watch history timeline, recently watched, etc.

### Progress Calculation Logic

- Define how progress is calculated:
  - Simple count of watched episodes
  - Consider only aired episodes (exclude future episodes)
  - Handle special episodes differently

### Unaired Episodes Handling

- Specify how episodes that haven't aired yet should be handled:
  - Exclude from progress calculation
  - Show as "not available" or grayed out
  - Include in total but mark as unavailable

### Special Episodes (Season 0)

- Clarify handling of Season 0 (specials, extras, behind-the-scenes):
  - Include in horizontal season list
  - Track progress separately
  - Display differently or at the end

### Real-time Sync

- Specify whether changes should sync in real-time across the app:
  - Update show detail screen immediately when navigating back from episode list
  - Refresh season progress bars automatically
  - Sync across devices if user is logged in on multiple devices

---

## Navigation & Structure

### Episode List Screen Header

- Define header content:
  - Show title
  - Season number
  - Overall season progress (e.g., "6/10 watched")
  - Back button
  - "Mark All Watched" button

### State Preservation

- Clarify if scroll position should be preserved when navigating between screens
- Important for user experience when browsing multiple seasons

---

## Data Management

### Firestore Data Structure

- Document the data structure format:
  - Per-user watched status (user-specific collections)
  - Show → Season → Episode hierarchy
  - Watched episodes stored as array or map
  - Include timestamp and progress metadata

### Offline Support

- Specify behavior when marking episodes watched without internet connection:
  - Queue changes locally
  - Show "pending sync" indicator
  - Sync when connection restored
  - Handle conflicts if data changed on server

### Data Efficiency

- Consider data fetching strategy:
  - Fetch all episode details upfront
  - Lazy-load per season (fetch when user opens season)
  - Cache frequently accessed season data

---

## Additional Features to Consider

### Quick Mark from Season Card

- Option to long-press a season card to mark all episodes as watched
- Bypasses opening the episode list screen
- Show confirmation dialog for this action

### Overall Show Progress

- Display overall show progress at the show level
- Example: "Season 3 - 45/100 episodes watched across all seasons"
- Could appear in the header or summary section

### Filter and Sort Options

- Ability to filter episode list:
  - Show only unwatched episodes
  - Show only watched episodes
  - Show all episodes
- Sort options (by episode number, air date, etc.)

### Next Episode Highlight

- Automatically highlight or scroll to the next unwatched episode when opening a season
- Helps users quickly resume where they left off

### Episode Notes and Ratings

- Space for users to add personal notes per episode
- Optional rating system (stars or thumbs up/down)
- Could be used for recommendations or personal tracking

### Bulk Actions

- Select multiple episodes to mark as watched at once
- Useful for binge-watching scenarios
- Checkbox selection mode in episode list

### Watch Statistics

- Track viewing statistics:
  - Total episodes watched
  - Watch time (if episode runtime is available)
  - Shows completed
  - Current streak (consecutive days watching)

---

## Implementation Priorities

### Phase 1 (MVP)

- Horizontal season list on show detail screen
- Episode list screen with individual episode tracking
- Basic watch/unwatch toggle functionality
- Firestore persistence
- Simple progress bars

### Phase 2 (Enhanced UX)

- Visual indicators for watched state
- Mark all watched functionality
- Loading states and error handling
- Success feedback (toast notifications)

### Phase 3 (Advanced Features)

- Offline support
- Undo capability
- Season completion celebrations
- Quick mark from long-press
- Filter and highlight next episode

---

## Technical Considerations

### Performance

- Optimize FlashList rendering for many seasons
- Implement efficient Firestore queries (batch reads/writes)

### Accessibility

- Ensure all interactive elements are accessible
- Provide clear labels for screen readers

### Error Handling

- Handle network failures gracefully
- Provide retry mechanisms
- Clear error messages for users
