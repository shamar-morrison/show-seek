# Feature: "For You" Personalized Recommendations

## Context

Now that we have a Home Screen Drawer with a "For You" button, we need to implement the destination screen. This screen will provide users with a personalized content feed based on their tastes, derived from their high-rated movies and TV shows.

## Objective

Create a dynamic, personalized recommendation screen at `app/(tabs)/home/for-you.tsx` that uses the user's rating history to generate tailored content sections.

## Impacted Files

- `app/(tabs)/home/for-you.tsx` (New Route)
- `src/components/HomeDrawer.tsx` (Update the "For You" item to navigate)
- `src/api/tmdb.ts` (Already has recommendation methods)

## Requirements

### 1. Data Logic: Finding "Seed" Content

The system needs to identify what the user likes to generate recommendations.

- **Hook:** Use `useRatings()` to get the user's history.
- **Filtering:**
  - Filter for items with a rating of **8 or higher**.
  - Exclude episodes (focus on Movies and TV Shows for seeds).
- **Selection:**
  - Sort by `ratedAt` (descending).
  - Select the **top 3-5 most recent** high-rated items to serve as "Seed" media.

### 2. Data Fetching: TMDB Recommendations

For each "Seed" item:

- Call `tmdbApi.getRecommendedMovies(id)` or `tmdbApi.getRecommendedTV(id)`.
- Use `useQuery` or `useQueries` (from TanStack Query) to fetch these in parallel.

### 3. UI Design

**Header:**

- Standard back button and "For You" title.

**Main Feed:**

- **Dynamic Sections:** Render a horizontal list (like `HomeListSection`) for each seed item.
- **Section Title:** "Because you loved [Media Title]"
- **Hidden Gems Section:** (Optional/Bonus)
  - Fetch "Top Rated" movies for the user's most frequent genres.
  - Filter for items with `popularity < 50` but `vote_average > 7.5`.
  - Title: "Hidden Gems for You".

**Empty State:**

- If the user has no items rated >= 8:
  - Display a "Not enough data" illustration/state.
  - Message: "Rate your favorite movies and shows to see personalized recommendations here!"
  - Button: "Go to Discover" (navigates to the Discover tab).

### 4. Navigation

- Ensure the "For You" button in the `HomeDrawer` navigates to `/(tabs)/home/for-you`.

## Implementation Steps

1.  **Create `app/(tabs)/home/for-you.tsx`:**
    - Setup basic screen layout with `SafeAreaView` and `ScrollView`.
    - Integrate `useRatings` hook.
    - Implement the logic to extract seed items.

2.  **Fetch Recommendations:**
    - Use `useQuery` inside the for-you screen to fetch data for the identified seeds.
    - Handle loading states and caching (show skeletons for each section).

3.  **Render Sections:**
    - Reuse `HomeListSection` or its internal rendering logic to display the results.

4.  **Polish:**
    - Add haptic feedback when entering the screen.
    - Ensure smooth transitions and empty state handling.

## Edge Cases

- **Guest Users:** If the user is a guest/anonymous, show a "Sign In" CTA instead of recommendations.
- **Low Data:** If only 1 item is rated highly, show 1 recommendation section and 2-3 "Popular" sections to fill the screen.
