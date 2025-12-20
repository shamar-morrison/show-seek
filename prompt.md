# Implement History/Stats Screen with Monthly Activity Breakdown

## Feature Context

Users want to see a breakdown of their activity over time - what they've watched, rated, and added to lists, with various metrics and insights.

## Current Firebase Structure

Based on the Firestore screenshots provided:

## Feature Requirements

### Screen Placement

- Add a "View Stats" or "History" button in the **Library screen** within the **"My Lists" section**
- When tapped, navigate to the History/Stats screen

### Time Range

- Display stats for the **last 6 months** by default
- Group data by month (e.g., "December 2025", "November 2025", etc.)

### Visualization Style

- **Simple numerical stats with icons** (no complex charts/graphs)
- Clean, easy-to-read layout with clear sections
- Use meaningful icons for each stat type (e.g., 📺 for watched, ⭐ for rated, ➕ for added to lists)

### Metrics to Display

You should first **verify which data is actually being tracked** in Firebase, then implement the following metrics:

1. **Monthly Activity Summary** (for each of the last 6 months or as far back as the data in firebase goes):
   - Number of movies/shows watched (from `episode_tracking` `watchedAt`)
   - Number of items rated (from `ratings` `ratedAt`)
   - Number of items added to lists (from `lists` items `addedAt`)
   - Show comparison to previous month (e.g., "+12% vs November")

2. **Average Rating Per Month**:
   - Calculate average of all ratings given each month
   - Show trend (improving/declining)
   - Display with star icon and numerical value

3. **Favorite Genres Over Time**:
   - Based on `genre_ids` from rated/watched items
   - Show top 3 genres per month or overall for 6-month period
   - May need to map genre IDs to genre names (use TMDB genre list)

4. **Most Active Day/Time Patterns** (if timestamp data is available):
   - Identify which day of the week user is most active
   - Identify time of day patterns (morning, afternoon, evening, night)
   - Based on `watchedAt`, `ratedAt`, `addedAt` timestamps

5. **Streak Tracking**:
   - Current streak: Consecutive days with activity (watched/rated/added)
   - Longest streak in the 6-month period
   - Display with fire icon 🔥

6. **Comparison to Previous Months**:
   - For each metric, show percentage increase/decrease
   - Use up/down arrows or +/- indicators
   - Color code: green for increase, red for decrease (neutral for neutral)

### Detail Level

Users should be able to:

1. **See aggregate numbers** for each month at a glance
2. **Tap on a month** to see detailed breakdown:
   - List of all movies/shows watched that month
   - List of all ratings given that month
   - List of all items added to lists that month
   - Each item should show: poster, title, rating (if applicable), date

### Data Sources

Aggregate data from (will need to confirm):

- **Episode Tracking** (`episode_tracking` collection, `watchedAt` field)
- **Ratings** (`ratings` collection, `ratedAt` field)
- **List Additions** (`lists` collection, `items` map, `addedAt` field)

## Implementation Tasks

### 1. Data Verification Step (Critical First Step!)

Before implementing, you must:

- Query all three collections (`episode_tracking`, `ratings`, `lists`) for the current user
- Verify which timestamp fields exist and are being populated:
  - `watchedAt` in episode_tracking
  - `ratedAt` in ratings
  - `addedAt` in list items
- Check if genre_ids or genre objects are available in items
- Verify timestamp format (Unix timestamp in milliseconds vs Firestore Timestamp)
- Document any missing data fields that would prevent certain metrics

**Output a report** of what data is available and which metrics can be implemented.

### 2. Create History Data Service

Create a service to fetch and aggregate user activity (this is just a suggestion, feel free to edit to your liking):

```typescript
// services/historyService.ts

interface MonthlyStats {
  month: string; // "2025-12" format
  monthName: string; // "December 2025"
  watched: number;
  rated: number;
  addedToLists: number;
  averageRating: number;
  topGenres: string[]; // Genre names
  comparisonToPrevious: {
    watched: number; // percentage
    rated: number;
    addedToLists: number;
  };
}

interface HistoryData {
  monthlyStats: MonthlyStats[]; // Last 6 months
  currentStreak: number; // Days
  longestStreak: number; // Days
  mostActiveDay: string; // "Monday", "Tuesday", etc.
  mostActiveTimeOfDay: string; // "Morning", "Afternoon", "Evening", "Night"
  totalWatched: number;
  totalRated: number;
  totalAddedToLists: number;
}

async function fetchUserHistory(userId: string): Promise<HistoryData> {
  // 1. Fetch episode tracking data
  // 2. Fetch ratings data
  // 3. Fetch lists data
  // 4. Filter for last 6 months
  // 5. Group by month
  // 6. Calculate all metrics
  // 7. Return aggregated data
}
```

### 3. Implement Helper Functions

**Month Grouping:**

```typescript
function groupByMonth(timestamps: number[]): Map<string, number> {
  // Group timestamps by "YYYY-MM" format
  // Return map of month -> count
}
```

**Streak Calculation:**

```typescript
function calculateStreaks(dates: Date[]): { current: number; longest: number } {
  // Sort dates chronologically
  // Calculate consecutive days
  // Return current and longest streak
}
```

**Day/Time Pattern Analysis:**

```typescript
function analyzeDayTimePatterns(timestamps: number[]): {
  mostActiveDay: string;
  mostActiveTimeOfDay: string;
} {
  // Extract day of week from timestamps
  // Extract hour from timestamps
  // Determine most common day and time period
}
```

### 4. Build Stats Screen UI

**Screen Structure:**

```
┌─────────────────────────────────────────┐
│  ← Stats & History                      │
├─────────────────────────────────────────┤
│  📊 Last 6 Months Overview              │
├─────────────────────────────────────────┤
│  🔥 Current Streak: 7 days              │
│  🏆 Longest Streak: 23 days             │
├─────────────────────────────────────────┤
│  📅 Most Active: Saturdays              │
│  🕐 Preferred Time: Evening              │
├─────────────────────────────────────────┤
│  📺 Total Watched: 142                   │
│  ⭐ Total Rated: 98                      │
│  ➕ Total Added: 67                      │
├─────────────────────────────────────────┤
│  Monthly Breakdown                      │
├─────────────────────────────────────────┤
│  > December 2025                    →   │
│    📺 45 watched  ⭐ 4.2 avg  ➕ 12    │
│    📈 +15% from last month              │
├─────────────────────────────────────────┤
│  > November 2025                    →   │
│    📺 39 watched  ⭐ 4.0 avg  ➕ 10    │
│    📈 +8% from last month               │
├─────────────────────────────────────────┤
│  > October 2025                     →   │
│    📺 36 watched  ⭐ 4.1 avg  ➕ 15    │
│    📉 -3% from last month               │
└─────────────────────────────────────────┘
```

**UI Components:**

- Overall summary cards at top (streaks, patterns, totals)
- Expandable/tappable month sections
- Icons for each stat type
- Color-coded comparison indicators (green/red arrows)
- Clean spacing and typography

### 5. Month Detail View

When user taps on a month, show detailed view:

```
┌─────────────────────────────────────────┐
│  ← December 2025                        │
├─────────────────────────────────────────┤
│  📊 Summary                             │
│  📺 45 watched  ⭐ 4.2 avg  ➕ 12      │
├─────────────────────────────────────────┤
│  🎬 Top Genres                          │
│  1. Drama  2. Comedy  3. Action         │
├─────────────────────────────────────────┤
│  📺 Watched This Month (45)            │
├─────────────────────────────────────────┤
│  [Poster] Game of Thrones               │
│           Season 1, Episode 1           │
│           Watched: Dec 5, 2025          │
├─────────────────────────────────────────┤
│  [Poster] The Matrix                    │
│           Watched: Dec 8, 2025          │
├─────────────────────────────────────────┤
│  ⭐ Rated This Month (30)              │
├─────────────────────────────────────────┤
│  [Poster] Inception                     │
│           Rating: ⭐⭐⭐⭐⭐           │
│           Rated: Dec 10, 2025           │
├─────────────────────────────────────────┤
│  ➕ Added to Lists (12)                │
├─────────────────────────────────────────┤
│  [Poster] Breaking Bad                  │
│           Added to: Watchlist           │
│           Added: Dec 12, 2025           │
└─────────────────────────────────────────┘
```

**Implementation:**

- Add a button in the "My Lists" section header
- On press: navigate to Stats screen

### 7. Data Fetching & Caching

**Fetching Strategy:**

- Show loading skeleton while fetching
- Cache results to avoid refetching on back/forth navigation

**Firestore Queries:**

```typescript
// Episode tracking
const episodeTrackingRef = firestore.collection('episode_tracking').doc(userId);

// Ratings (need to query all ratings docs for this user)
const ratingsRef = firestore
  .collection('ratings')
  .where('userId', '==', userId) // If userId field exists
  .where('ratedAt', '>=', sixMonthsAgo)
  .get();

// Lists (need to query all lists owned by user)
const listsRef = firestore
  .collection('lists')
  .where('userId', '==', userId) // Verify this field exists
  .get();
```

**Important:** Based on the Firebase structure, you may need to adjust these queries. The `ratings` collection uses composite IDs (`episode-X-Y-Z`, `movie-X`), so you might need to fetch all ratings documents and filter client-side.

### 8. Handle Edge Cases

**Missing Data:**

- If no data for a month, show "No activity this month"
- If timestamps are missing, show "Unable to calculate"
- Gracefully degrade - show metrics that ARE available

**Performance:**

- Paginate month detail views if user has hundreds of items
- Lazy load detailed month data only when user taps
- Use FlashList for efficient rendering

**Empty States:**

- New users with no history: Show empty state with encouraging message
- Less than 6 months of data: Show available months only

### 9. Testing Checklist

- [ ] Verify all timestamp fields exist in Firebase
- [ ] Stats screen loads successfully
- [ ] Monthly stats display correctly for last 6 months
- [ ] Tapping a month shows detailed breakdown
- [ ] Genre mapping works correctly
- [ ] Streak calculation is accurate
- [ ] Day/time patterns are correct
- [ ] Comparison percentages are calculated correctly
- [ ] Navigation from Library screen works
- [ ] Loading states display properly
- [ ] Empty states display properly
- [ ] Performance is good with large datasets
- [ ] Works correctly with missing/incomplete data

## Implementation Priority

### Phase 1 (MVP):

1. Data verification - check what fields exist
2. Implement basic data fetching from all three sources
3. Create monthly grouping logic
4. Build simple stats screen with monthly breakdown
5. Add navigation from Library screen

### Phase 2:

6. Implement month detail view with item lists
7. Add comparison to previous month
8. Calculate and display streaks

### Phase 3:

9. Add favorite genres over time
10. Add day/time pattern analysis
11. Polish UI and animations
12. Add loading and empty states

### Phase 4:

13. Performance optimization
14. Caching implementation
15. Error handling refinement
16. Final testing

## Important Notes

1. **Data Structure Verification**: you MUST first verify the exact structure of the Firebase collections and which fields are available before implementing metrics.

2. **Timestamp Format**: Check if timestamps are Unix milliseconds or Firestore Timestamp objects and handle accordingly.

3. **User ID Association**: Verify how user IDs are associated with each collection

4. **Genre IDs**: Items in lists have `genre_ids` arrays - these need to be mapped to genre names using TMDB's genre list.

5. **Performance**: With 6 months of data, there could be hundreds of documents to process. Implement efficient querying and consider using Firebase indexes.

## Questions for you to Answer First

Before implementing, you should verify and document:

- [ ] What timestamp fields exist in each collection?
- [ ] How are user IDs associated with ratings documents?
- [ ] Are all three data sources (episode_tracking, ratings, lists) actively being populated?
- [ ] What is the timestamp format (Unix ms, Firestore Timestamp, ISO string)?
- [ ] Do we have access to genre_ids in all relevant documents?
- [ ] Is there a `userId` field in the lists collection?

Please implement this feature step by step, starting with data verification, then basic stats display, then adding more complex metrics. Let me know if you need any clarification!
