## Overview

Create a new screen that displays all TV shows the user has in-progress episodes for, showing watch progress, next episode information, and time remaining. This is an aggregation/dashboard view for active TV show tracking.

---

## Technical Context

### Firebase Structure

- **Watch data location:** `users/{userId}/episode_tracking/{tvShowId}`
- **Document structure:**
  - `episodes`: Map with keys like `"1_1"` (format: `season_episode`)
  - Each episode contains: `watchedAt`, `episodeId`, `episodeNumber`, `seasonNumber`, and metadata
  - `metadata`: Contains `tvShowName`, `posterPath`, `lastUpdated` timestamp
- **Service:** Use existing `src/services/EpisodeTrackingService.ts`

### TMDB API Integration

- **Import from:** `src/api/tmdb.ts`
- **Use existing methods:**
  - `tmdbApi.getTVShowDetails(id)`
  - `tmdbApi.getSeasonDetails(tvId, seasonNumber)`
  - `tmdbApi.getEpisodeDetails(...)`
- **Do NOT create new API fetchers**

### Design System

- **List component:** Use `FlashList` from `@shopify/flash-list` (NOT FlatList)
- **Reusable components:**
  - `MediaImage` (for posters/backdrops)
  - `AnimatedScrollHeader`
  - `RatingButton`
  - Located in `src/components`
- **Icons:** Use `lucide-react-native` (e.g., `Check`, `Plus`, `Play`)
- **Styling:**
  - Follow patterns in `src/components/detail/detailStyles.tsx`
  - Use `StyleSheet.create` for styles
  - Import colors from `src/constants/theme.ts` (COLORS constant)

---

## Requirements

### Screen Location

Create a new section called "Progress" in the library screen.

### Data to Display Per TV Show Card

Each card should show:

1. **Show Poster** (use MediaImage component)
2. **Show Title**
3. **Last Watched Episode:**
   - Format: "S{season}E{episode}: {episode_title}"
   - Example: "S2E5: The One with Five Steaks"
4. **Next Episode in Sequence:**
   - Display next unwatched episode in the same season OR first episode of next season
   - Format: "Next: S{season}E{episode}: {episode_title}"
   - If no next episode exists (show fully watched or no more released episodes): Show "Caught up!" or "Completed"
5. **Progress Bar:**
   - Visual progress indicator (e.g., horizontal bar)
   - Percentage text: "{percentage}% complete"
6. **Time Remaining:**
   - Format: "{hours}h {minutes}m left" or "{minutes}m left" (if < 1 hour)
   - Based on sum of all unwatched episode runtimes
   - If completed: Don't show or show "0m left"

### Calculations Required

**Completion Percentage:**

```
(total watched episodes / total released episodes) × 100
```

- Only count released episodes/seasons (check air dates)
- Exclude Season 0 (specials) unless explicitly watched
- Round to whole number

**Time Remaining:**

```
Sum of runtimes for all unwatched episodes
```

- Fetch episode runtimes from TMDB
- Only include released episodes
- Convert total minutes to hours/minutes format

**Next Episode Logic:**

1. Find last watched episode's season and episode number
2. Check if next episode in same season exists and is released
3. If not, check first episode of next season (if released)
4. If neither exists: User is caught up

### Sorting

- Sort by `lastUpdated` timestamp (most recently watched at top)
- Note: Additional sorting options will be added in future iterations

### Filtering

- **Only show in-progress shows:** Shows where user has watched at least one episode BUT has NOT completed all released episodes
- Exclude shows where all available episodes are marked as watched

### User Interactions

**Tap on Card:**

- Navigate to `TVSeasonsScreen.tsx` and scroll to the season of the show

**Optional (If Time Permits):**

- Pull-to-refresh to update show data from TMDB

### Error Handling

Handle gracefully:

- **TMDB API failures:** Show cached data if available, or display "Unable to load details" with retry option
- **Missing episode data:** Skip that episode in calculations, don't crash
- **Missing runtime data:** Estimate based on average episode length or show as "Unknown"
- **Firebase connection issues:** Show offline indicator, use last cached data
- **No in-progress shows:** Display empty state with message like "No shows in progress. Start watching something!"

---

## Implementation Guidelines

### Suggested File Structure

```
src/components/watching/
  └── WatchingShowCard.tsx    (individual show card component)
  └── WatchingEmptyState.tsx  (empty state component)

src/hooks/
  └── useCurrentlyWatching.ts (custom hook for data fetching/calculations)
```

### Data Flow

1. **Fetch all episode tracking documents** for current user from Firebase
2. **Filter** to only in-progress shows (has watched episodes but not completed)
3. **For each show:**
   - Fetch full TV show details from TMDB (seasons, episode counts) or use cached data if available
   - Fetch episode details for watched episodes to get titles or use cached data if available
   - Calculate completion percentage
   - Determine next unwatched episode
   - Calculate total time remaining
4. **Sort** by `lastUpdated` timestamp
5. **Render** using FlashList for performance

### Performance Considerations

- Implement pagination or virtualization (FlashList handles this)
- Consider loading show data progressively (show basic info first, then calculate details)
- Debounce TMDB API calls if user has many shows
- Cache calculations to avoid re-computing on every render

---

## Testing Checklist

- [ ] Screen displays correctly when user has multiple in-progress shows
- [ ] Empty state displays when user has no in-progress shows
- [ ] Completion percentage calculates correctly
- [ ] Time remaining calculates correctly (accounts for all unwatched episodes)
- [ ] Next episode displays correctly (same season or next season)
- [ ] "Caught up" state shows when no more released episodes
- [ ] Tapping card navigates to correct season screen
- [ ] Handles shows with only Season 1 watched
- [ ] Handles shows where user skipped episodes (doesn't assume sequential watching)
- [ ] Gracefully handles TMDB API errors
- [ ] Gracefully handles missing episode runtime data
- [ ] Performance is smooth with 50+ shows
- [ ] Sorting by last watched date works correctly
- [ ] Only released episodes are counted (respects air dates)

---

## Notes

- **Future Enhancement:** A sorting/filtering system will be added later (don't implement now)
- **Specials:** Exclude Season 0 from calculations unless user explicitly watched them
- **Future Seasons:** Don't count unannounced/unreleased seasons in progress calculations
- **Edge Cases:** Some shows have inconsistent episode numbering or missing data on TMDB—handle these gracefully

---

## Success Criteria

The feature is complete when:

1. User can see all their in-progress TV shows in one screen
2. Each show displays accurate progress, next episode, and time remaining
3. Tapping a show navigates to the correct season
4. The screen performs well even with many shows
5. All error states are handled gracefully
6. The UI follows the existing app design patterns and styling
