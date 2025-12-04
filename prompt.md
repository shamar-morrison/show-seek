## Context

The app currently has detail screens for movies and TV shows with a modular component architecture. I need to implement an episode detail screen that follows the same design patterns and component structure.

## Current State

- Movie and TV show detail screens exist with sectioned, reusable components
- Users can view seasons and episodes in a list format
- Episodes are displayed using a `<SeasonItem />` component
- Episodes have a "mark as watched/unwatched" button for tracking progress
- Need to add ability to view individual episode details in a dedicated screen

## Feature Requirements

### Navigation Behavior

**Trigger:**

- User taps anywhere on the `<SeasonItem />` component
- **Exception:** Tapping the "mark as watched/unwatched" button should NOT navigate to the detail screen (this button performs its own action)

**Implementation:**

- Wrap the `<SeasonItem />` content in a touchable area
- Exclude the watched/unwatched button from the touchable area (use separate Pressable/TouchableOpacity)
- Pass episode data (episode ID, season number, show ID) to the detail screen via navigation params
- Use standard React Navigation push/navigate method

### Screen Structure & Layout

**Overall Design:**
The episode detail screen should mirror the UI/UX of the existing movie and TV show detail screens with these characteristics:

1. **Scrollable Content:**
   - Single ScrollView or FlashList containing all sections
   - Smooth scrolling performance
   - Sections load progressively if data is fetched asynchronously

2. **Hero Section (Top):**
   - Large episode still/thumbnail image (16:9 aspect ratio)
   - Episode title overlaid or positioned below image
   - Episode number and season (e.g., "S1 E5")
   - Air date
   - Runtime duration
   - Watch status indicator (watched/unwatched badge or icon)

3. **Action Buttons Row:**
   - "Mark as Watched/Unwatched" button (toggle functionality)
   - "Play Trailer" button (if trailer available)
   - "Share Episode" button
   - Buttons should match the style of movie/TV detail screen buttons

4. **Sectioned Components:**
   - Each section should be its own separate, reusable component
   - Consistent spacing and styling between sections
   - Sections should only render if data is available (conditional rendering)

### Component Sections to Implement

Create separate, reusable components for each of the following sections:

#### 1. **Episode Overview Component**

- **Content:**
  - Episode title (if not in hero)
  - Synopsis/plot summary
  - "Read more" expansion
  - Air date, runtime, episode number details
- **Styling:**
  - Match overview section from movie/TV detail screens

#### 2. **Episode Photos Component**

- **Content:**
  - Horizontal scrollable gallery of episode stills/screenshots
  - Tappable images that open in lightbox
- **Behavior:**
  - Smooth horizontal scroll
  - Thumbnail optimization
- **Fallback:**
  - Hide section if no photos available

#### 3. **Episode Videos Component**

- **Content:**
  - Clips, behind-the-scenes, or related videos
  - Video thumbnails with play button overlay
  - Video title and duration
  - Horizontal scrollable list
- **Behavior:**
  - Tapping opens video player or external link
  - Show video count
- **Fallback:**
  - Hide section if no videos available

#### 4. **Episode Reviews Component**

- **Content:**
  - User reviews or critic reviews from TMDB
  - Review excerpt with "Read more" option
  - Reviewer name and rating
  - Review date
  - Vertical list of 3-5 reviews with "View All" button
- **Behavior:**
  - Expandable review text
  - Link to full reviews or review detail page
- **Fallback:**
  - Show "No reviews yet" or hide section

#### 5. **Guest Cast Component**

- **Content:**
  - Cast members who appear in this specific episode
  - Horizontal scrollable list of cast cards
  - Cast member photo, name, character name
  - "View All" button if many cast members
- **Behavior:**
  - Tapping cast member navigates to actor/person detail screen
  - Show "Guest Star" or role designation
- **Fallback:**
  - Show main series cast if guest cast unavailable
  - Hide section if no cast data available

#### 6. **Episode Crew Component (Optional)**

- **Content:**
  - Director, writer, cinematographer for this episode
  - Horizontal or vertical list format
  - Crew member photo, name, role
- **Fallback:**
  - Hide if no crew data available

#### 7. **Related Episodes Component (Optional)**

- **Content:**
  - Other episodes from the same season
  - "Next Episode" and "Previous Episode" cards
  - Horizontal scrollable list
- **Behavior:**
  - Tapping navigates to that episode's detail screen
  - Show watch status on episode cards
- **Fallback:**
  - Hide if only one episode in season

### Data Requirements

**Episode Data to Fetch:**

- Episode ID, season number, episode number
- Episode title and overview/synopsis
- Episode still/thumbnail image (high resolution)
- Air date and runtime
- Episode rating/vote average (if available)
- Episode photos/stills collection
- Episode videos/clips (trailers, behind-the-scenes)
- Episode guest cast and crew
- Episode reviews
- Watch status from Firestore (user-specific)

**API Integration:**

- Fetch watch status from Firestore
- Handle API errors gracefully with fallback UI

### Technical Implementation Guidelines

**Component Architecture:**

1. **Main Screen Component:**
   - `EpisodeDetailScreen.tsx` - Main screen container
   - Handles data fetching and state management
   - Orchestrates child components

2. **Section Components:**
   - `EpisodeOverview.tsx` - Overview/synopsis section
   - `EpisodePhotos.tsx` - Photo gallery section
   - `EpisodeVideos.tsx` - Video clips section
   - `EpisodeReviews.tsx` - Reviews section
   - `GuestCast.tsx` - Guest cast section
   - `EpisodeCrew.tsx` - Crew section (optional)
   - `RelatedEpisodes.tsx` - Related episodes (optional)

3. **Shared Components:**
   - Reuse existing components from movie/TV detail screens where possible
   - `DetailHeader.tsx` - Hero section with image and title
   - `ActionButtons.tsx` - Action button row
   - `SectionHeader.tsx` - Section titles with "View All" links
   - `CastCard.tsx` - Individual cast member cards
   - `ReviewCard.tsx` - Individual review cards

**Loading States:**

- Show skeleton loaders for each section while data loads
- Shimmer effect on image placeholders

**Error Handling:**

- Handle network errors gracefully
- Show error message with retry button
- Fallback to cached data if available

**Performance Optimization:**

- Memoize components with React.memo
- Use FlashList for horizontal scrolling sections if needed

### Navigation Configuration

**Screen Options:**

- Screen title: Episode title or "Episode Details"
- Header back button
- Optional share button in header
- Match header styling with other detail screens

### User Interaction Patterns

**SeasonItem Component Modification:**

1. Wrap entire `<SeasonItem />` in a Pressable/TouchableOpacity
2. Extract "mark as watched" button into separate Pressable
3. Use `onPress` for navigation, ensure button has `onPress` that stops propagation
4. Proper hitbox spacing to avoid accidental clicks

**Share Functionality:**

- Share episode details with title, show name, episode number
- Use similar share functionality on the movie/tv show detail screen

### Styling & Design Consistency

**Colors:**

- Match movie/TV detail screen color scheme

### Edge Cases & Fallbacks

1. **Missing Data:**
   - Hide sections with no data (don't show empty states)
   - Provide sensible defaults for missing fields
   - Show "N/A" if critical data missing

2. **Long Text:**
   - Truncate long titles with ellipsis
   - "Read more" for long overviews
   - Scrollable containers for long lists

3. **Images:**
   - Error handling for failed image loads

4. **API Failures:**
   - User-friendly error messages

5. **Network Offline:**
   - Show offline banner
   - Display cached data if available
   - Disable actions that require network

6. **Special Episodes:**
   - Handle Season 0 (specials) appropriately
   - Show appropriate metadata for special episodes
   - Adjust layout if certain data not available

### Testing Checklist

After implementation, verify:

- [ ] Navigation from SeasonItem works correctly
- [ ] Watched/unwatched button doesn't trigger navigation
- [ ] All sections load with proper data
- [ ] Horizontal scrolling is smooth
- [ ] Sections hide when data unavailable
- [ ] Loading states display properly
- [ ] Error states handled gracefully
- [ ] Back navigation works correctly
- [ ] Share functionality works
- [ ] Consistent styling with movie/TV detail screens
- [ ] Performance is smooth (no lag during scroll)
- [ ] Works with different episode types (regular, special)

### Success Criteria

The feature is complete when:

1. Users can navigate to episode detail screen from episode list
2. Watched/unwatched button doesn't trigger navigation
3. All section components render with appropriate data
4. Screen matches movie/TV detail screen design consistency
5. All interactions are smooth and performant
6. Error handling and loading states work correctly
7. Components are reusable and follow existing patterns
8. Code follows project conventions and best practices

Please implement this feature following React Native/Expo best practices for Android, ensuring optimal performance, code reusability, and design consistency with existing detail screens.
