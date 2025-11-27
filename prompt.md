I have an issue with my Expo Router app navigation. When I navigate from a tab screen to a detail screen (movie details or TV show details), the bottom tab bar disappears. I need the tab bar to remain visible on ALL screens, including detail screens, so users can easily navigate between tabs without having to go back multiple times.

## Current Problem

- Bottom tab bar is visible on: Home, Search, Library, Profile (main tab screens)
- Bottom tab bar disappears on: Movie detail screens, TV show detail screens, cast detail screens, season/episode screens
- Users have to press back button multiple times to get back to tabs

## Desired Behavior

The bottom tab bar should remain visible and accessible on ALL screens in the app, including:

- Movie detail screens
- TV show detail screens
- Cast/person detail screens
- Season and episode screens
- ANY other screen users navigate to

## Solution Requirements

### Option 1: Nested Stack Navigation (Preferred)

Restructure the navigation so that detail screens are nested within each tab's stack navigator:

- Each tab (Home, Search, Library, Profile) should have its own stack navigator
- Detail screens should be part of each tab's stack, not separate routes
- This way the tab bar persists because we're navigating within a tab's stack
- Users can navigate from Home → Movie Detail → Cast Detail and still see tabs

**Example structure:**

```
(tabs)/
  - Each tab file should actually be a stack navigator
  - Home tab stack: Home Screen → Movie Detail → TV Detail → Cast Detail
  - Search tab stack: Search Screen → Movie Detail → TV Detail → Cast Detail
  - Library tab stack: Library Screen → Movie Detail → TV Detail → Cast Detail
  - Profile remains single screen
```

### Option 2: Shared Detail Screens (Alternative)

If you prefer the current structure with detail screens outside tabs:

- Configure the tab navigator to show the tab bar on ALL screens
- Set `tabBarStyle` to not hide on specific routes
- Ensure detail screens are still accessible from any tab

### Implementation Details

1. **Refactor each tab to be a stack navigator:**
   - Instead of having detail screens as separate routes outside tabs
   - Make each tab its own stack that contains the tab screen + all possible detail screens
   - This means movie/TV/cast detail screens will exist in multiple stacks (one per tab)

2. **Shared Detail Components:**
   - Keep the actual detail screen components in a shared location
   - Import and use them in each tab's stack
   - This avoids code duplication

3. **Navigation Updates:**
   - Update all navigation calls to use the current stack's routes
   - When on Home tab and navigating to movie detail, stay in Home stack
   - When on Search tab and navigating to movie detail, stay in Search stack

4. **Tab Bar Configuration:**
   - Ensure tab bar is never hidden
   - Tab bar should remain visible and functional on all screens
   - Active tab should stay highlighted even when viewing detail screens

## Expected Result

- User is on Home tab
- User taps a movie → sees movie detail screen with tab bar at bottom
- User taps cast member → sees cast detail with tab bar at bottom
- User can tap Search tab → immediately goes to Search screen
- User can tap any tab at any time without going back first

## Additional Notes

- Keep the back button in headers for going back within a stack
- Active tab indicator should persist when viewing detail screens in that tab's stack
- This is the standard pattern used by apps like Netflix, Disney+, etc.

Please restructure the navigation to implement this pattern. Maintain all existing functionality but ensure the tab bar is always visible and accessible.
